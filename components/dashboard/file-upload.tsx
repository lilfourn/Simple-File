'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Upload, FolderUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ProgressToast } from '@/components/ui/progress-toast'

interface FileUploadProps {
  workspaceId: string
  parentId: string | null
  onUploadComplete?: () => void
}

interface FileUploadItem {
  file: File
  path?: string[]
  progress: number
  status: 'pending' | 'uploading' | 'complete' | 'error'
  error?: string
}

export default function FileUpload({ workspaceId, parentId, onUploadComplete }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<FileUploadItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

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
      processUploadQueue(files)
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
    
    setUploadQueue(prev => [...prev, ...uploadItems])
    processUploadQueue(uploadItems)
  }

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const uploadItems: FileUploadItem[] = files.map(file => {
      // Extract folder path from webkitRelativePath
      const pathParts = file.webkitRelativePath.split('/')
      pathParts.pop() // Remove filename
      
      return {
        file,
        path: pathParts.length > 0 ? pathParts : undefined,
        progress: 0,
        status: 'pending' as const
      }
    })
    
    setUploadQueue(prev => [...prev, ...uploadItems])
    processUploadQueue(uploadItems)
  }

  const uploadFileWithProgress = (item: FileUploadItem, index: number, total: number, toastId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', item.file)
      formData.append('workspaceId', workspaceId)
      formData.append('parentId', parentId || 'null')
      if (item.path) {
        formData.append('path', JSON.stringify(item.path))
      }
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const fileProgress = (e.loaded / e.total) * 100
          const overallProgress = ((index + (fileProgress / 100)) / total) * 100
          
          // Update individual file progress
          setUploadQueue(prev => prev.map((q, idx) => 
            idx === uploadQueue.findIndex(uq => uq === item)
              ? { ...q, progress: fileProgress }
              : q
          ))
          
          // Update toast progress
          toast(
            <ProgressToast 
              message={total > 1 ? `Uploading ${index + 1} of ${total} files...` : `Uploading ${item.file.name}...`}
              progress={overallProgress}
              total={total > 1 ? total : undefined}
            />,
            { id: toastId, duration: Infinity }
          )
        }
      })
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadQueue(prev => prev.map((q, idx) => 
            idx === uploadQueue.findIndex(uq => uq === item)
              ? { ...q, status: 'complete' as const, progress: 100 }
              : q
          ))
          resolve(true)
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            setUploadQueue(prev => prev.map((q, idx) => 
              idx === uploadQueue.findIndex(uq => uq === item)
                ? { ...q, status: 'error' as const, error: error.error || 'Upload failed' }
                : q
            ))
          } catch {
            setUploadQueue(prev => prev.map((q, idx) => 
              idx === uploadQueue.findIndex(uq => uq === item)
                ? { ...q, status: 'error' as const, error: 'Upload failed' }
                : q
            ))
          }
          resolve(false)
        }
      })
      
      xhr.addEventListener('error', () => {
        setUploadQueue(prev => prev.map((q, idx) => 
          idx === uploadQueue.findIndex(uq => uq === item)
            ? { ...q, status: 'error' as const, error: 'Network error' }
            : q
        ))
        resolve(false)
      })
      
      xhr.open('POST', '/api/upload')
      xhr.send(formData)
    })
  }

  const processUploadQueue = async (items: FileUploadItem[]) => {
    setIsUploading(true)
    const toastId = `upload-batch-${Date.now()}`
    let successCount = 0

    // Upload files sequentially to show accurate progress
    for (let i = 0; i < items.length; i++) {
      const success = await uploadFileWithProgress(items[i], i, items.length, toastId)
      if (success) successCount++
    }

    // Show final result
    if (successCount === items.length) {
      toast.success(`Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}!`, { id: toastId, duration: 4000 })
    } else if (successCount > 0) {
      toast.warning(`Uploaded ${successCount} of ${items.length} files`, { id: toastId, duration: 4000 })
    } else {
      toast.error('Failed to upload files', { id: toastId, duration: 4000 })
    }

    setIsUploading(false)
    onUploadComplete?.()
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
            <h3 className="text-sm font-medium">
              Upload Queue ({uploadQueue.filter(q => q.status === 'complete').length}/{uploadQueue.length})
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearQueue}
              disabled={isUploading}
            >
              Clear All
            </Button>
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