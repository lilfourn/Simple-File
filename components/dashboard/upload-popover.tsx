'use client'

import { useState } from 'react'
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

interface UploadPopoverProps {
  workspaceId: string
  parentId: string | null
  trigger: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export default function UploadPopover({
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
  const [activeUploads, setActiveUploads] = useState<Map<string, XMLHttpRequest>>(new Map())
  const [isCancelled, setIsCancelled] = useState(false)
  const router = useRouter()

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

  const uploadFileWithProgress = (file: File, toastId: string | number, index: number, total: number, path?: string[]): Promise<boolean> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      const uploadId = `${toastId}-${index}`
      
      // Store the XHR request for cancellation
      setActiveUploads(prev => new Map(prev).set(uploadId, xhr))
      
      const formData = new FormData()
      formData.append('file', file)
      formData.append('workspaceId', workspaceId)
      formData.append('parentId', parentId || 'null')
      if (path && path.length > 0) {
        formData.append('path', JSON.stringify(path))
      }
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const fileProgress = (e.loaded / e.total) * 100
          const overallProgress = ((index + (fileProgress / 100)) / total) * 100
          
          toast(
            <ProgressToast 
              message={total > 1 ? 'Uploading files...' : `Uploading ${file.name}...`}
              progress={overallProgress}
              onCancel={() => handleCancelUpload(toastId as string)}
            />,
            { id: toastId, duration: Infinity }
          )
        }
      })
      
      xhr.addEventListener('load', () => {
        // Remove from active uploads
        setActiveUploads(prev => {
          const newMap = new Map(prev)
          newMap.delete(uploadId)
          return newMap
        })
        
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(true)
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            toast(
              <SimpleToast 
                message={`Failed to upload ${file.name}: ${error.error || 'Upload failed'}`}
                type="error"
              />,
              { duration: 4000 }
            )
          } catch {
            toast(
              <SimpleToast 
                message={`Failed to upload ${file.name}`}
                type="error"
              />,
              { duration: 4000 }
            )
          }
          resolve(false)
        }
      })
      
      xhr.addEventListener('error', () => {
        // Remove from active uploads
        setActiveUploads(prev => {
          const newMap = new Map(prev)
          newMap.delete(uploadId)
          return newMap
        })
        
        toast(
          <SimpleToast 
            message={`Failed to upload ${file.name}: Network error`}
            type="error"
          />,
          { duration: 4000 }
        )
        resolve(false)
      })
      
      xhr.addEventListener('abort', () => {
        // Remove from active uploads
        setActiveUploads(prev => {
          const newMap = new Map(prev)
          newMap.delete(uploadId)
          return newMap
        })
        
        resolve(false)
      })
      
      xhr.open('POST', '/api/upload')
      xhr.send(formData)
    })
  }

  const handleUploadFiles = () => {
    // Close popover immediately
    onOpenChange?.(false)
    
    // Reset cancelled state
    setIsCancelled(false)
    
    // Create and trigger file input for individual files
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length === 0) return
      
      const toastId = `upload-${Date.now()}`
      let successCount = 0
      let cancelledCount = 0
      
      // Upload files sequentially to show accurate progress
      for (let i = 0; i < files.length; i++) {
        // Check if cancelled before starting each upload
        if (isCancelled) {
          cancelledCount = files.length - i
          break
        }
        
        const success = await uploadFileWithProgress(files[i], toastId, i, files.length)
        if (success) successCount++
      }
      
      // Show final result
      if (isCancelled && cancelledCount > 0) {
        toast(
          <SimpleToast 
            message={`Uploaded ${successCount} of ${files.length} files (${cancelledCount} cancelled)`}
            type="warning"
          />,
          { id: toastId, duration: 4000 }
        )
      } else if (successCount === files.length) {
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
      
      // Reset state
      setIsCancelled(false)
    }
    
    input.click()
  }

  const handleUploadFolder = () => {
    // Close popover immediately
    onOpenChange?.(false)
    
    // Reset cancelled state
    setIsCancelled(false)
    
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
      let cancelledCount = 0
      
      // Process files with folder structure
      for (let i = 0; i < files.length; i++) {
        // Check if cancelled before starting each upload
        if (isCancelled) {
          cancelledCount = files.length - i
          break
        }
        
        const file = files[i]
        // Extract folder path from webkitRelativePath
        const pathParts = (file as any).webkitRelativePath?.split('/') || []
        if (pathParts.length > 1) {
          pathParts.pop() // Remove filename
          const success = await uploadFileWithProgress(file, toastId, i, files.length, pathParts)
          if (success) successCount++
        } else {
          const success = await uploadFileWithProgress(file, toastId, i, files.length)
          if (success) successCount++
        }
      }
      
      // Show final result
      if (isCancelled && cancelledCount > 0) {
        toast(
          <SimpleToast 
            message={`Uploaded ${successCount} of ${files.length} files (${cancelledCount} cancelled)`}
            type="warning"
          />,
          { id: toastId, duration: 4000 }
        )
      } else if (successCount === files.length) {
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
      
      // Reset state
      setIsCancelled(false)
    }
    
    input.click()
  }

  const handleCancelUpload = (toastId: string) => {
    // Set cancelled flag to prevent new uploads from starting
    setIsCancelled(true)
    
    // Cancel all active uploads for this toast
    activeUploads.forEach((xhr, uploadId) => {
      if (uploadId.startsWith(toastId)) {
        xhr.abort()
      }
    })
    
    // Clear the toast
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
    <>
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
    </>
  )
}