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
  const router = useRouter()

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return

    setIsCreatingFolder(true)
    const toastId = `create-folder-${Date.now()}`
    
    try {
      toast(
        <ProgressToast 
          message={`Creating folder "${newFolderName.trim()}"...`}
          progress={50}
        />,
        { id: toastId, duration: Infinity }
      )
      
      const result = await createFolder(workspaceId, parentId, newFolderName.trim())
      
      if (result.wasRenamed) {
        toast.info(`Folder created as "${result.name}" to avoid naming conflict`, { id: toastId, duration: 4000 })
      } else {
        toast.success(`Folder "${result.name}" created successfully`, { id: toastId, duration: 4000 })
      }
      
      setNewFolderName('')
      setShowNewFolder(false)
      onOpenChange?.(false)
      router.refresh()
    } catch (error) {
      console.error('Failed to create folder:', error)
      toast.error('Failed to create folder', { id: toastId, duration: 4000 })
    } finally {
      setIsCreatingFolder(false)
    }
  }

  const uploadFileWithProgress = (file: File, toastId: string | number, index: number, total: number, path?: string[]): Promise<boolean> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
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
              message={total > 1 ? `Uploading ${index + 1} of ${total} files...` : `Uploading ${file.name}...`}
              progress={overallProgress}
              total={total > 1 ? total : undefined}
            />,
            { id: toastId, duration: Infinity }
          )
        }
      })
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(true)
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            toast.error(`Failed to upload ${file.name}: ${error.error || 'Upload failed'}`)
          } catch {
            toast.error(`Failed to upload ${file.name}`)
          }
          resolve(false)
        }
      })
      
      xhr.addEventListener('error', () => {
        toast.error(`Failed to upload ${file.name}: Network error`)
        resolve(false)
      })
      
      xhr.open('POST', '/api/upload')
      xhr.send(formData)
    })
  }

  const handleUploadFiles = () => {
    // Close popover immediately
    onOpenChange?.(false)
    
    // Create and trigger file input for individual files
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length === 0) return
      
      const toastId = `upload-${Date.now()}`
      let successCount = 0
      
      // Upload files sequentially to show accurate progress
      for (let i = 0; i < files.length; i++) {
        const success = await uploadFileWithProgress(files[i], toastId, i, files.length)
        if (success) successCount++
      }
      
      // Show final result
      if (successCount === files.length) {
        toast.success(`Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}!`, { id: toastId, duration: 4000 })
      } else if (successCount > 0) {
        toast.warning(`Uploaded ${successCount} of ${files.length} files`, { id: toastId, duration: 4000 })
      } else {
        toast.error('Failed to upload files', { id: toastId, duration: 4000 })
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
      let successCount = 0
      
      // Process files with folder structure
      for (let i = 0; i < files.length; i++) {
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
      if (successCount === files.length) {
        toast.success(`Successfully uploaded folder with ${successCount} file${successCount > 1 ? 's' : ''}!`, { id: toastId, duration: 4000 })
      } else if (successCount > 0) {
        toast.warning(`Uploaded ${successCount} of ${files.length} files from folder`, { id: toastId, duration: 4000 })
      } else {
        toast.error('Failed to upload folder', { id: toastId, duration: 4000 })
      }
      
      if (successCount > 0) {
        router.refresh()
      }
    }
    
    input.click()
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