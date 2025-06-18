'use client'

import { useState, useRef } from 'react'
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
  const activeUploadsRef = useRef<Map<string, tus.Upload>>(new Map())
  const isCancelledRef = useRef(false)

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

  const uploadFileWithTus = async (
    item: UploadItem,
    index: number,
    total: number,
    toastId: string
  ): Promise<boolean> => {
    return new Promise(async (resolve) => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        console.error('No session found')
        toast(
          <SimpleToast 
            message="Authentication required"
            type="error"
          />,
          { duration: 4000 }
        )
        resolve(false)
        return
      }

      // Generate storage path
      const fileExt = item.file.name.split('.').pop()
      const fileName = crypto.randomUUID()
      const storagePath = `${session.user.id}/${fileName}.${fileExt}`

      // Get project ID from Supabase URL
      const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]
      
      const upload = new tus.Upload(item.file, {
        endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          'x-upsert': 'true',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: 'user-files',
          objectName: storagePath,
          contentType: item.file.type || 'application/octet-stream',
          cacheControl: '3600',
        },
        chunkSize: 6 * 1024 * 1024, // 6MB chunks
        onError: function (error) {
          console.error('TUS upload error:', error)
          activeUploadsRef.current.delete(storagePath)
          resolve(false)
        },
        onProgress: function (bytesUploaded, bytesTotal) {
          const percentage = (bytesUploaded / bytesTotal * 100)
          const overallProgress = ((index + (percentage / 100)) / total) * 100
          
          // Update toast progress
          toast(
            <ProgressToast 
              message={total > 1 ? 'Uploading files...' : `Uploading ${item.file.name}...`}
              progress={overallProgress}
              onCancel={() => handleCancelUpload(toastId)}
            />,
            { id: toastId, duration: Infinity }
          )
        },
        onSuccess: async function () {
          console.log(`Upload finished for ${item.file.name}`)
          
          // Create database record for the file
          try {
            // If path is provided, create folder structure first
            let currentParentId = parentId
            
            if (item.path && item.path.length > 0) {
              for (const folderName of item.path) {
                // Check if folder exists
                let query = supabase
                  .from('nodes')
                  .select('id')
                  .eq('workspace_id', workspaceId)
                  .eq('name', folderName)
                  .eq('node_type', 'folder')
                
                if (currentParentId === null) {
                  query = query.is('parent_id', null)
                } else {
                  query = query.eq('parent_id', currentParentId)
                }
                
                const { data: existingFolder } = await query.single()

                if (existingFolder) {
                  currentParentId = existingFolder.id
                } else {
                  // Create folder
                  const { data: newFolder, error } = await supabase
                    .from('nodes')
                    .insert({
                      user_id: session.user.id,
                      workspace_id: workspaceId,
                      parent_id: currentParentId,
                      node_type: 'folder',
                      name: folderName
                    })
                    .select()
                    .single()

                  if (error) throw error
                  currentParentId = newFolder.id
                }
              }
            }

            // Create file record
            const { error } = await supabase
              .from('nodes')
              .insert({
                user_id: session.user.id,
                workspace_id: workspaceId,
                parent_id: currentParentId,
                node_type: 'file',
                name: item.file.name,
                mime_type: item.file.type,
                size: item.file.size,
                storage_object_path: storagePath
              })

            if (error) throw error
            
            activeUploadsRef.current.delete(storagePath)
            resolve(true)
          } catch (error) {
            console.error('Failed to create database record:', error)
            resolve(false)
          }
        }
      })

      // Store the upload instance
      activeUploadsRef.current.set(storagePath, upload)

      // Check if cancelled before starting
      if (isCancelledRef.current) {
        console.log('Upload cancelled before start, aborting')
        upload.abort()
        activeUploadsRef.current.delete(storagePath)
        resolve(false)
        return
      }

      // Start the upload
      upload.start()
    })
  }

  const handleUploadFiles = () => {
    // Close popover immediately
    onOpenChange?.(false)
    
    // Reset cancelled state
    isCancelledRef.current = false
    
    // Create and trigger file input
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length === 0) return
      
      const toastId = `upload-${Date.now()}`
      let successCount = 0
      
      // Show initial progress
      toast(
        <ProgressToast 
          message={files.length > 1 ? `Uploading ${files.length} files...` : `Uploading ${files[0].name}...`}
          progress={0}
          onCancel={() => handleCancelUpload(toastId)}
        />,
        { id: toastId, duration: Infinity }
      )
      
      // Upload files sequentially
      for (let i = 0; i < files.length; i++) {
        if (isCancelledRef.current) break
        
        const success = await uploadFileWithTus(
          { file: files[i] },
          i,
          files.length,
          toastId
        )
        if (success) successCount++
      }
      
      // Show final result
      if (successCount === files.length) {
        toast(
          <SimpleToast 
            message={`Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}!`}
            type="success"
          />,
          { id: toastId, duration: 4000 }
        )
      } else if (successCount > 0) {
        toast(
          <SimpleToast 
            message={`Uploaded ${successCount} of ${files.length} files`}
            type="warning"
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
    
    // Reset cancelled state
    isCancelledRef.current = false
    
    // Create and trigger file input for directories
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    ;(input as any).webkitdirectory = true
    
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length === 0) return
      
      const toastId = `upload-${Date.now()}`
      let successCount = 0
      
      // Show initial progress
      toast(
        <ProgressToast 
          message={`Uploading folder with ${files.length} files...`}
          progress={0}
          onCancel={() => handleCancelUpload(toastId)}
        />,
        { id: toastId, duration: Infinity }
      )
      
      // Process files with folder structure
      for (let i = 0; i < files.length; i++) {
        if (isCancelledRef.current) break
        
        const file = files[i]
        const pathParts = (file as any).webkitRelativePath?.split('/') || []
        if (pathParts.length > 1) {
          pathParts.pop() // Remove filename
        }
        
        const success = await uploadFileWithTus(
          { file, path: pathParts.length > 0 ? pathParts : undefined },
          i,
          files.length,
          toastId
        )
        if (success) successCount++
      }
      
      // Show final result
      if (successCount === files.length) {
        toast(
          <SimpleToast 
            message={`Successfully uploaded folder with ${successCount} file${successCount > 1 ? 's' : ''}!`}
            type="success"
          />,
          { id: toastId, duration: 4000 }
        )
      } else if (successCount > 0) {
        toast(
          <SimpleToast 
            message={`Uploaded ${successCount} of ${files.length} files from folder`}
            type="warning"
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
    
    // Set cancelled flag
    isCancelledRef.current = true
    
    // Abort all active uploads
    activeUploadsRef.current.forEach((upload, key) => {
      console.log('Aborting upload:', key)
      try {
        upload.abort()
      } catch (e) {
        console.error('Error aborting upload:', e)
      }
    })
    
    // Clear active uploads
    activeUploadsRef.current.clear()
    
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