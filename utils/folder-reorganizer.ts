export interface FileInfo {
  name: string
  suggestedName: string
  type: string
  size: number
  extension: string
  category?: string
  metadata?: Record<string, any>
}

export interface FolderSuggestion {
  name: string
  description: string
  files: FileInfo[]
  subfolders?: FolderSuggestion[]
}

export interface ReorganizationPlan {
  originalStructure: FolderNode
  suggestedStructure: FolderNode
  improvements: string[]
  confidence: number
}

export interface FolderNode {
  name: string
  path: string
  files: FileInfo[]
  children: FolderNode[]
}

export class FolderReorganizer {
  /**
   * Analyze files and suggest optimal folder structure
   */
  static analyzeFolderStructure(files: FileInfo[]): FolderSuggestion {
    // Group files by category
    const categories = this.categorizeFiles(files)
    
    // Create folder structure based on categories
    const rootFolder: FolderSuggestion = {
      name: 'Organized Files',
      description: 'AI-optimized folder structure',
      files: [],
      subfolders: []
    }
    
    // Create main category folders
    for (const [category, categoryFiles] of Object.entries(categories)) {
      if (categoryFiles.length === 0) continue
      
      const folder = this.createCategoryFolder(category, categoryFiles)
      rootFolder.subfolders!.push(folder)
    }
    
    // Handle uncategorized files
    const uncategorized = files.filter(f => !f.category)
    if (uncategorized.length > 0) {
      rootFolder.subfolders!.push({
        name: 'Miscellaneous',
        description: 'Files that need manual organization',
        files: uncategorized
      })
    }
    
    return rootFolder
  }

  /**
   * Categorize files based on type, name patterns, and metadata
   */
  private static categorizeFiles(files: FileInfo[]): Record<string, FileInfo[]> {
    const categories: Record<string, FileInfo[]> = {
      documents: [],
      images: [],
      videos: [],
      audio: [],
      code: [],
      data: [],
      archives: [],
      presentations: [],
      spreadsheets: []
    }
    
    const categoryPatterns: Record<string, RegExp[]> = {
      documents: [/\.(pdf|doc|docx|txt|md|rtf|odt)$/i],
      images: [/\.(jpg|jpeg|png|gif|bmp|svg|webp|ico|tiff?)$/i],
      videos: [/\.(mp4|avi|mov|wmv|flv|mkv|webm|m4v|mpg|mpeg)$/i],
      audio: [/\.(mp3|wav|flac|aac|ogg|m4a|wma|opus)$/i],
      code: [/\.(js|ts|jsx|tsx|py|java|c|cpp|cs|go|rs|rb|php|swift|kt|dart|r|scala|lua)$/i],
      data: [/\.(json|xml|csv|sql|db|sqlite)$/i],
      archives: [/\.(zip|rar|7z|tar|gz|bz2|xz)$/i],
      presentations: [/\.(ppt|pptx|odp|key)$/i],
      spreadsheets: [/\.(xls|xlsx|ods|numbers)$/i]
    }
    
    // Special patterns for better organization
    const specialPatterns = {
      screenshots: /screenshot|screen[-\s]?shot|ss[-\s]?\d/i,
      downloads: /download|dl[-\s]?\d/i,
      backups: /backup|bak|copy|clone/i,
      temp: /temp|tmp|temporary/i,
      versions: /v\d+|version[-\s]?\d+|rev[-\s]?\d+/i,
      dates: /\d{4}[-_]\d{2}[-_]\d{2}|\d{8}/
    }
    
    for (const file of files) {
      let categorized = false
      
      // Check against category patterns
      for (const [category, patterns] of Object.entries(categoryPatterns)) {
        if (patterns.some(pattern => pattern.test(file.name))) {
          categories[category].push({ ...file, category })
          categorized = true
          break
        }
      }
      
      // If not categorized, use metadata or special patterns
      if (!categorized && file.metadata) {
        if (file.metadata.category && categories[file.metadata.category]) {
          categories[file.metadata.category].push({ 
            ...file, 
            category: file.metadata.category 
          })
        }
      }
    }
    
    return categories
  }

