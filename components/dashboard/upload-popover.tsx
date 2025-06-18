'use client'

import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Upload, FolderPlus } from 'lucide-react'
import { createFolder } from '@/app/dashboard/file-organizer/actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return

    setIsCreatingFolder(true)
    try {
      const result = await createFolder(workspaceId, parentId, newFolderName.trim())
      
      if (result.wasRenamed) {
        toast.info(`Folder created as "${result.name}" to avoid naming conflict`)
      } else {
        toast.success(`Folder "${result.name}" created successfully`)
      }
      
      setNewFolderName('')
      setShowNewFolder(false)
      onOpenChange?.(false)
      router.refresh()
    } catch (error) {
      console.error('Failed to create folder:', error)
      toast.error('Failed to create folder')
    } finally {
      setIsCreatingFolder(false)
    }
  }

  const handleUploadClick = () => {
    // Close popover immediately
    onOpenChange?.(false)
    
    // Create and trigger file input that accepts both files and folders
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length === 0) return
      
      toast.loading(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`)
      
      let successCount = 0
      for (const file of files) {
        try {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('workspaceId', workspaceId)
          formData.append('parentId', parentId || 'null')
          
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          })
          
          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Upload failed')
          }
          
          successCount++
        } catch (error) {
          console.error('Upload error:', error)
          toast.error(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      
      toast.dismiss()
      if (successCount > 0) {
        toast.success(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}`)
        router.refresh()
      }
    }
    
    input.click()
  }

  const resetState = () => {
    setShowNewFolder(false)
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
          {!showNewFolder ? (
            <div className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={handleUploadClick}
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