'use client'

import { useState, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Sparkles, 
  FolderOpen, 
  Files, 
  Zap, 
  Shield, 
  RefreshCw,
  Check,
  Edit2,
  AlertCircle,
  Loader2,
  Copy,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { showToast } from '@/utils/toast-helper'
import { SmartSyncProcessor } from '@/utils/smart-sync-processor'

interface SmartSyncProps {
  workspaceId: string
  onFilesRenamed?: () => void
}

interface FileHandle {
  name: string
  kind: 'file' | 'directory'
  path: string
  fileHandle?: FileSystemFileHandle
  dirHandle?: FileSystemDirectoryHandle
  parentDirHandle?: FileSystemDirectoryHandle
}

interface FileAnalysis {
  originalName: string
  suggestedName: string
  confidence: number
  reasoning: string
  selected: boolean
  edited: boolean
}

interface RenameResult {
  originalName: string
  suggestedName: string
  status: 'success' | 'error' | 'skipped'
  newLocation?: string
}

interface ProgressState {
  totalFiles: number
  processedFiles: number
  currentBatch: string[]
  filesPerSecond: number
  estimatedTimeRemaining: number
  individualProgress: Map<string, number>
}

export default function SmartSync({ workspaceId, onFilesRenamed }: SmartSyncProps) {
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<FileHandle[]>([])
  const [fileAnalyses, setFileAnalyses] = useState<FileAnalysis[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showRenameResults, setShowRenameResults] = useState(false)
  const [renameResults, setRenameResults] = useState<RenameResult[]>([])
  const [progress, setProgress] = useState<ProgressState>({
    totalFiles: 0,
    processedFiles: 0,
    currentBatch: [],
    filesPerSecond: 0,
    estimatedTimeRemaining: 0,
    individualProgress: new Map()
  })
  
  const startTimeRef = useRef<number>(0)
  const processedCountRef = useRef<number>(0)

  // Select files from local file system
  const selectFiles = async () => {
    try {
      console.log('[SmartSync] Requesting file selection')
      
      // @ts-ignore - File System Access API
      const fileHandles = await window.showOpenFilePicker({
        multiple: true
      })
      
      const files: FileHandle[] = fileHandles.map((handle: any) => ({
        name: handle.name,
        kind: 'file',
        path: handle.name,
        fileHandle: handle
      }))
      
      console.log('[SmartSync] Files selected:', files.length)
      setSelectedFiles(files)
      setPermissionGranted(true)
      
      showToast.success(`Selected ${files.length} files for analysis`)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[SmartSync] File selection error:', err)
        showToast.error('Failed to select files')
      }
      // User cancelled - no error needed
    }
  }

  // Select folder from local file system
  const selectFolder = async () => {
    try {
      console.log('[SmartSync] Requesting folder selection')
      
      // @ts-ignore - File System Access API
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read'
      })
      
      console.log('[SmartSync] Permission requested for:', dirHandle.name)
      setPermissionGranted(true)
      
      // Recursively get all files in the directory
      const files = await getFilesFromDirectory(dirHandle, dirHandle.name, dirHandle)
      console.log('[SmartSync] Files found in folder:', files.length)
      
      setSelectedFiles(files)
      showToast.success(`Found ${files.length} files in selected folder`)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[SmartSync] Folder selection error:', err)
        showToast.error('Failed to select folder')
      }
      // User cancelled - no error needed
    }
  }

  // Recursively get files from directory
  const getFilesFromDirectory = async (
    dirHandle: any, 
    path: string,
    rootDirHandle?: any
  ): Promise<FileHandle[]> => {
    const files: FileHandle[] = []
    
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        files.push({
          name: entry.name,
          kind: 'file',
          path: `${path}/${entry.name}`,
          fileHandle: entry,
          parentDirHandle: rootDirHandle || dirHandle
        })
      } else if (entry.kind === 'directory') {
        const subFiles = await getFilesFromDirectory(entry, `${path}/${entry.name}`, rootDirHandle || dirHandle)
        files.push(...subFiles)
      }
    }
    
    return files
  }

  // Calculate progress metrics
  const updateProgressMetrics = useCallback(() => {
    if (startTimeRef.current === 0) return
    
    const elapsed = (Date.now() - startTimeRef.current) / 1000 // seconds
    const filesPerSecond = processedCountRef.current / elapsed
    const remaining = progress.totalFiles - progress.processedFiles
    const estimatedTimeRemaining = remaining / filesPerSecond
    
    setProgress(prev => ({
      ...prev,
      filesPerSecond: Math.round(filesPerSecond * 10) / 10,
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining)
    }))
    
    console.log('[SmartSync] Progress:', {
      percentage: ((progress.processedFiles / progress.totalFiles) * 100).toFixed(1),
      filesPerSecond: filesPerSecond.toFixed(1)
    })
  }, [progress.totalFiles, progress.processedFiles])

  // Analyze files using AI
  const analyzeFiles = async () => {
    if (selectedFiles.length === 0) {
      showToast.error('No files selected')
      return
    }
    
    console.log('[SmartSync] Starting analysis of', selectedFiles.length, 'files')
    setIsAnalyzing(true)
    setShowResults(false)
    startTimeRef.current = Date.now()
    processedCountRef.current = 0
    
    // Initialize progress
    setProgress({
      totalFiles: selectedFiles.length,
      processedFiles: 0,
      currentBatch: [],
      filesPerSecond: 0,
      estimatedTimeRemaining: 0,
      individualProgress: new Map()
    })
    
    try {
      // Convert FileHandle to File objects
      const files: File[] = []
      for (const fileHandle of selectedFiles) {
        if (fileHandle.fileHandle) {
          const file = await fileHandle.fileHandle.getFile()
          files.push(file)
        }
      }
      
      if (files.length === 0) {
        showToast.error('No valid files to analyze')
        setIsAnalyzing(false)
        return
      }
      
      // Dynamically set concurrent workers based on file count
      const concurrentWorkers = Math.min(
        Math.max(5, Math.floor(files.length / 10)), // At least 5, or 10% of files
        20 // Cap at 20 to avoid overwhelming the API
      )
      
      console.log(`[SmartSync] Using ${concurrentWorkers} concurrent workers for ${files.length} files`)
      
      // Use SmartSyncProcessor for parallel processing
      const processor = new SmartSyncProcessor(concurrentWorkers)
      
      const results = await processor.processBatch(files, (completed, total) => {
        processedCountRef.current = completed
        
        // Update progress
        setProgress(prev => ({
          ...prev,
          processedFiles: completed,
          individualProgress: new Map(
            files.slice(0, completed).map(f => [f.name, 100])
          )
        }))
        
        updateProgressMetrics()
        
        // Update current batch (show last 5 processing files)
        const currentBatchStart = Math.max(0, completed - 5)
        const currentBatch = files.slice(currentBatchStart, completed).map(f => f.name)
        setProgress(prev => ({ ...prev, currentBatch }))
      })
      
      // Convert results to FileAnalysis format
      const analyses: FileAnalysis[] = results.map((result, index) => ({
        originalName: result.originalName,
        suggestedName: result.suggestedName,
        confidence: result.confidence,
        reasoning: result.reasoning,
        selected: true,
        edited: false
      }))
      
      console.log('[SmartSync] Analysis complete:', analyses.length, 'files analyzed')
      setFileAnalyses(analyses)
      setShowResults(true)
      
      showToast.success('Analysis complete! Review the suggestions below.')
      
    } catch (error) {
      console.error('[SmartSync] Analysis error:', error)
      showToast.error('Failed to analyze files. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Toggle file selection
  const toggleFileSelection = (index: number) => {
    setFileAnalyses(prev => prev.map((analysis, i) => 
      i === index ? { ...analysis, selected: !analysis.selected } : analysis
    ))
  }

  // Update suggested name
  const updateSuggestedName = (index: number, newName: string) => {
    setFileAnalyses(prev => prev.map((analysis, i) => 
      i === index ? { ...analysis, suggestedName: newName, edited: true } : analysis
    ))
  }

  // Check if browser supports file move/rename
  const checkMoveSupport = async (fileHandle: any): Promise<boolean> => {
    try {
      // Check if the move method exists and works
      if ('move' in fileHandle && typeof fileHandle.move === 'function') {
        console.log('[SmartSync] Browser supports move() method')
        return true
      }
    } catch (e) {
      console.log('[SmartSync] Move method not supported:', e)
    }
    return false
  }

  // Apply selected renames
  const applyRenames = async () => {
    const selectedAnalyses = fileAnalyses.filter(a => a.selected)
    if (selectedAnalyses.length === 0) {
      showToast.error('No files selected for renaming')
      return
    }
    
    console.log('[SmartSync] Applying renames to', selectedAnalyses.length, 'files')
    setIsRenaming(true)
    
    let successCount = 0
    let errorCount = 0
    let skipCount = 0
    const results: RenameResult[] = []
    
    try {
      // Check if we can use the move() method
      const testHandle = selectedFiles[0]?.fileHandle
      const canUseMove = testHandle ? await checkMoveSupport(testHandle) : false
      
      // Show initial status
      showToast.info(`Renaming ${selectedAnalyses.length} files...`)
      
      // Process renames
      for (const analysis of selectedAnalyses) {
        try {
          const fileHandleInfo = selectedFiles.find(f => f.name === analysis.originalName)
          
          if (!fileHandleInfo?.fileHandle) {
            console.error('[SmartSync] File handle not found for:', analysis.originalName)
            errorCount++
            continue
          }
          
          // Skip if new name is same as original
          if (analysis.originalName === analysis.suggestedName) {
            console.log('[SmartSync] Skipping - same name:', analysis.originalName)
            skipCount++
            continue
          }
          
          // Try to use move() first if supported
          if (canUseMove && fileHandleInfo.parentDirHandle) {
            try {
              // Attempt to move/rename the file in place
              await fileHandleInfo.fileHandle.move(fileHandleInfo.parentDirHandle, analysis.suggestedName)
              console.log('[SmartSync] Successfully renamed in place:', analysis.originalName, '->', analysis.suggestedName)
              successCount++
              results.push({
                originalName: analysis.originalName,
                suggestedName: analysis.suggestedName,
                status: 'success',
                newLocation: 'Renamed in place'
              })
              continue
            } catch (moveError: any) {
              console.warn('[SmartSync] Move failed, falling back to save dialog:', moveError)
              // Fall through to save dialog approach
            }
          }
          
          // Fallback: Read content and save with new name
          const originalFile = await fileHandleInfo.fileHandle.getFile()
          const content = await originalFile.arrayBuffer()
          
          // Extract file extension
          const ext = analysis.suggestedName.lastIndexOf('.') > -1 
            ? analysis.suggestedName.slice(analysis.suggestedName.lastIndexOf('.'))
            : ''
          
          try {
            // Create save options
            const saveOptions: any = {
              suggestedName: analysis.suggestedName,
            }
            
            // Add file type if we have an extension
            if (ext) {
              saveOptions.types = [{
                description: `${ext.toUpperCase().replace('.', '')} files`,
                accept: { [`${originalFile.type || 'application/octet-stream'}`]: [ext] }
              }]
            }
            
            // Try to use the parent directory if available
            if (fileHandleInfo.parentDirHandle) {
              saveOptions.startIn = fileHandleInfo.parentDirHandle
            }
            
            // Show save file picker
            // @ts-ignore - File System Access API
            const newFileHandle = await window.showSaveFilePicker(saveOptions)
            
            // Write content to the new file
            const writable = await newFileHandle.createWritable()
            await writable.write(content)
            await writable.close()
            
            console.log('[SmartSync] Successfully saved:', analysis.originalName, 'as', analysis.suggestedName)
            successCount++
            results.push({
              originalName: analysis.originalName,
              suggestedName: analysis.suggestedName,
              status: 'success',
              newLocation: 'Saved to new location'
            })
            
          } catch (saveError: any) {
            if (saveError.name === 'AbortError') {
              console.log('[SmartSync] User cancelled save for:', analysis.originalName)
              skipCount++
              results.push({
                originalName: analysis.originalName,
                suggestedName: analysis.suggestedName,
                status: 'skipped'
              })
            } else {
              console.error('[SmartSync] Save error for', analysis.originalName, saveError)
              errorCount++
              results.push({
                originalName: analysis.originalName,
                suggestedName: analysis.suggestedName,
                status: 'error'
              })
            }
          }
          
        } catch (error) {
          console.error('[SmartSync] Rename error for', analysis.originalName, error)
          errorCount++
          results.push({
            originalName: analysis.originalName,
            suggestedName: analysis.suggestedName,
            status: 'error'
          })
        }
      }
      
      console.log('[SmartSync] Renames complete:', { success: successCount, errors: errorCount, skipped: skipCount })
      
      // Store results for display
      setRenameResults(results)
      
      // Show results
      if (successCount > 0) {
        showToast.success(`Successfully renamed ${successCount} file${successCount > 1 ? 's' : ''}!`)
        
        // Show rename results view
        setShowResults(false)
        setShowRenameResults(true)
        
        // If we used the save dialog, remind about manual deletion
        const savedToNewLocation = results.some(r => r.status === 'success' && r.newLocation === 'Saved to new location')
        if (savedToNewLocation) {
          showToast.info('Original files remain. Review the results below.')
        }
      } else {
        // Only show error/skip messages if no success
        if (errorCount > 0) {
          showToast.error(`Failed to rename ${errorCount} file${errorCount > 1 ? 's' : ''}`)
        }
        
        if (skipCount > 0 && errorCount === 0) {
          showToast.info(`${skipCount} file${skipCount > 1 ? 's' : ''} skipped (no changes or cancelled)`)
        }
      }
      
    } catch (error) {
      console.error('[SmartSync] Batch rename error:', error)
      showToast.error('Failed to rename files. Please try again.')
    } finally {
      setIsRenaming(false)
      
      // Don't reset state if showing results
      if (successCount === 0) {
        // Only reset if no files were renamed
        setIsRenaming(false)
      }
    }
  }

  // Copy results to clipboard
  const copyResultsToClipboard = () => {
    const successfulRenames = renameResults.filter(r => r.status === 'success' && r.newLocation === 'Saved to new location')
    const text = successfulRenames
      .map(r => `Original: ${r.originalName}\nRenamed to: ${r.suggestedName}`)
      .join('\n\n')
    
    navigator.clipboard.writeText(text).then(() => {
      showToast.success('Copied to clipboard!')
    }).catch(() => {
      showToast.error('Failed to copy to clipboard')
    })
  }

  // Reset selection
  const resetSelection = () => {
    console.log('[SmartSync] Resetting selection')
    setSelectedFiles([])
    setFileAnalyses([])
    setShowResults(false)
    setShowRenameResults(false)
    setRenameResults([])
    setPermissionGranted(false)
    setProgress({
      totalFiles: 0,
      processedFiles: 0,
      currentBatch: [],
      filesPerSecond: 0,
      estimatedTimeRemaining: 0,
      individualProgress: new Map()
    })
    
    // Notify parent component
    onFilesRenamed?.()
  }

  const progressPercentage = progress.totalFiles > 0 
    ? (progress.processedFiles / progress.totalFiles) * 100 
    : 0

  return (
    <div className="w-full h-full min-h-[600px] bg-background/50 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden">
      <div className="h-full p-4 md:p-6 lg:p-8 flex flex-col">
        <div className="h-full flex flex-col space-y-4 md:space-y-6 min-h-0">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-xl md:text-2xl lg:text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 md:h-7 md:w-7 lg:h-8 lg:w-8 text-primary" />
              SmartSync - Intelligent File Management
            </h2>
            <p className="text-sm md:text-base text-muted-foreground">
              Transform chaos into clarity with AI-powered file organization
            </p>
          </div>
          {permissionGranted && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetSelection}
              className="text-muted-foreground"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
        </div>

        {/* Main Action Area */}
        {!permissionGranted && !showResults && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 flex-1">
            {/* Sync Local Files */}
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl gradient-sky-sage gradient-card group hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col">
                <div className="relative z-10 flex flex-col flex-1 justify-between">
                  <div className="space-y-3">
                    <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <Files className="h-6 w-6 md:h-7 md:w-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-base md:text-lg">Sync Local Files</h3>
                      <p className="text-xs md:text-sm text-white/80 mt-0.5">
                        Access and analyze files from your computer
                      </p>
                    </div>
                  </div>
                  <Button 
                    className="w-full mt-4 bg-white/20 backdrop-blur border-white/30 text-white hover:bg-white/30 text-sm" 
                    variant="ghost"
                    onClick={selectFiles}
                  >
                    Select Files
                  </Button>
                </div>
                {/* Subtle animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              
              {/* Feature list */}
              <div className="space-y-1.5 px-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>Multi-select support</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>All file types accepted</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>Instant preview</span>
                </div>
              </div>
            </div>

            {/* Batch Intelligence */}
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl gradient-ochre-terracotta gradient-card group hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col">
                <div className="relative z-10 flex flex-col flex-1 justify-between">
                  <div className="space-y-3">
                    <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <FolderOpen className="h-6 w-6 md:h-7 md:w-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-base md:text-lg">Batch Intelligence</h3>
                      <p className="text-xs md:text-sm text-white/80 mt-0.5">
                        Process entire folders simultaneously
                      </p>
                    </div>
                  </div>
                  <Button 
                    className="w-full mt-4 bg-white/20 backdrop-blur border-white/30 text-white hover:bg-white/30 text-sm" 
                    variant="ghost"
                    onClick={selectFolder}
                  >
                    Select Folder
                  </Button>
                </div>
                {/* Subtle animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              
              {/* Feature list */}
              <div className="space-y-1.5 px-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>Recursive scanning</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>Maintains folder structure</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>Parallel processing</span>
                </div>
              </div>
            </div>

            {/* Smart Rename */}
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl gradient-sunset gradient-card group hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col">
                <div className="relative z-10 flex flex-col flex-1 justify-between">
                  <div className="space-y-3">
                    <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <Zap className="h-6 w-6 md:h-7 md:w-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-base md:text-lg">Smart Rename</h3>
                      <p className="text-xs md:text-sm text-white/80 mt-0.5">
                        AI suggests contextual names instantly
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/70 mt-auto pt-3">
                    <Shield className="h-3 w-3" />
                    <span>Privacy-first design</span>
                  </div>
                </div>
                {/* Subtle animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              
              {/* Feature list */}
              <div className="space-y-1.5 px-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>Context-aware naming</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>Batch renaming</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>Preview before apply</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* File Selection Display */}
        {permissionGranted && !isAnalyzing && !showResults && !showRenameResults && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm md:text-base">
                  {selectedFiles.length} files selected
                </Badge>
                <span className="text-xs md:text-sm text-muted-foreground">
                  Ready for analysis
                </span>
              </div>
              <Button 
                onClick={analyzeFiles} 
                disabled={selectedFiles.length === 0}
                className="w-full sm:w-auto"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Analyze Selected
              </Button>
            </div>
            
            <div className="flex-1 min-h-0 overflow-hidden rounded-lg border bg-muted/20">
              <ScrollArea className="h-full w-full">
                <div className="p-4">
                  <div className="space-y-1 pr-3">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="text-xs md:text-sm flex items-center gap-2 py-0.5">
                        <Files className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="truncate text-muted-foreground">{file.path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        {/* Progress Visualization */}
        {isAnalyzing && (
          <div className="flex-1 flex flex-col justify-center space-y-6 py-8">
            {/* Main Progress Info */}
            <div className="text-center space-y-2">
              <h3 className="text-2xl md:text-3xl font-bold">
                Analyzing Your Files
              </h3>
              <p className="text-muted-foreground">
                Processing {progress.currentBatch.length} files in parallel with AI
              </p>
            </div>

            {/* Large Circular Progress */}
            <div className="relative w-48 h-48 md:w-64 md:h-64 mx-auto">
              <svg className="w-full h-full transform -rotate-90">
                {/* Background circle */}
                <circle
                  cx="50%"
                  cy="50%"
                  r="45%"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-muted/20"
                />
                {/* Progress circle */}
                <circle
                  cx="50%"
                  cy="50%"
                  r="45%"
                  fill="none"
                  stroke="url(#gradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${progressPercentage * 2.83} 283`}
                  className="transition-all duration-700 ease-out"
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#61aaf2" />
                    <stop offset="50%" stopColor="#8a9a8c" />
                    <stop offset="100%" stopColor="#e8af46" />
                  </linearGradient>
                </defs>
              </svg>
              
              {/* Center content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl md:text-5xl font-bold">
                  {progressPercentage.toFixed(0)}%
                </span>
                <span className="text-sm text-muted-foreground">
                  {progress.processedFiles} of {progress.totalFiles}
                </span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto w-full">
              <div className="text-center space-y-1">
                <div className="text-2xl md:text-3xl font-bold text-primary">
                  {progress.filesPerSecond}
                </div>
                <p className="text-xs md:text-sm text-muted-foreground">files/sec</p>
              </div>
              
              <div className="text-center space-y-1">
                <div className="text-2xl md:text-3xl font-bold text-primary">
                  {progress.estimatedTimeRemaining}s
                </div>
                <p className="text-xs md:text-sm text-muted-foreground">remaining</p>
              </div>
              
              <div className="text-center space-y-1">
                <div className="text-2xl md:text-3xl font-bold text-primary">
                  {progress.currentBatch.length}
                </div>
                <p className="text-xs md:text-sm text-muted-foreground">parallel</p>
              </div>
            </div>

            {/* File processing animation */}
            <div className="space-y-2">
              <p className="text-xs text-center text-muted-foreground mb-2">Currently processing:</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-3xl mx-auto">
                {progress.currentBatch.slice(-5).map((fileName, idx) => (
                  <Badge 
                    key={`${fileName}-${idx}`} 
                    variant="secondary" 
                    className="text-xs animate-pulse"
                  >
                    <Files className="h-3 w-3 mr-1" />
                    {fileName.length > 20 ? fileName.substring(0, 20) + '...' : fileName}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Linear progress bar at bottom */}
            <div className="space-y-2 max-w-3xl mx-auto w-full">
              <div className="relative h-2 rounded-full overflow-hidden bg-muted/20">
                <div 
                  className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary to-primary/20 transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                />
                {/* Animated shine effect */}
                <div 
                  className="absolute inset-0 w-full h-full opacity-30"
                  style={{ width: `${progressPercentage}%` }}
                >
                  <div className="h-full w-20 bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Review */}
        {showResults && (
          <div className="space-y-4 flex-1 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h3 className="font-semibold text-lg md:text-xl">Review Suggestions</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFileAnalyses(prev => 
                    prev.map(a => ({ ...a, selected: true }))
                  )}
                  className="text-xs md:text-sm"
                >
                  Select All
                </Button>
                <Button
                  onClick={applyRenames}
                  disabled={isRenaming || !fileAnalyses.some(a => a.selected)}
                  className="text-xs md:text-sm"
                >
                  {isRenaming ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Apply Selected
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            <ScrollArea className="flex-1 min-h-[400px] md:min-h-[500px] lg:min-h-[600px] w-full rounded-lg border bg-muted/10">
              <div className="p-4 space-y-3">
                {fileAnalyses.map((analysis, index) => (
                  <Card key={index} className="p-4 md:p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-3 md:gap-4">
                      <Checkbox
                        checked={analysis.selected}
                        onCheckedChange={() => toggleFileSelection(index)}
                        className="mt-1"
                      />
                      
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                          <div>
                            <p className="text-xs md:text-sm text-muted-foreground mb-1">Original</p>
                            <p className="font-mono text-xs md:text-sm break-all">{analysis.originalName}</p>
                          </div>
                          
                          <div>
                            <p className="text-xs md:text-sm text-muted-foreground mb-1">Suggested</p>
                            <div className="flex items-center gap-2">
                              <Input
                                value={analysis.suggestedName}
                                onChange={(e) => updateSuggestedName(index, e.target.value)}
                                className="font-mono text-xs md:text-sm h-7 md:h-8"
                              />
                              {analysis.edited && (
                                <Edit2 className="h-3 w-3 md:h-4 md:w-4 text-primary flex-shrink-0" />
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          <div className="flex items-center gap-2">
                            <div className="text-xs md:text-sm text-muted-foreground">Confidence:</div>
                            <div className="flex items-center gap-1">
                              <div className="w-20 md:w-24 h-2 md:h-2.5 bg-muted/30 rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full transition-all duration-500",
                                    analysis.confidence > 0.8 ? "gradient-nature" :
                                    analysis.confidence > 0.6 ? "gradient-ochre-terracotta" :
                                    "gradient-sunset"
                                  )}
                                  style={{ width: `${analysis.confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-xs md:text-sm font-medium">
                                {(analysis.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          
                          {analysis.reasoning && (
                            <div className="flex items-start gap-1 text-xs text-muted-foreground">
                              <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{analysis.reasoning}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Rename Results */}
        {showRenameResults && (
          <div className="space-y-4 flex-1 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h3 className="font-semibold text-lg md:text-xl">Rename Results</h3>
              <div className="flex items-center gap-2">
                {renameResults.some(r => r.status === 'success' && r.newLocation === 'Saved to new location') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyResultsToClipboard}
                    className="text-xs md:text-sm"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy List
                  </Button>
                )}
                <Button
                  onClick={resetSelection}
                  className="text-xs md:text-sm"
                >
                  Done
                </Button>
              </div>
            </div>
            
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-5 w-5" />
                  <span className="text-2xl font-bold">{renameResults.filter(r => r.status === 'success').length}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Renamed</p>
              </Card>
              
              <Card className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="text-2xl font-bold">{renameResults.filter(r => r.status === 'skipped').length}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Skipped</p>
              </Card>
              
              <Card className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400">
                  <XCircle className="h-5 w-5" />
                  <span className="text-2xl font-bold">{renameResults.filter(r => r.status === 'error').length}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Failed</p>
              </Card>
            </div>
            
            {/* Results List */}
            <div className="flex-1 min-h-0 rounded-lg border bg-muted/10">
              <ScrollArea className="h-full w-full p-4">
                <div className="space-y-2 pr-3">
                  {renameResults.map((result, index) => (
                    <Card key={index} className={cn(
                      "p-3 transition-colors",
                      result.status === 'success' && "border-green-500/20 bg-green-500/5",
                      result.status === 'error' && "border-red-500/20 bg-red-500/5",
                      result.status === 'skipped' && "border-yellow-500/20 bg-yellow-500/5"
                    )}>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {result.status === 'success' && <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />}
                          {result.status === 'error' && <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />}
                          {result.status === 'skipped' && <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />}
                        </div>
                        
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="text-sm">
                            <span className="text-muted-foreground">Original:</span>{' '}
                            <span className="font-mono break-all">{result.originalName}</span>
                          </div>
                          {result.status === 'success' && (
                            <>
                              <div className="text-sm">
                                <span className="text-muted-foreground">Renamed to:</span>{' '}
                                <span className="font-mono break-all text-green-600 dark:text-green-400">{result.suggestedName}</span>
                              </div>
                              {result.newLocation && (
                                <div className="text-xs text-muted-foreground">
                                  {result.newLocation === 'Renamed in place' 
                                    ? '✓ File renamed in original location'
                                    : '⚠️ Saved as new file - original remains'}
                                </div>
                              )}
                            </>
                          )}
                          {result.status === 'skipped' && (
                            <div className="text-xs text-muted-foreground">Operation cancelled by user</div>
                          )}
                          {result.status === 'error' && (
                            <div className="text-xs text-red-600 dark:text-red-400">Failed to rename file</div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
            
            {/* Instructions for manual deletion */}
            {renameResults.some(r => r.status === 'success' && r.newLocation === 'Saved to new location') && (
              <Card className="p-4 bg-yellow-500/10 border-yellow-500/20">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Manual Cleanup Required</p>
                    <p className="text-xs text-muted-foreground">
                      Some files were saved to new locations. The original files remain in place and need to be deleted manually.
                      Use the "Copy List" button to get a list of files that were successfully renamed.
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}