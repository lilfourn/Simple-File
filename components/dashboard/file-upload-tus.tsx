'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Upload, FolderUp, X, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ProgressToast } from '@/components/ui/progress-toast'
import { SimpleToast } from '@/components/ui/simple-toast'
import * as tus from 'tus-js-client'
import { createClient } from '@/utils/supabase/client'
import { ParallelUploadManager, UploadTask } from '@/utils/parallel-upload-manager'
import { FolderStructureProcessor } from '@/utils/folder-structure-processor'
import { StorageSessionManager } from '@/utils/storage-session-manager'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

interface FileUploadProps {
  workspaceId: string
  parentId: string | null
  onUploadComplete?: () => void
}

interface FileUploadItem {
  file: File
  path?: string[]
  progress: number
  status: 'pending' | 'uploading' | 'complete' | 'error' | 'cancelled'
  error?: string
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

export default function FileUploadTus({ workspaceId, parentId, onUploadComplete }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<FileUploadItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [concurrencyLimit, setConcurrencyLimit] = useState(2) // Further reduced for stability
  const [bandwidthLimit, setBandwidthLimit] = useState(0) // 0 = unlimited
  const [dynamicConcurrency, setDynamicConcurrency] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const uploadManagerRef = useRef<ParallelUploadManager>(new ParallelUploadManager(2))
  const folderProcessorRef = useRef<FolderStructureProcessor>(new FolderStructureProcessor())
  const currentBatchIdRef = useRef<string | null>(null)
  const sessionManagerRef = useRef<StorageSessionManager>(new StorageSessionManager())
  const supabase = createClient()
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionManagerRef.current.stopAutoRefresh()
    }
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const items = Array.from(e.dataTransfer.items)
    const files: FileUploadItem[] = []

    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry()
        if (entry) {
          await processEntry(entry, files)
        }
      }
    }

    if (files.length > 0) {
      setUploadQueue(prev => [...prev, ...files])
      if (!isUploading) {
        processUploadQueue(files)
      }
    }
  }

  const processEntry = async (
    entry: FileSystemEntry,
    files: FileUploadItem[],
    path: string[] = []
  ) => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject)
      })
      
      files.push({
        file,
        path: path.length > 0 ? path : undefined,
        progress: 0,
        status: 'pending'
      })
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry
      const reader = dirEntry.createReader()
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject)
      })
      
      for (const childEntry of entries) {
        await processEntry(childEntry, files, [...path, entry.name])
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const uploadItems: FileUploadItem[] = files.map(file => ({
      file,
      progress: 0,
      status: 'pending' as const
    }))
    
    if (uploadItems.length > 0) {
      setUploadQueue(prev => [...prev, ...uploadItems])
      if (!isUploading) {
        processUploadQueue(uploadItems)
      }
    }
  }

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    console.log(`[Folder Select] Selected ${files.length} files`)
    
    const uploadItems: FileUploadItem[] = files.map(file => {
      // Extract folder path from webkitRelativePath
      const pathParts = file.webkitRelativePath.split('/')
      pathParts.pop() // Remove filename
      
      console.log(`[Folder Select] File: ${file.name}, Path: ${pathParts.join('/')}`)
      
      return {
        file,
        path: pathParts.length > 0 ? pathParts : undefined,
        progress: 0,
        status: 'pending' as const
      }
    })
    
    if (uploadItems.length > 0) {
      setUploadQueue(prev => [...prev, ...uploadItems])
      if (!isUploading) {
        processUploadQueue(uploadItems)
      }
    }
  }

  const createTusUploadHandler = async (task: UploadTask, batchId: string, folderId?: string): Promise<tus.Upload | null> => {
    console.log(`[TUS Handler] Creating upload handler for ${task.file.name}`, {
      fileSize: task.file.size,
      fileType: task.file.type,
      taskId: task.id
    })
    
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
    const uploadEndpoint = `https://${projectId}.supabase.co/storage/v1/upload/resumable`
    
    console.log(`[TUS Upload] Creating upload for ${task.file.name}`, {
      endpoint: uploadEndpoint,
      storagePath: storagePath,
      fileSize: task.file.size,
      hasValidSession: !!session.access_token
    })

    const upload = new tus.Upload(task.file, {
      endpoint: uploadEndpoint,
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
          originalRequest: error?.originalRequest ? {
            method: error.originalRequest.getMethod ? error.originalRequest.getMethod() : 'Unknown',
            url: error.originalRequest.getURL ? error.originalRequest.getURL() : 'Unknown'
          } : null,
          originalResponse: error?.originalResponse ? {
            status: error.originalResponse.getStatus ? error.originalResponse.getStatus() : 'Unknown',
            body: error.originalResponse.getBody ? error.originalResponse.getBody() : 'No body'
          } : null,
          causeDetail: error?.causeDetail ? error.causeDetail : null,
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
    console.log(`[TUS Upload] Starting upload for ${task.file.name}`)
    try {
      upload.start()
      console.log(`[TUS Upload] Upload started successfully for ${task.file.name}`)
    } catch (error) {
      console.error(`[TUS Upload] Failed to start upload for ${task.file.name}:`, error)
      uploadManagerRef.current.updateTaskStatus(batchId, task.id, 'error', 'Failed to start upload')
      return null
    }
    
    return upload
  }

  const processUploadQueue = async (items: FileUploadItem[]) => {
    setIsUploading(true)
    const toastId = `upload-batch-${Date.now()}`
    
    // Filter out invalid files
    const validItems: FileUploadItem[] = []
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
      console.log(`[Upload Queue] Skipped ${skippedFiles.length} invalid files:`, skippedFiles)
    }
    
    if (validItems.length === 0) {
      toast(
        <SimpleToast 
          message="No valid files to upload"
          type="info"
        />,
        { duration: 4000 }
      )
      setIsUploading(false)
      return
    }
    
    console.log('Starting parallel upload batch with', validItems.length, 'valid files')
    
    // Start auto-refresh for session during uploads
    sessionManagerRef.current.startAutoRefresh()

    try {
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
        setIsUploading(false)
        return
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
        concurrencyLimit: concurrencyLimit,
        onProgress: (progress, uploadedBytes, totalBytes) => {
          console.log(`[Upload Progress] Batch progress: ${progress.toFixed(1)}%, ${uploadedBytes}/${totalBytes} bytes`)
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
        },
        onTaskComplete: (taskId, success) => {
          // Update local queue status
          const taskIndex = tasks.findIndex((_, i) => `${batchId}-task-${i}` === taskId)
          if (taskIndex !== -1) {
            setUploadQueue(prev => prev.map((q, i) => 
              i === taskIndex 
                ? { ...q, status: success ? 'complete' : 'error', progress: success ? 100 : q.progress }
                : q
            ))
          }
        },
        onBatchComplete: (successCount, totalCount) => {
          // Show final result
          if (successCount === totalCount) {
            const message = skippedFiles.length > 0
              ? `Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}! (${skippedFiles.length} skipped)`
              : `Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}!`
            toast(
              <SimpleToast 
                message={message}
                type="success"
              />,
              { id: toastId, duration: 4000 }
            )
          } else if (successCount > 0) {
            const message = skippedFiles.length > 0
              ? `Uploaded ${successCount} of ${totalCount} files (${skippedFiles.length} skipped)`
              : `Uploaded ${successCount} of ${totalCount} files`
            toast(
              <SimpleToast 
                message={message}
                type="warning"
              />,
              { id: toastId, duration: 4000 }
            )
          } else {
            const message = skippedFiles.length > 0
              ? `Failed to upload files (${skippedFiles.length} skipped)`
              : "Failed to upload files"
            toast(
              <SimpleToast 
                message={message}
                type="error"
              />,
              { id: toastId, duration: 4000 }
            )
          }
        }
      })

      // Store current batch ID for cancellation
      currentBatchIdRef.current = batchId

      console.log(`[Upload Queue] Starting batch processing for ${tasks.length} files`)
      
      // Process uploads in parallel
      const result = await uploadManagerRef.current.processBatch(batchId, async (task) => {
        const taskFolderId = task.parentId !== parentId ? task.parentId : undefined
        return await createTusUploadHandler(task, batchId, taskFolderId as string | undefined)
      })
      
      console.log(`[Upload Queue] Batch processing complete:`, result)

    } catch (error) {
      console.error('Upload batch error:', error)
      toast(
        <SimpleToast 
          message="Upload failed"
          type="error"
        />,
        { duration: 4000 }
      )
    } finally {
      setIsUploading(false)
      currentBatchIdRef.current = null
      onUploadComplete?.()
      
      // Stop auto-refresh when uploads complete
      sessionManagerRef.current.stopAutoRefresh()
      
      // Process any remaining items
      const remainingItems = uploadQueue.filter(item => item.status === 'pending')
      if (remainingItems.length > 0) {
        processUploadQueue(remainingItems)
      }
    }
  }

  const handleCancelUpload = (toastId: string) => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ===== CANCEL BUTTON CLICKED =====`)
    
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
    
    // Mark all pending/uploading items as cancelled
    setUploadQueue(prev => prev.map(item => 
      (item.status === 'uploading' || item.status === 'pending')
        ? { ...item, status: 'error' as const, error: 'Cancelled', uploadInstance: undefined }
        : item
    ))
    
    setIsUploading(false)
    
    // Clear file inputs
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  const clearQueue = () => {
    setUploadQueue([])
  }

  const removeFromQueue = (index: number) => {
    setUploadQueue(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        )}
      >
        <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-4">
          Drag and drop files or folders here, or click to select
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Tip: You can drag files directly onto folders in the sidebar to upload them there
        </p>
        
        <div className="flex gap-2 justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="h-4 w-4 mr-2" />
            Select Files
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => folderInputRef.current?.click()}
            disabled={isUploading}
          >
            <FolderUp className="h-4 w-4 mr-2" />
            Select Folder
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        
        <input
          ref={folderInputRef}
          type="file"
          {...{ webkitdirectory: '' } as any}
          multiple
          className="hidden"
          onChange={handleFolderSelect}
        />
      </div>

      {uploadQueue.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium">
                Upload Queue ({uploadQueue.filter(q => q.status === 'complete').length}/{uploadQueue.length})
              </h3>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2">
                    <Settings2 className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="dynamic">Dynamic Concurrency</Label>
                        <input
                          id="dynamic"
                          type="checkbox"
                          checked={dynamicConcurrency}
                          onChange={(e) => {
                            setDynamicConcurrency(e.target.checked)
                            uploadManagerRef.current.setDynamicConcurrency(e.target.checked)
                          }}
                          className="h-4 w-4"
                          disabled={isUploading}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Automatically adjust speed based on server response
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="concurrency">
                        Parallel Uploads: {concurrencyLimit}
                      </Label>
                      <Slider
                        id="concurrency"
                        min={1}
                        max={6}
                        step={1}
                        value={[concurrencyLimit]}
                        onValueChange={(value) => {
                          setConcurrencyLimit(value[0])
                          uploadManagerRef.current.setGlobalConcurrencyLimit(value[0])
                        }}
                        disabled={isUploading || dynamicConcurrency}
                      />
                      <p className="text-xs text-muted-foreground">
                        {dynamicConcurrency ? 'Controlled automatically' : 'Manual control'}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="bandwidth">
                        Bandwidth Limit: {bandwidthLimit === 0 ? 'Unlimited' : `${bandwidthLimit} MB/s`}
                      </Label>
                      <Slider
                        id="bandwidth"
                        min={0}
                        max={50}
                        step={5}
                        value={[bandwidthLimit]}
                        onValueChange={(value) => {
                          setBandwidthLimit(value[0])
                          uploadManagerRef.current.setBandwidthLimit(value[0])
                        }}
                        disabled={isUploading}
                      />
                      <p className="text-xs text-muted-foreground">
                        0 = unlimited, useful for slower connections
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex gap-2">
              {!isUploading && uploadQueue.some(q => q.status === 'pending') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const pendingItems = uploadQueue.filter(q => q.status === 'pending')
                    if (pendingItems.length > 0) {
                      processUploadQueue(pendingItems)
                    }
                  }}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Start Upload
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearQueue}
                disabled={isUploading}
              >
                Clear All
              </Button>
            </div>
          </div>
          
          <div className="max-h-48 overflow-y-auto space-y-1">
            {uploadQueue.map((item, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs">
                <div className="flex-1 min-w-0">
                  <p className="truncate">
                    {item.path ? `${item.path.join('/')}/` : ''}{item.file.name}
                  </p>
                  {item.error && (
                    <p className="text-destructive text-xs">{item.error}</p>
                  )}
                </div>
                
                {item.status === 'uploading' && (
                  <Progress value={item.progress} className="w-20 h-2" />
                )}
                
                {item.status === 'complete' && (
                  <span className="text-green-600">✓</span>
                )}
                
                {item.status === 'error' && (
                  <span className="text-destructive">✗</span>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => removeFromQueue(index)}
                  disabled={item.status === 'uploading'}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}