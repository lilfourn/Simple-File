export type PreviewType = 'text' | 'image' | 'pdf' | 'markdown' | 'code' | 'unsupported'

export interface FilePreview {
  type: PreviewType
  content: string | ArrayBuffer
  mimeType: string
  encoding?: string
}

export class FilePreviewHandler {
  // Map of file extensions to preview types
  private static readonly previewTypeMap: Record<string, PreviewType> = {
    // Text files
    txt: 'text',
    log: 'text',
    csv: 'text',
    
    // Code files
    js: 'code',
    ts: 'code',
    jsx: 'code',
    tsx: 'code',
    py: 'code',
    java: 'code',
    c: 'code',
    cpp: 'code',
    h: 'code',
    hpp: 'code',
    cs: 'code',
    go: 'code',
    rs: 'code',
    rb: 'code',
    php: 'code',
    swift: 'code',
    kt: 'code',
    dart: 'code',
    r: 'code',
    scala: 'code',
    lua: 'code',
    sh: 'code',
    bash: 'code',
    ps1: 'code',
    bat: 'code',
    cmd: 'code',
    json: 'code',
    xml: 'code',
    html: 'code',
    css: 'code',
    scss: 'code',
    sass: 'code',
    less: 'code',
    yml: 'code',
    yaml: 'code',
    toml: 'code',
    ini: 'code',
    conf: 'code',
    sql: 'code',
    
    // Markdown
    md: 'markdown',
    markdown: 'markdown',
    
    // Images
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    gif: 'image',
    bmp: 'image',
    svg: 'image',
    webp: 'image',
    ico: 'image',
    
    // PDF
    pdf: 'pdf'
  }
  
  // Language map for syntax highlighting
  private static readonly languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    kt: 'kotlin',
    swift: 'swift',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    php: 'php',
    go: 'go',
    java: 'java',
    dart: 'dart',
    r: 'r',
    scala: 'scala',
    lua: 'lua',
    sh: 'bash',
    bash: 'bash',
    ps1: 'powershell',
    bat: 'batch',
    cmd: 'batch',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    conf: 'properties',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    sql: 'sql',
    md: 'markdown',
    markdown: 'markdown'
  }

  /**
   * Determine if a file can be previewed
   */
  static canPreview(fileName: string): boolean {
    const extension = this.getFileExtension(fileName)
    return extension in this.previewTypeMap
  }

  /**
   * Get the preview type for a file
   */
  static getPreviewType(fileName: string): PreviewType {
    const extension = this.getFileExtension(fileName)
    return this.previewTypeMap[extension] || 'unsupported'
  }

  /**
   * Get syntax highlighting language
   */
  static getLanguage(fileName: string): string {
    const extension = this.getFileExtension(fileName)
    return this.languageMap[extension] || 'plaintext'
  }

  /**
   * Extract file extension
   */
  private static getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.')
    if (lastDot === -1) return ''
    return fileName.slice(lastDot + 1).toLowerCase()
  }

  /**
   * Generate preview for a file
   */
  static async generatePreview(file: File): Promise<FilePreview> {
    const type = this.getPreviewType(file.name)
    
    switch (type) {
      case 'text':
      case 'code':
      case 'markdown':
        return this.generateTextPreview(file, type)
        
      case 'image':
        return this.generateImagePreview(file)
        
      case 'pdf':
        return {
          type: 'pdf',
          content: await file.arrayBuffer(),
          mimeType: file.type || 'application/pdf'
        }
        
      default:
        return {
          type: 'unsupported',
          content: `Cannot preview ${file.name}`,
          mimeType: file.type || 'application/octet-stream'
        }
    }
  }

  /**
   * Generate text-based preview
   */
  private static async generateTextPreview(
    file: File, 
    type: PreviewType
  ): Promise<FilePreview> {
    const maxSize = 1024 * 1024 // 1MB limit for text preview
    const blob = file.size > maxSize ? file.slice(0, maxSize) : file
    
    try {
      const text = await blob.text()
      const content = file.size > maxSize 
        ? text + '\n\n... [File truncated for preview]'
        : text
      
      return {
        type,
        content,
        mimeType: file.type || 'text/plain',
        encoding: 'utf-8'
      }
    } catch (error) {
      // Try as binary if text decoding fails
      const buffer = await blob.arrayBuffer()
      return {
        type: 'unsupported',
        content: `Binary file (${this.formatBytes(file.size)})`,
        mimeType: file.type || 'application/octet-stream'
      }
    }
  }

  /**
   * Generate image preview
   */
  private static async generateImagePreview(file: File): Promise<FilePreview> {
    const buffer = await file.arrayBuffer()
    
    return {
      type: 'image',
      content: buffer,
      mimeType: file.type || 'image/unknown'
    }
  }

  /**
   * Check if two files have identical content
   */
  static async compareFiles(file1: File, file2: File): Promise<boolean> {
    if (file1.size !== file2.size) return false
    
    const buffer1 = await file1.arrayBuffer()
    const buffer2 = await file2.arrayBuffer()
    
    const view1 = new Uint8Array(buffer1)
    const view2 = new Uint8Array(buffer2)
    
    for (let i = 0; i < view1.length; i++) {
      if (view1[i] !== view2[i]) return false
    }
    
    return true
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

  /**
   * Get a safe preview for display (limits size)
   */
  static async getSafePreview(
    content: string | ArrayBuffer, 
    maxLength: number = 5000
  ): Promise<string> {
    if (typeof content === 'string') {
      return content.length > maxLength 
        ? content.substring(0, maxLength) + '...\n[Truncated for display]'
        : content
    } else {
      // For binary content, show hex preview
      const bytes = new Uint8Array(content)
      const preview = Array.from(bytes.slice(0, 100))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
      
      return `Binary content (${this.formatBytes(bytes.length)}):\n${preview}${bytes.length > 100 ? '...' : ''}`
    }
  }
}