  /**
   * Create a folder structure for a category
   */
  private static createCategoryFolder(
    category: string, 
    files: FileInfo[]
  ): FolderSuggestion {
    const folderNames: Record<string, string> = {
      documents: 'Documents',
      images: 'Images',
      videos: 'Videos',
      audio: 'Audio',
      code: 'Source Code',
      data: 'Data Files',
      archives: 'Archives',
      presentations: 'Presentations',
      spreadsheets: 'Spreadsheets'
    }
    
    const folder: FolderSuggestion = {
      name: folderNames[category] || category,
      description: `Contains ${files.length} ${category} files`,
      files: [],
      subfolders: []
    }
    
    // Further organize by date if many files
    if (files.length > 20) {
      const byYear = this.groupByYear(files)
      
      for (const [year, yearFiles] of Object.entries(byYear)) {
        if (yearFiles.length > 50) {
          // Further group by month if too many files
          const byMonth = this.groupByMonth(yearFiles)
          
          const yearFolder: FolderSuggestion = {
            name: year,
            description: `Files from ${year}`,
            files: [],
            subfolders: Object.entries(byMonth).map(([month, monthFiles]) => ({
              name: month,
              description: `Files from ${month} ${year}`,
              files: monthFiles
            }))
          }
          
          folder.subfolders!.push(yearFolder)
        } else {
          folder.subfolders!.push({
            name: year,
            description: `Files from ${year}`,
            files: yearFiles
          })
        }
      }
      
      // Files without dates go to root
      const undated = files.filter(f => !this.extractYear(f))
      if (undated.length > 0) {
        folder.files = undated
      }
    } else {
      // Small number of files, keep flat
      folder.files = files
    }
    
    return folder
  }

  /**
   * Group files by year based on name or metadata
   */
  private static groupByYear(files: FileInfo[]): Record<string, FileInfo[]> {
    const groups: Record<string, FileInfo[]> = {}
    
    for (const file of files) {
      const year = this.extractYear(file)
      if (year) {
        if (!groups[year]) groups[year] = []
        groups[year].push(file)
      }
    }
    
    return groups
  }

  /**
   * Group files by month
   */
  private static groupByMonth(files: FileInfo[]): Record<string, FileInfo[]> {
    const groups: Record<string, FileInfo[]> = {}
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
    
    for (const file of files) {
      const date = this.extractDate(file)
      if (date) {
        const monthName = monthNames[date.getMonth()]
        if (!groups[monthName]) groups[monthName] = []
        groups[monthName].push(file)
      }
    }
    
    return groups
  }

  /**
   * Extract year from filename or metadata
   */
  private static extractYear(file: FileInfo): string | null {
    // Try to extract from filename
    const yearMatch = file.name.match(/20\d{2}|19\d{2}/)
    if (yearMatch) return yearMatch[0]
    
    // Try metadata
    if (file.metadata?.dateInFilename) {
      const metaYear = file.metadata.dateInFilename.match(/20\d{2}|19\d{2}/)
      if (metaYear) return metaYear[0]
    }
    
    return null
  }

  /**
   * Extract date from filename or metadata
   */
  private static extractDate(file: FileInfo): Date | null {
    // Common date patterns
    const patterns = [
      /(\d{4})[-_](\d{2})[-_](\d{2})/, // YYYY-MM-DD
      /(\d{2})[-_](\d{2})[-_](\d{4})/, // DD-MM-YYYY
      /(\d{8})/ // YYYYMMDD
    ]
    
    for (const pattern of patterns) {
      const match = file.name.match(pattern)
      if (match) {
        if (match[0].length === 8) {
          // YYYYMMDD format
          const year = parseInt(match[0].substring(0, 4))
          const month = parseInt(match[0].substring(4, 6)) - 1
          const day = parseInt(match[0].substring(6, 8))
          return new Date(year, month, day)
        } else if (match[1].length === 4) {
          // YYYY-MM-DD format
          return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
        } else {
          // DD-MM-YYYY format
          return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]))
        }
      }
    }
    
    return null
  }

  /**
   * Convert folder suggestion to flat structure for downloading
   */
  static flattenStructure(
    suggestion: FolderSuggestion, 
    parentPath: string = ''
  ): Record<string, FileInfo[]> {
    const result: Record<string, FileInfo[]> = {}
    const currentPath = parentPath ? `${parentPath}/${suggestion.name}` : suggestion.name
    
    // Add files at current level
    if (suggestion.files.length > 0) {
      result[currentPath] = suggestion.files
    }
    
    // Recursively process subfolders
    if (suggestion.subfolders) {
      for (const subfolder of suggestion.subfolders) {
        const subResult = this.flattenStructure(subfolder, currentPath)
        Object.assign(result, subResult)
      }
    }
    
    return result
  }

  /**
   * Generate a text summary of the reorganization
   */
  static generateSummary(original: FileInfo[], suggestion: FolderSuggestion): string {
    const lines: string[] = [
      '# Folder Reorganization Summary',
      '',
      `Total files: ${original.length}`,
      '',
      '## Suggested Structure:',
      ''
    ]
    
    const addFolder = (folder: FolderSuggestion, indent: number = 0) => {
      const prefix = '  '.repeat(indent)
      lines.push(`${prefix}📁 ${folder.name} (${folder.files.length} files)`)
      
      if (folder.subfolders) {
        for (const subfolder of folder.subfolders) {
          addFolder(subfolder, indent + 1)
        }
      }
    }
    
    addFolder(suggestion)
    
    return lines.join('\n')
  }
}