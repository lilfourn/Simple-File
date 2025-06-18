'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Upload, FolderPlus, FolderUp } from 'lucide-react'
import { createFolder } from '@/app/dashboard/file-organizer/actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ProgressToast } from '@/components/ui/progress-toast'
import { SimpleToast } from '@/components/ui/simple-toast'
import * as tus from 'tus-js-client'
import { createClient } from '@/utils/supabase/client'
import { ParallelUploadManager, UploadTask } from '@/utils/parallel-upload-manager'
import { FolderStructureProcessor } from '@/utils/folder-structure-processor'
import { StorageSessionManager } from '@/utils/storage-session-manager'

interface UploadPopoverProps {
  workspaceId: string
  parentId: string | null
  trigger: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface UploadItem {
  file: File
  path?: string[]
}

// Validate files before upload
function validateFile(file: File): string | null {
  // Skip system files and hidden files
  if (file.name.startsWith('.')) {
    return 'Hidden files are not allowed'
  }
  
  // Skip files with UUID-only names (system files)
  const uuidPattern = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i
  if (uuidPattern.test(file.name)) {
    return 'System files are not allowed'
  }
  
  // Skip empty files
  if (file.size === 0) {
    return 'Empty files are not allowed'
  }
  
  // Skip files larger than 5GB
  const maxSize = 5 * 1024 * 1024 * 1024 // 5GB
  if (file.size > maxSize) {
    return 'File size exceeds 5GB limit'
  }
  
  // Check for dangerous file types
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js']
  const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
  if (dangerousExtensions.includes(fileExt)) {
    return 'This file type is not allowed for security reasons'
  }
  
  return null // File is valid
}

export default function UploadPopoverTus({
  workspaceId,
  parentId,
  trigger,
  open,
  onOpenChange
}: UploadPopoverProps) {
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [showUploadOptions, setShowUploadOptions] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const uploadManagerRef = useRef<ParallelUploadManager>(new ParallelUploadManager(2))
  const folderProcessorRef = useRef<FolderStructureProcessor>(new FolderStructureProcessor())
  const currentBatchIdRef = useRef<string | null>(null)
  const sessionManagerRef = useRef<StorageSessionManager>(new StorageSessionManager())
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionManagerRef.current.stopAutoRefresh()
    }
  }, [])

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return

    setIsCreatingFolder(true)
    const toastId = `create-folder-${Date.now()}`
    
    try {
      toast(
        <ProgressToast 
          message='Creating folder...'
          progress={50}
        />,
        { id: toastId, duration: Infinity }
      )
      
      const result = await createFolder(workspaceId, parentId, newFolderName.trim())
      
      if (result.wasRenamed) {
        toast(
          <SimpleToast 
            message={`Folder created as "${result.name}" to avoid naming conflict`}
            type="info"
          />,
          { id: toastId, duration: 4000 }
        )
      } else {
        toast(
          <SimpleToast 
            message={`Folder "${result.name}" created successfully`}
            type="success"
          />,
          { id: toastId, duration: 4000 }
        )
      }
      
      setNewFolderName('')
      setShowNewFolder(false)
      onOpenChange?.(false)
      router.refresh()
    } catch (error) {
      console.error('Failed to create folder:', error)
      toast(
        <SimpleToast 
          message="Failed to create folder"
          type="error"
        />,
        { id: toastId, duration: 4000 }
      )
    } finally {
      setIsCreatingFolder(false)
    }
  }

  const createTusUploadHandler = async (task: UploadTask, batchId: string, folderId?: string): Promise<tus.Upload | null> => {
    // Get a fresh, valid session
    const { valid, session } = await sessionManagerRef.current.validateUploadSession()

    if (!valid || !session) {
      console.error('Invalid or expired session')
      uploadManagerRef.current.updateTaskStatus(batchId, task.id, 'error', 'Authentication required - please sign in again')
      return null
    }

    // Generate storage path
    const lastDotIndex = task.file.name.lastIndexOf('.')
    const hasExtension = lastDotIndex > 0 && lastDotIndex < task.file.name.length - 1
    const fileExt = hasExtension ? task.file.name.slice(lastDotIndex + 1) : 'txt'
    const fileName = crypto.randomUUID()
    const storagePath = `${session.user.id}/${fileName}.${fileExt}`

    // Get project ID from Supabase URL
    const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]

    const upload = new tus.Upload(task.file, {
      endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [2000, 5000, 10000, 20000, 30000], // Increased delays
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'user-files',
        objectName: storagePath,
        contentType: task.file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      parallelUploads: 1, // Disable parallel chunk uploads
      addRequestId: true, // Add request ID for debugging
      // Commented out debugging callbacks that were causing errors
      // onBeforeRequest and onAfterResponse removed due to API incompatibility
      onError: function (error) {
        const errorMessage = error?.message || 'Unknown upload error'
        console.error(`[TUS Upload Error] ${task.file.name}:`, {
          message: errorMessage,
          fileName: task.file.name,
          fileSize: task.file.size,
          fileType: task.file.type,
          originalResponse: error?.originalResponse ? {
            status: error.originalResponse.getStatus ? error.originalResponse.getStatus() : 'Unknown',
            body: error.originalResponse.getBody ? error.originalResponse.getBody() : 'No body'
          } : null,
          fullError: error
        })
        
        // Check for specific error types
        if (errorMessage.includes('unexpected response') || errorMessage.includes('429')) {
          uploadManagerRef.current.updateTaskStatus(batchId, task.id, 'error', 'Server overloaded - will retry')
        } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
          uploadManagerRef.current.updateTaskStatus(batchId, task.id, 'error', 'Authentication failed - please refresh and try again')
        } else if (errorMessage.includes('413') || errorMessage.includes('payload too large')) {
          uploadManagerRef.current.updateTaskStatus(batchId, task.id, 'error', 'File too large')
        } else {
          uploadManagerRef.current.updateTaskStatus(batchId, task.id, 'error', errorMessage)
        }
      },
      onProgress: function (bytesUploaded, bytesTotal) {
        uploadManagerRef.current.updateTaskProgress(batchId, task.id, bytesUploaded, bytesTotal)
      },
      onSuccess: async function () {
        console.log(`Upload finished for ${task.file.name}`)
        
        try {
          // Use pre-created folder ID or task's parent ID
          const finalParentId = folderId || task.parentId || parentId

          // Create file record
          const { error } = await supabase
            .from('nodes')
            .insert({
              user_id: session.user.id,
              workspace_id: workspaceId,
              parent_id: finalParentId,
              node_type: 'file',
              name: task.file.name,
              mime_type: task.file.type,
              size: task.file.size,
              storage_object_path: storagePath
            })

          if (error) throw error

          uploadManagerRef.current.updateTaskStatus(batchId, task.id, 'complete')
        } catch (error) {
          console.error('Failed to create database record:', error)
          uploadManagerRef.current.updateTaskStatus(batchId, task.id, 'error', 'Failed to save file record')
        }
      }
    })

    // Start the upload
    upload.start()
    return upload
  }

  const processUploadBatch = async (items: UploadItem[], toastId: string): Promise<{ successCount: number; totalCount: number; skippedCount: number }> => {
    try {
      // Filter out invalid files
      const validItems: UploadItem[] = []
      const skippedFiles: string[] = []
      
      items.forEach(item => {
        const validationError = validateFile(item.file)
        if (validationError) {
          console.log(`[File Skipped] ${item.file.name}: ${validationError}`)
          skippedFiles.push(item.file.name)
        } else {
          validItems.push(item)
        }
      })
      
      if (skippedFiles.length > 0) {
        console.log(`[Upload Batch] Skipped ${skippedFiles.length} invalid files:`, skippedFiles)
      }
      
      if (validItems.length === 0) {
        toast(
          <SimpleToast 
            message="No valid files to upload"
            type="info"
          />,
          { duration: 4000 }
        )
        return { successCount: 0, totalCount: items.length, skippedCount: skippedFiles.length }
      }
      
      // Start auto-refresh for session during uploads
      sessionManagerRef.current.startAutoRefresh()
      
      // Get session first
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast(
          <SimpleToast 
            message="Authentication required"
            type="error"
          />,
          { duration: 4000 }
        )
        return { successCount: 0, totalCount: items.length, skippedCount: skippedFiles.length }
      }

      // Extract folder paths and create folder structure first
      const folderPaths = folderProcessorRef.current.extractFolderPaths(validItems)
      let folderMap = new Map<string, string>()
      
      if (folderPaths.length > 0) {
        toast(
          <ProgressToast 
            message="Creating folder structure..."
            progress={0}
            onCancel={() => handleCancelUpload(toastId)}
          />,
          { id: toastId, duration: Infinity }
        )

        folderMap = await folderProcessorRef.current.createFolderStructure(
          workspaceId,
          parentId,
          folderPaths,
          session.user.id
        )
      }

      // Prepare tasks with pre-created folder IDs
      const tasks = validItems.map(item => {
        let folderId: string | undefined
        if (item.path && item.path.length > 0) {
          const folderPath = item.path.join('/')
          folderId = folderMap.get(folderPath)
        }
        
        return {
          file: item.file,
          path: item.path,
          parentId: folderId || parentId
        }
      })

      // Create upload batch
      const batchId = uploadManagerRef.current.createBatch(tasks, {
        concurrencyLimit: 2,
        onProgress: (progress, uploadedBytes, totalBytes) => {
          const message = skippedFiles.length > 0 
            ? `Uploading ${validItems.length} files (${skippedFiles.length} skipped)...`
            : `Uploading ${validItems.length} files...`
          toast(
            <ProgressToast 
              message={message}
              progress={progress}
              onCancel={() => handleCancelUpload(toastId)}
            />,
            { id: toastId, duration: Infinity }
          )
        }
      })

      // Store current batch ID for cancellation
      currentBatchIdRef.current = batchId

      // Process uploads in parallel
      const result = await uploadManagerRef.current.processBatch(batchId, async (task) => {
        const taskFolderId = task.parentId !== parentId ? task.parentId : undefined
        return await createTusUploadHandler(task, batchId, taskFolderId as string | undefined)
      })

      return { ...result, skippedCount: skippedFiles.length }

    } catch (error) {
      console.error('Upload batch error:', error)
      return { successCount: 0, totalCount: items.length, skippedCount: skippedFiles.length }
    } finally {
      // Stop auto-refresh when uploads complete
      sessionManagerRef.current.stopAutoRefresh()
    }
  }

  const handleUploadFiles = () => {
    // Close popover immediately
    onOpenChange?.(false)
    
    // Create and trigger file input
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length === 0) return
      
      const toastId = `upload-${Date.now()}`
      const items = files.map(file => ({ file }))
      
      // Process uploads in parallel
      const { successCount, totalCount, skippedCount } = await processUploadBatch(items, toastId)
      
      // Show final result
      const validCount = totalCount - skippedCount
      if (successCount === validCount && validCount > 0) {
        const message = skippedCount > 0
          ? `Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}! (${skippedCount} skipped)`
          : `Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}!`
        toast(
          <SimpleToast 
            message={message}
            type="success"
          />,
          { id: toastId, duration: 4000 }
        )
      } else if (successCount > 0) {
        const message = skippedCount > 0
          ? `Uploaded ${successCount} of ${validCount} files (${skippedCount} skipped)`
          : `Uploaded ${successCount} of ${totalCount} files`
        toast(
          <SimpleToast 
            message={message}
            type="warning"
          />,
          { id: toastId, duration: 4000 }
        )
      } else if (skippedCount === totalCount) {
        toast(
          <SimpleToast 
            message="All files were skipped (hidden/system files)"
            type="info"
          />,
          { id: toastId, duration: 4000 }
        )
      } else {
        toast(
          <SimpleToast 
            message="Failed to upload files"
            type="error"
          />,
          { id: toastId, duration: 4000 }
        )
      }
      
      if (successCount > 0) {
        router.refresh()
      }
    }
    
    input.click()
  }

  const handleUploadFolder = () => {
    // Close popover immediately
    onOpenChange?.(false)
    
    // Create and trigger file input for directories
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    ;(input as any).webkitdirectory = true
    
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length === 0) return
      
      const toastId = `upload-${Date.now()}`
      
      // Process files with folder structure
      const items = files.map(file => {
        const pathParts = (file as any).webkitRelativePath?.split('/') || []
        if (pathParts.length > 1) {
          pathParts.pop() // Remove filename
        }
        return {
          file,
          path: pathParts.length > 0 ? pathParts : undefined
        }
      })
      
      // Process uploads in parallel
      const { successCount, totalCount, skippedCount } = await processUploadBatch(items, toastId)
      
      // Show final result
      const validCount = totalCount - skippedCount
      if (successCount === validCount && validCount > 0) {
        const message = skippedCount > 0
          ? `Successfully uploaded folder with ${successCount} file${successCount > 1 ? 's' : ''}! (${skippedCount} skipped)`
          : `Successfully uploaded folder with ${successCount} file${successCount > 1 ? 's' : ''}!`
        toast(
          <SimpleToast 
            message={message}
            type="success"
          />,
          { id: toastId, duration: 4000 }
        )
      } else if (successCount > 0) {
        const message = skippedCount > 0
          ? `Uploaded ${successCount} of ${validCount} files from folder (${skippedCount} skipped)`
          : `Uploaded ${successCount} of ${totalCount} files from folder`
        toast(
          <SimpleToast 
            message={message}
            type="warning"
          />,
          { id: toastId, duration: 4000 }
        )
      } else if (skippedCount === totalCount) {
        toast(
          <SimpleToast 
            message="All files in folder were skipped (hidden/system files)"
            type="info"
          />,
          { id: toastId, duration: 4000 }
        )
      } else {
        toast(
          <SimpleToast 
            message="Failed to upload folder"
            type="error"
          />,
          { id: toastId, duration: 4000 }
        )
      }
      
      if (successCount > 0) {
        router.refresh()
      }
    }
    
    input.click()
  }

  const handleCancelUpload = (toastId: string) => {
    console.log('Cancelling upload:', toastId)
    
    // Cancel current batch if exists
    if (currentBatchIdRef.current) {
      uploadManagerRef.current.cancelBatch(currentBatchIdRef.current)
    }
    
    // Update UI
    toast.dismiss(toastId)
    toast(
      <SimpleToast 
        message="Upload cancelled"
        type="info"
      />,
      { duration: 2000 }
    )
  }

  const resetState = () => {
    setShowNewFolder(false)
    setShowUploadOptions(false)
    setNewFolderName('')
  }

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetState()
      onOpenChange?.(isOpen)
    }}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {!showNewFolder && !showUploadOptions ? (
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setShowUploadOptions(true)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setShowNewFolder(true)}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </Button>
          </div>
        ) : showUploadOptions ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <button
                onClick={() => setShowUploadOptions(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                ←
              </button>
              <span className="text-sm font-medium flex-1">Upload</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={handleUploadFiles}
            >
              <Upload className="h-4 w-4 mr-2" />
              Select Files
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={handleUploadFolder}
            >
              <FolderUp className="h-4 w-4 mr-2" />
              Select Folder
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFolder()
                } else if (e.key === 'Escape') {
                  setShowNewFolder(false)
                  setNewFolderName('')
                }
              }}
              disabled={isCreatingFolder}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowNewFolder(false)
                  setNewFolderName('')
                }}
                disabled={isCreatingFolder}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || isCreatingFolder}
              >
                Create
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}