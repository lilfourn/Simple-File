'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { FilePreviewHandler, type FilePreview } from '@/utils/file-preview-handler'
import { FileText, Image, FileCode, File, Loader2, AlertCircle, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

interface FilePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  originalFile?: File
  renamedFile?: File
  originalName: string
  suggestedName: string
}

export function FilePreviewModal({
  isOpen,
  onClose,
  originalFile,
  renamedFile,
  originalName,
  suggestedName
}: FilePreviewModalProps) {
  const [originalPreview, setOriginalPreview] = useState<FilePreview | null>(null)
  const [renamedPreview, setRenamedPreview] = useState<FilePreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'original' | 'renamed'>('original')
  const [filesMatch, setFilesMatch] = useState<boolean | null>(null)

  useEffect(() => {
    if (isOpen && originalFile) {
      loadPreviews()
    }
  }, [isOpen, originalFile, renamedFile])

  const loadPreviews = async () => {
    if (!originalFile) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      // Generate preview for original file
      const origPreview = await FilePreviewHandler.generatePreview(originalFile)
      setOriginalPreview(origPreview)
      
      // Generate preview for renamed file if available
      if (renamedFile) {
        const renPreview = await FilePreviewHandler.generatePreview(renamedFile)
        setRenamedPreview(renPreview)
        
        // Compare files
        const match = await FilePreviewHandler.compareFiles(originalFile, renamedFile)
        setFilesMatch(match)
      }
    } catch (err) {
      console.error('Failed to generate preview:', err)
      setError('Failed to load file preview')
    } finally {
      setIsLoading(false)
    }
  }

  const renderPreview = (preview: FilePreview | null, fileName: string) => {
    if (!preview) return null
    
    switch (preview.type) {
      case 'text':
        return (
          <pre className="p-4 text-sm font-mono bg-muted rounded-lg overflow-x-auto">
            {preview.content as string}
          </pre>
        )
        
      case 'code':
        const language = FilePreviewHandler.getLanguage(fileName)
        return (
          <div className="relative">
            <Badge variant="secondary" className="absolute top-2 right-2 text-xs">
              {language}
            </Badge>
            <pre className="p-4 text-sm font-mono bg-muted rounded-lg overflow-x-auto">
              <code>{preview.content as string}</code>
            </pre>
          </div>
        )
        
      case 'markdown':
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none p-4">
            <ReactMarkdown>{preview.content as string}</ReactMarkdown>
          </div>
        )
        
      case 'image':
        const blob = new Blob([preview.content as ArrayBuffer], { type: preview.mimeType })
        const url = URL.createObjectURL(blob)
        return (
          <div className="flex justify-center p-4">
            <img 
              src={url} 
              alt={fileName}
              className="max-w-full max-h-[500px] object-contain rounded-lg"
              onLoad={() => URL.revokeObjectURL(url)}
            />
          </div>
        )
        
      case 'pdf':
        return (
          <div className="p-4 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              PDF preview not available in this view
            </p>
            <p className="text-xs text-muted-foreground">
              File size: {FilePreviewHandler.formatBytes((preview.content as ArrayBuffer).byteLength)}
            </p>
          </div>
        )
        
      case 'unsupported':
        return (
          <div className="p-4 text-center">
            <File className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {preview.content as string}
            </p>
          </div>
        )
        
      default:
        return null
    }
  }

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'text':
        return FileText
      case 'code':
        return FileCode
      case 'image':
        return Image
      default:
        return File
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>File Preview</DialogTitle>
          <DialogDescription>
            Compare the original and renamed files to ensure content remains unchanged
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* File comparison status */}
            {filesMatch !== null && renamedFile && (
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg mb-4",
                filesMatch 
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              )}>
                {filesMatch ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-medium">Files are identical</span>
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    <span className="text-sm font-medium">Files differ - please review carefully</span>
                  </>
                )}
              </div>
            )}
            
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'original' | 'renamed')} className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="original" className="flex items-center gap-2">
                  {originalPreview && React.createElement(getFileIcon(originalPreview.type), { className: "h-4 w-4" })}
                  <span className="truncate max-w-[200px]" title={originalName}>
                    {originalName}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="renamed" disabled={!renamedFile}>
                  {renamedPreview && React.createElement(getFileIcon(renamedPreview.type), { className: "h-4 w-4" })}
                  <span className="truncate max-w-[200px]" title={suggestedName}>
                    {suggestedName}
                  </span>
                </TabsTrigger>
              </TabsList>
              
              <div className="flex-1 min-h-0 mt-4">
                <TabsContent value="original" className="h-full m-0">
                  <ScrollArea className="h-full rounded-lg border bg-background">
                    {renderPreview(originalPreview, originalName)}
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="renamed" className="h-full m-0">
                  <ScrollArea className="h-full rounded-lg border bg-background">
                    {renamedFile ? (
                      renderPreview(renamedPreview, suggestedName)
                    ) : (
                      <div className="p-4 text-center text-muted-foreground">
                        <p className="text-sm">Renamed file not yet created</p>
                        <p className="text-xs mt-1">Preview will be available after download</p>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}