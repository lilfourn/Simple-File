import JSZip from 'jszip'
import { saveAs } from 'file-saver'

export interface DownloadableFile {
  originalName: string
  suggestedName: string
  content: ArrayBuffer | Blob
  path?: string
}

export interface FolderStructure {
  [path: string]: DownloadableFile[]
}

export class FileDownloader {
  /**
   * Download a single file with the new name
   */
  static async downloadSingleFile(
    file: DownloadableFile,
    preservePath: boolean = false
  ): Promise<void> {
    const blob = file.content instanceof Blob 
      ? file.content 
      : new Blob([file.content])
    
    const fileName = preservePath && file.path 
      ? `${file.path}/${file.suggestedName}`
      : file.suggestedName
    
    saveAs(blob, fileName)
  }

  /**
   * Download multiple files as a ZIP archive
   */
  static async downloadMultipleFiles(
    files: DownloadableFile[],
    zipName: string = 'renamed-files.zip',
    preserveStructure: boolean = true
  ): Promise<void> {
    const zip = new JSZip()
    
    for (const file of files) {
      const blob = file.content instanceof Blob 
        ? file.content 
        : new Blob([file.content])
      
      const filePath = preserveStructure && file.path
        ? `${file.path}/${file.suggestedName}`
        : file.suggestedName
      
      zip.file(filePath, blob)
    }
    
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    
    saveAs(zipBlob, zipName)
  }

  /**
   * Download files with reorganized folder structure
   */
  static async downloadReorganizedFolder(
    files: DownloadableFile[],
    folderStructure: FolderStructure,
    zipName: string = 'reorganized-folder.zip'
  ): Promise<void> {
    const zip = new JSZip()
    
    // Add files according to new structure
    for (const [folderPath, folderFiles] of Object.entries(folderStructure)) {
      for (const file of folderFiles) {
        const blob = file.content instanceof Blob 
          ? file.content 
          : new Blob([file.content])
        
        const filePath = folderPath 
          ? `${folderPath}/${file.suggestedName}`
          : file.suggestedName
        
        zip.file(filePath, blob)
      }
    }
    
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    
    saveAs(zipBlob, zipName)
  }

  /**
   * Create a manifest file with rename mappings
   */
  static createManifest(files: DownloadableFile[]): string {
    const manifest = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      totalFiles: files.length,
      mappings: files.map(file => ({
        original: file.originalName,
        renamed: file.suggestedName,
        path: file.path || ''
      }))
    }
    
    return JSON.stringify(manifest, null, 2)
  }

  /**
   * Download files with a manifest
   */
  static async downloadWithManifest(
    files: DownloadableFile[],
    zipName: string = 'renamed-files-with-manifest.zip'
  ): Promise<void> {
    const zip = new JSZip()
    
    // Add manifest
    const manifest = this.createManifest(files)
    zip.file('rename-manifest.json', manifest)
    
    // Add files
    for (const file of files) {
      const blob = file.content instanceof Blob 
        ? file.content 
        : new Blob([file.content])
      
      const filePath = file.path
        ? `files/${file.path}/${file.suggestedName}`
        : `files/${file.suggestedName}`
      
      zip.file(filePath, blob)
    }
    
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    
    saveAs(zipBlob, zipName)
  }

  /**
   * Estimate download size
   */
  static estimateDownloadSize(files: DownloadableFile[]): number {
    return files.reduce((total, file) => {
      if (file.content instanceof ArrayBuffer) {
        return total + file.content.byteLength
      } else if (file.content instanceof Blob) {
        return total + file.content.size
      }
      return total
    }, 0)
  }

  /**
   * Format bytes to human readable
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}