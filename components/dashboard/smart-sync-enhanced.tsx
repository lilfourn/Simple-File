'use client'

import { useState, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
  AlertTriangle,
  Download,
  Eye,
  FolderTree,
  FileDown
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { showToast } from '@/utils/toast-helper'
import { SmartSyncProcessor } from '@/utils/smart-sync-processor'
import { FileDownloader, type DownloadableFile, type FolderStructure } from '@/utils/file-downloader'
import { FolderReorganizer } from '@/utils/folder-reorganizer'
import { FilePreviewModal } from './file-preview-modal'
import { SmartSyncSummary } from './smart-sync-summary'
import { DeleteConfirmationDialog } from './delete-confirmation-dialog'

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
  file?: File
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

export default function SmartSyncEnhanced({ workspaceId, onFilesRenamed }: SmartSyncProps) {
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<FileHandle[]>([])
  const [fileAnalyses, setFileAnalyses] = useState<FileAnalysis[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showDownloadResults, setShowDownloadResults] = useState(false)
  const [downloadResults, setDownloadResults] = useState<RenameResult[]>([])
  const [progress, setProgress] = useState<ProgressState>({
    totalFiles: 0,
    processedFiles: 0,
    currentBatch: [],
    filesPerSecond: 0,
    estimatedTimeRemaining: 0,
    individualProgress: new Map()
  })
  
  // New states for enhanced features
  const [useSummaryView, setUseSummaryView] = useState(false)
  const [reorganizeFolders, setReorganizeFolders] = useState(false)
  const [folderStructure, setFolderStructure] = useState<any>(null)
  const [selectedFolder, setSelectedFolder] = useState<FileHandle | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ original: File; renamed?: File; originalName: string; suggestedName: string } | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [downloadLocation, setDownloadLocation] = useState<string>('')
  
  const startTimeRef = useRef<number>(0)
  const processedCountRef = useRef<number>(0)
  const downloadedFilesRef = useRef<DownloadableFile[]>([])

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
      setSelectedFolder(null)
      setReorganizeFolders(false)
      
      // Auto-enable summary view for large file sets
      if (files.length > 50) {
        setUseSummaryView(true)
      }
      
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
      
      // Store the folder handle
      setSelectedFolder({
        name: dirHandle.name,
        kind: 'directory',
        path: dirHandle.name,
        dirHandle: dirHandle
      })
      
      // Recursively get all files in the directory
      const files = await getFilesFromDirectory(dirHandle, dirHandle.name, dirHandle)
      console.log('[SmartSync] Files found in folder:', files.length)
      
      setSelectedFiles(files)
      
      // Auto-enable summary view for large file sets
      if (files.length > 50) {
        setUseSummaryView(true)
      }
      
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
      
      // Convert results to FileAnalysis format with file reference
      const analyses: FileAnalysis[] = results.map((result, index) => ({
        originalName: result.originalName,
        suggestedName: result.suggestedName,
        confidence: result.confidence,
        reasoning: result.reasoning,
        selected: true,
        edited: false,
        file: files[index]
      }))
      
      console.log('[SmartSync] Analysis complete:', analyses.length, 'files analyzed')
      setFileAnalyses(analyses)
      setShowResults(true)
      
      // If folder reorganization is enabled, analyze folder structure
      if (reorganizeFolders && selectedFolder) {
        const fileInfos = analyses.map(a => ({
          name: a.originalName,
          suggestedName: a.suggestedName,
          type: a.file?.type || '',
          size: a.file?.size || 0,
          extension: a.suggestedName.split('.').pop() || ''
        }))
        
        const structure = FolderReorganizer.analyzeFolderStructure(fileInfos)
        setFolderStructure(structure)
        console.log('[SmartSync] Folder structure analyzed:', structure)
      }
      
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

  // Handle bulk selection changes from summary view
  const handleBulkSelectionChange = (indices: number[]) => {
    setFileAnalyses(prev => prev.map((analysis, i) => ({
      ...analysis,
      selected: indices.includes(i)
    })))
  }

  // Download renamed files
  const downloadRenamedFiles = async () => {
    const selectedAnalyses = fileAnalyses.filter(a => a.selected)
    if (selectedAnalyses.length === 0) {
      showToast.error('No files selected for download')
      return
    }
    
    console.log('[SmartSync] Downloading', selectedAnalyses.length, 'renamed files')
    setIsDownloading(true)
    downloadedFilesRef.current = []
    
    try {
      // Prepare downloadable files
      const downloadableFiles: DownloadableFile[] = []
      
      for (const analysis of selectedAnalyses) {
        if (!analysis.file) continue
        
        const content = await analysis.file.arrayBuffer()
        const fileHandle = selectedFiles.find(f => f.name === analysis.originalName)
        
        downloadableFiles.push({
          originalName: analysis.originalName,
          suggestedName: analysis.suggestedName,
          content,
          path: fileHandle?.path ? fileHandle.path.substring(0, fileHandle.path.lastIndexOf('/')) : undefined
        })
      }
      
      downloadedFilesRef.current = downloadableFiles
      
      // Determine download method
      if (downloadableFiles.length === 1) {
        // Single file download
        await FileDownloader.downloadSingleFile(downloadableFiles[0])
        setDownloadLocation('Downloads folder')
      } else if (reorganizeFolders && folderStructure) {
        // Download with reorganized structure
        const fileInfoStructure = FolderReorganizer.flattenStructure(folderStructure)
        
        // Convert FileInfo structure to DownloadableFile structure
        const downloadableStructure: FolderStructure = {}
        for (const [path, fileInfos] of Object.entries(fileInfoStructure)) {
          // Map FileInfos to their corresponding DownloadableFiles
          downloadableStructure[path] = fileInfos.map(info => {
            const downloadable = downloadableFiles.find(d => d.originalName === info.name)
            return downloadable!
          }).filter(Boolean)
        }
        
        await FileDownloader.downloadReorganizedFolder(
          downloadableFiles,
          downloadableStructure,
          `${selectedFolder?.name || 'files'}-reorganized.zip`
        )
        setDownloadLocation('Downloads folder (ZIP)')
      } else {
        // Multiple files as ZIP
        const zipName = selectedFolder 
          ? `${selectedFolder.name}-renamed.zip`
          : 'renamed-files.zip'
        
        await FileDownloader.downloadWithManifest(downloadableFiles, zipName)
        setDownloadLocation('Downloads folder (ZIP)')
      }
      
      setShowDownloadResults(true)
      showToast.success('Files downloaded successfully!')
      
      // Show delete confirmation dialog after successful download
      setTimeout(() => {
        setShowDeleteDialog(true)
      }, 1000)
      
    } catch (error) {
      console.error('[SmartSync] Download error:', error)
      showToast.error('Failed to download files. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  // Handle delete confirmation
  const handleDeleteOriginalFiles = async () => {
    console.log('[SmartSync] User chose to delete original files')
    
    // In a real implementation, you would delete the files here
    // For now, we'll just show a message
    showToast.info('Original files would be deleted here (not implemented for safety)')
    
    // Reset state
    resetSelection()
  }

  // Preview file
  const handlePreviewFile = (analysis: FileAnalysis) => {
    if (!analysis.file) return
    
    setPreviewFile({
      original: analysis.file,
      originalName: analysis.originalName,
      suggestedName: analysis.suggestedName
    })
    setShowPreviewModal(true)
  }

  // Export summary
  const handleExportSummary = (format: 'csv' | 'json') => {
    const data = fileAnalyses.map(a => ({
      originalName: a.originalName,
      suggestedName: a.suggestedName,
      confidence: a.confidence,
      reasoning: a.reasoning,
      selected: a.selected
    }))
    
    if (format === 'csv') {
      const csv = [
        'Original Name,Suggested Name,Confidence,Reasoning,Selected',
        ...data.map(d => 
          `"${d.originalName}","${d.suggestedName}",${d.confidence},"${d.reasoning}",${d.selected}`
        )
      ].join('\n')
      
      const blob = new Blob([csv], { type: 'text/csv' })
      saveAs(blob, 'smart-sync-summary.csv')
    } else {
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      saveAs(blob, 'smart-sync-summary.json')
    }
    
    showToast.success(`Summary exported as ${format.toUpperCase()}`)
  }

  // Reset selection
  const resetSelection = () => {
    console.log('[SmartSync] Resetting selection')
    setSelectedFiles([])
    setFileAnalyses([])
    setShowResults(false)
    setShowDownloadResults(false)
    setDownloadResults([])
    setPermissionGranted(false)
    setSelectedFolder(null)
    setFolderStructure(null)
    setReorganizeFolders(false)
    setUseSummaryView(false)
    setProgress({
      totalFiles: 0,
      processedFiles: 0,
      currentBatch: [],
      filesPerSecond: 0,
      estimatedTimeRemaining: 0,
      individualProgress: new Map()
    })
    downloadedFilesRef.current = []
    
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
                  <span>Folder reorganization</span>
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
                  <span>Safe download first</span>
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
        {permissionGranted && !isAnalyzing && !showResults && !showDownloadResults && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm md:text-base">
                  {selectedFiles.length} files selected
                </Badge>
                {selectedFolder && (
                  <Badge variant="outline" className="text-sm md:text-base">
                    <FolderOpen className="h-3 w-3 mr-1" />
                    {selectedFolder.name}
                  </Badge>
                )}
                <span className="text-xs md:text-sm text-muted-foreground">
                  Ready for analysis
                </span>
              </div>
              
              {/* Options for folder processing */}
              {selectedFolder && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="reorganize"
                    checked={reorganizeFolders}
                    onCheckedChange={setReorganizeFolders}
                  />
                  <Label htmlFor="reorganize" className="text-sm cursor-pointer">
                    <FolderTree className="h-4 w-4 inline mr-1" />
                    Reorganize folder structure
                  </Label>
                </div>
              )}
              
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
              <div className="flex items-center gap-4">
                <h3 className="font-semibold text-lg md:text-xl">Review Suggestions</h3>
                <Badge variant="secondary" className="text-xs">
                  {fileAnalyses.filter(a => a.selected).length} / {fileAnalyses.length} selected
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {fileAnalyses.length > 20 && (
                  <div className="flex items-center gap-2 mr-2">
                    <Switch
                      id="summary"
                      checked={useSummaryView}
                      onCheckedChange={setUseSummaryView}
                    />
                    <Label htmlFor="summary" className="text-sm cursor-pointer">
                      {useSummaryView ? 'Compact' : 'Detailed'}
                    </Label>
                  </div>
                )}
                <Button
                  onClick={downloadRenamedFiles}
                  disabled={isDownloading || !fileAnalyses.some(a => a.selected)}
                  className="text-xs md:text-sm"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download Selected
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            {useSummaryView || fileAnalyses.length > 20 ? (
              <SmartSyncSummary
                analyses={fileAnalyses}
                onSelectionChange={handleBulkSelectionChange}
                onApplyRenames={downloadRenamedFiles}
                onExportSummary={handleExportSummary}
                isRenaming={isDownloading}
              />
            ) : (
              <ScrollArea className="flex-1 min-h-[400px] md:min-h-[500px] lg:min-h-[600px] w-full rounded-lg border bg-muted/10">
                <div className="p-2 md:p-3">
                  {/* Compact Header */}
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                    <Checkbox
                      checked={fileAnalyses.length > 0 && fileAnalyses.every(a => a.selected)}
                      onCheckedChange={(checked) => {
                        const newAnalyses = fileAnalyses.map(a => ({ ...a, selected: !!checked }))
                        setFileAnalyses(newAnalyses)
                      }}
                      className="ml-1"
                    />
                    <span className="text-xs text-muted-foreground ml-2">Select All</span>
                    <div className="ml-auto flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleBulkSelectionChange(fileAnalyses.map((a, i) => a.confidence >= 0.8 ? i : -1).filter(i => i !== -1))}
                        className="text-xs"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        High Confidence
                      </Button>
                    </div>
                  </div>
                  
                  {/* Compact File List */}
                  <div className="space-y-1">
                    {fileAnalyses.map((analysis, index) => (
                      <div
                        key={index}
                        className={cn(
                          "group rounded-md transition-all hover:bg-muted/50 p-2",
                          analysis.selected && "bg-muted/30"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={analysis.selected}
                            onCheckedChange={() => toggleFileSelection(index)}
                            className="mt-0.5"
                          />
                          
                          <div className="flex-1 min-w-0">
                            {/* Compact single-line view */}
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs truncate max-w-[40%]" title={analysis.originalName}>
                                {analysis.originalName}
                              </span>
                              <span className="text-xs text-muted-foreground">→</span>
                              <Input
                                value={analysis.suggestedName}
                                onChange={(e) => updateSuggestedName(index, e.target.value)}
                                className="font-mono text-xs h-6 flex-1 bg-transparent border-0 px-1 focus:bg-background focus:border-input focus:px-2 transition-all"
                                title={analysis.suggestedName}
                              />
                              {analysis.edited && (
                                <Edit2 className="h-3 w-3 text-primary flex-shrink-0" />
                              )}
                            </div>
                            
                            {/* Confidence and actions row */}
                            <div className="flex items-center gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="flex items-center gap-1">
                                <div className="w-12 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full transition-all duration-500",
                                      analysis.confidence > 0.8 ? "bg-green-500" :
                                      analysis.confidence > 0.6 ? "bg-yellow-500" :
                                      "bg-red-500"
                                    )}
                                    style={{ width: `${analysis.confidence * 100}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  {(analysis.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                              
                              {analysis.reasoning && (
                                <span className="text-[10px] text-muted-foreground truncate flex-1" title={analysis.reasoning}>
                                  {analysis.reasoning}
                                </span>
                              )}
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePreviewFile(analysis)}
                                className="h-5 px-1"
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            )}
            
            {/* Folder structure preview if reorganization is enabled */}
            {reorganizeFolders && folderStructure && (
              <Card className="p-4 mt-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <FolderTree className="h-4 w-4" />
                  Suggested Folder Structure
                </h4>
                <ScrollArea className="h-48">
                  <pre className="text-xs text-muted-foreground">
                    {FolderReorganizer.generateSummary(
                      fileAnalyses.map(a => ({
                        name: a.originalName,
                        suggestedName: a.suggestedName,
                        type: a.file?.type || '',
                        size: a.file?.size || 0,
                        extension: a.suggestedName.split('.').pop() || ''
                      })),
                      folderStructure
                    )}
                  </pre>
                </ScrollArea>
              </Card>
            )}
          </div>
        )}

        {/* Download Results */}
        {showDownloadResults && (
          <div className="space-y-4 flex-1 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h3 className="font-semibold text-lg md:text-xl">Download Complete</h3>
              <Button
                onClick={resetSelection}
                className="text-xs md:text-sm"
              >
                Done
              </Button>
            </div>
            
            {/* Success message */}
            <Card className="p-6 bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-green-800 dark:text-green-300 mb-1">
                    Files Downloaded Successfully
                  </h4>
                  <p className="text-sm text-green-700 dark:text-green-400 mb-3">
                    Your renamed files have been downloaded to: {downloadLocation}
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                      <FileDown className="h-4 w-4" />
                      <span>{downloadedFilesRef.current.length} files renamed and downloaded</span>
                    </div>
                    {reorganizeFolders && (
                      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                        <FolderTree className="h-4 w-4" />
                        <span>Folder structure reorganized</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
            
            {/* Next steps */}
            <Card className="p-4">
              <h4 className="font-semibold mb-3">Next Steps</h4>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Badge className="mt-0.5">1</Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Extract downloaded files</p>
                    <p className="text-xs text-muted-foreground">
                      If you downloaded a ZIP file, extract it to your desired location
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge className="mt-0.5">2</Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Verify the renamed files</p>
                    <p className="text-xs text-muted-foreground">
                      Check that all files have been renamed correctly and content is intact
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge className="mt-0.5">3</Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Delete original files (optional)</p>
                    <p className="text-xs text-muted-foreground">
                      Once you're satisfied, you can delete the original files
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
        </div>
      </div>
      
      {/* Modals */}
      <FilePreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        originalFile={previewFile?.original}
        originalName={previewFile?.originalName || ''}
        suggestedName={previewFile?.suggestedName || ''}
      />
      
      <DeleteConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteOriginalFiles}
        itemCount={downloadedFilesRef.current.length}
        itemType={selectedFolder ? 'folder' : 'file'}
        downloadLocation={downloadLocation}
      />
    </div>
  )
}

// Import saveAs for export functionality
import { saveAs } from 'file-saver'