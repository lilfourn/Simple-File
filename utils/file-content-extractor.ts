export class FileContentExtractor {
  // Maximum image size for base64 encoding (5MB)
  private static readonly MAX_IMAGE_SIZE_FOR_BASE64 = 5 * 1024 * 1024;
  
  // Extract text content from various file types
  static async extractContent(file: File): Promise<string> {
    const fileType = file.type.toLowerCase()
    const fileName = file.name.toLowerCase()
    
    try {
      // Text-based files
      if (fileType.startsWith('text/') || 
          fileType.includes('json') || 
          fileType.includes('xml') ||
          fileType.includes('javascript') ||
          fileType.includes('typescript') ||
          fileName.match(/\.(txt|md|json|xml|csv|log|js|ts|jsx|tsx|css|html|yml|yaml|ini|conf|sh|bat|ps1|py|rb|go|java|c|cpp|h|hpp|rs|swift|kt|dart|sql)$/i)) {
        return await this.extractTextContent(file)
      }
      
      // PDF files - return metadata for now (could integrate PDF.js later)
      if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
        return `[PDF Document: ${(file.size / 1024).toFixed(1)}KB, ${file.name}]`
      }
      
      // Image files - return metadata (could integrate OCR later)
      if (fileType.startsWith('image/')) {
        return await this.extractImageMetadata(file)
      }
      
      // Office documents - return metadata
      if (fileName.match(/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$/i)) {
        const docType = fileName.split('.').pop()?.toUpperCase() || 'Document'
        return `[${docType} Document: ${(file.size / 1024).toFixed(1)}KB, ${file.name}]`
      }
      
      // Archive files
      if (fileName.match(/\.(zip|rar|7z|tar|gz|bz2|xz)$/i)) {
        const archiveType = fileName.split('.').pop()?.toUpperCase() || 'Archive'
        return `[${archiveType} Archive: ${(file.size / 1024).toFixed(1)}KB, ${file.name}]`
      }
      
      // Default for unknown types
      return `[${file.type || 'Unknown'} file: ${(file.size / 1024).toFixed(1)}KB]`
      
    } catch (error) {
      console.error('[FileContentExtractor] Error extracting content:', error)
      return `[Error reading file: ${file.name}]`
    }
  }
  
  private static async extractTextContent(file: File, maxSize: number = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        const content = e.target?.result as string
        // Return first maxSize characters
        const preview = content.substring(0, maxSize)
        if (content.length > maxSize) {
          resolve(preview + '... [truncated]')
        } else {
          resolve(preview)
        }
      }
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }
      
      // Read only the first part of the file for preview
      const blob = file.slice(0, Math.min(file.size, maxSize * 2)) // Read a bit more to handle multi-byte chars
      reader.readAsText(blob)
    })
  }
  
  private static async extractImageMetadata(file: File): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      
      img.onload = () => {
        URL.revokeObjectURL(url)
        const metadata = [
          `[Image: ${file.type}`,
          `Dimensions: ${img.width}x${img.height}`,
          `Size: ${(file.size / 1024).toFixed(1)}KB`,
          `Name: ${file.name}]`
        ].join(', ')
        resolve(metadata)
      }
      
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(`[Image: ${file.type}, ${(file.size / 1024).toFixed(1)}KB, ${file.name}]`)
      }
      
      img.src = url
    })
  }
  
  // Extract image as base64 for AI vision analysis
  static async extractImageAsBase64(file: File): Promise<string | null> {
    // Skip if file is too large
    if (file.size > this.MAX_IMAGE_SIZE_FOR_BASE64) {
      console.log(`[FileContentExtractor] Image too large for base64: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
      return null
    }
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        const result = e.target?.result as string
        // Remove the data:image/xxx;base64, prefix to get just the base64 string
        const base64Data = result.split(',')[1]
        resolve(base64Data)
      }
      
      reader.onerror = () => {
        console.error('[FileContentExtractor] Failed to read image as base64')
        reject(new Error('Failed to read image'))
      }
      
      reader.readAsDataURL(file)
    })
  }
  
  // Extract structured metadata for better AI analysis
  static extractMetadata(file: File): Record<string, any> {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
    
    // Extract potential date patterns from filename
    const datePatterns = [
      /(\d{4}[-_]\d{2}[-_]\d{2})/,  // YYYY-MM-DD or YYYY_MM_DD
      /(\d{2}[-_]\d{2}[-_]\d{4})/,  // DD-MM-YYYY or DD_MM_YYYY
      /(\d{8})/,                     // YYYYMMDD
      /(\d{4}[-_]\d{2})/,           // YYYY-MM or YYYY_MM
    ]
    
    let dateMatch = null
    for (const pattern of datePatterns) {
      const match = nameWithoutExt.match(pattern)
      if (match) {
        dateMatch = match[1]
        break
      }
    }
    
    // Extract version patterns
    const versionMatch = nameWithoutExt.match(/v?(\d+[._]\d+(?:[._]\d+)?)/i)
    
    // Common file type categories
    const categories: Record<string, string[]> = {
      document: ['doc', 'docx', 'pdf', 'txt', 'md', 'rtf', 'odt'],
      spreadsheet: ['xls', 'xlsx', 'csv', 'ods'],
      presentation: ['ppt', 'pptx', 'odp'],
      image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'],
      video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'],
      audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'],
      code: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt'],
      data: ['json', 'xml', 'yml', 'yaml', 'sql', 'db'],
      archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
    }
    
    let category = 'other'
    for (const [cat, exts] of Object.entries(categories)) {
      if (exts.includes(extension)) {
        category = cat
        break
      }
    }
    
    return {
      extension,
      nameWithoutExt,
      category,
      dateInFilename: dateMatch,
      versionInFilename: versionMatch ? versionMatch[1] : null,
      isScreenshot: /screenshot|screen[-\s]?shot|ss[-\s]?\d/i.test(nameWithoutExt),
      isDownload: /download|dl[-\s]?\d/i.test(nameWithoutExt),
      isScan: /scan|scanned/i.test(nameWithoutExt),
      isBackup: /backup|bak|copy|clone/i.test(nameWithoutExt),
      isFinal: /final|finished|complete/i.test(nameWithoutExt),
      isDraft: /draft|wip|work[-\s]?in[-\s]?progress/i.test(nameWithoutExt),
      isTemp: /temp|tmp|temporary/i.test(nameWithoutExt),
      hasNumbers: /\d/.test(nameWithoutExt),
      wordCount: nameWithoutExt.split(/[-_\s]+/).filter(w => w.length > 0).length
    }
  }
}