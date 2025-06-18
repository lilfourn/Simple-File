'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Upload, FolderUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ProgressToast } from '@/components/ui/progress-toast'
import { SimpleToast } from '@/components/ui/simple-toast'
import * as tus from 'tus-js-client'
import { createClient } from '@/utils/supabase/client'

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
  uploadInstance?: tus.Upload
}

export default function FileUploadTus({ workspaceId, parentId, onUploadComplete }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<FileUploadItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const activeUploadsRef = useRef<Map<string, tus.Upload>>(new Map())
  const isCancelledRef = useRef(false)
  const supabase = createClient()

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
    
    if (uploadItems.length > 0) {
      setUploadQueue(prev => [...prev, ...uploadItems])
      if (!isUploading) {
        processUploadQueue(uploadItems)
      }
    }
  }

  const uploadFileWithTus = async (
    item: FileUploadItem, 
    index: number, 
    total: number, 
    toastId: string
  ): Promise<boolean> => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] Starting TUS upload for file ${index + 1}/${total}:`, {
      fileName: item.file.name,
      fileSize: item.file.size
    })

    // Check if already cancelled
    if (isCancelledRef.current) {
      console.log(`[${timestamp}] Upload cancelled before starting:`, item.file.name)
      setUploadQueue(prev => prev.map((q) => 
        q === item ? { ...q, status: 'error' as const, error: 'Cancelled' } : q
      ))
      return false
    }

    return new Promise(async (resolve) => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        console.error('No session found')
        setUploadQueue(prev => prev.map((q) => 
          q === item ? { ...q, status: 'error' as const, error: 'Authentication required' } : q
        ))
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
          'x-upsert': 'true', // Allow overwriting files
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: 'user-files',
          objectName: storagePath,
          contentType: item.file.type || 'application/octet-stream',
          cacheControl: '3600',
        },
        chunkSize: 6 * 1024 * 1024, // 6MB chunks as recommended by Supabase
        onError: function (error) {
          console.error('TUS upload error:', error)
          setUploadQueue(prev => prev.map((q) => 
            q === item ? { ...q, status: 'error' as const, error: error.message } : q
          ))
          activeUploadsRef.current.delete(storagePath)
          resolve(false)
        },
        onProgress: function (bytesUploaded, bytesTotal) {
          const percentage = (bytesUploaded / bytesTotal * 100)
          
          setUploadQueue(prev => prev.map((q) => {
            if (q === item) {
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
              
              return { ...q, progress: percentage }
            }
            return q
          }))
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
                
                // Handle null parent_id properly
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

            setUploadQueue(prev => prev.map((q) => 
              q === item ? { ...q, status: 'complete' as const, progress: 100 } : q
            ))
            
            activeUploadsRef.current.delete(storagePath)
            resolve(true)
          } catch (error) {
            console.error('Failed to create database record:', error)
            // TODO: Clean up the uploaded file from storage
            setUploadQueue(prev => prev.map((q) => 
              q === item ? { ...q, status: 'error' as const, error: 'Failed to save file record' } : q
            ))
            resolve(false)
          }
        }
      })

      // Store the upload instance
      activeUploadsRef.current.set(storagePath, upload)
      setUploadQueue(prev => prev.map((q) => 
        q === item ? { ...q, status: 'uploading' as const, uploadInstance: upload } : q
      ))

      // Check if cancelled before starting
      if (isCancelledRef.current) {
        console.log('Upload cancelled before start, aborting')
        upload.abort()
        activeUploadsRef.current.delete(storagePath)
        setUploadQueue(prev => prev.map((q) => 
          q === item ? { ...q, status: 'error' as const, error: 'Cancelled' } : q
        ))
        resolve(false)
        return
      }

      // Start the upload
      upload.start()
    })
  }

  const processUploadQueue = async (items: FileUploadItem[]) => {
    setIsUploading(true)
    const toastId = `upload-batch-${Date.now()}`
    let successCount = 0
    let cancelledCount = 0

    // Reset cancelled state
    isCancelledRef.current = false
    
    console.log('Starting new upload batch with', items.length, 'files')

    // Show initial progress toast
    toast(
      <ProgressToast 
        message={items.length > 1 ? `Uploading ${items.length} files...` : `Uploading ${items[0].file.name}...`}
        progress={0}
        onCancel={() => handleCancelUpload(toastId)}
      />,
      { id: toastId, duration: Infinity }
    )

    // Upload files sequentially
    for (let i = 0; i < items.length; i++) {
      // Check if cancelled
      if (isCancelledRef.current) {
        console.log(`Upload cancelled at file ${i + 1} of ${items.length}`)
        cancelledCount = items.length - i
        // Mark remaining items as cancelled
        for (let j = i; j < items.length; j++) {
          setUploadQueue(prev => prev.map((q) => 
            q === items[j] ? { ...q, status: 'error' as const, error: 'Cancelled' } : q
          ))
        }
        break
      }
      
      const success = await uploadFileWithTus(items[i], i, items.length, toastId)
      if (success) successCount++
    }

    // Show final result
    if (isCancelledRef.current && cancelledCount > 0) {
      toast(
        <SimpleToast 
          message={`Uploaded ${successCount} of ${items.length} files (${cancelledCount} cancelled)`}
          type="warning"
        />,
        { id: toastId, duration: 4000 }
      )
    } else if (successCount === items.length) {
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
          message={`Uploaded ${successCount} of ${items.length} files`}
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

    setIsUploading(false)
    onUploadComplete?.()
    
    // Process any remaining items
    if (!isCancelledRef.current) {
      const remainingItems = uploadQueue.filter(item => item.status === 'pending')
      if (remainingItems.length > 0) {
        processUploadQueue(remainingItems)
      }
    }
  }

  const handleCancelUpload = (toastId: string) => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ===== CANCEL BUTTON CLICKED =====`)
    
    // Set cancelled flag
    isCancelledRef.current = true
    
    // Abort all active TUS uploads
    console.log(`[${timestamp}] Aborting ${activeUploadsRef.current.size} active uploads`)
    activeUploadsRef.current.forEach((upload, key) => {
      console.log(`[${timestamp}] Aborting upload:`, key)
      try {
        upload.abort()
        console.log(`[${timestamp}] Successfully aborted upload:`, key)
      } catch (e) {
        console.error(`[${timestamp}] Error aborting upload:`, key, e)
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
            <h3 className="text-sm font-medium">
              Upload Queue ({uploadQueue.filter(q => q.status === 'complete').length}/{uploadQueue.length})
            </h3>
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