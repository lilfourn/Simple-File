import { FileContentExtractor } from './file-content-extractor'

export interface FileMetadata {
  name: string
  type: string
  size: number
  preview: string
  path?: string
  metadata?: Record<string, any>
  imageData?: string // Base64 encoded image data for vision analysis
}

export interface ProcessingTask {
  id: string
  file: File
  metadata: FileMetadata
  status: 'pending' | 'processing' | 'complete' | 'error'
  result?: any
  error?: string
}

export class SmartSyncProcessor {
  private maxWorkers: number
  private activeWorkers: number = 0
  private queue: ProcessingTask[] = []
  private results: Map<string, any> = new Map()
  private requestTimes: number[] = []
  private adaptiveDelay: number = 0
  
  constructor(maxWorkers: number = 5) {
    this.maxWorkers = maxWorkers
    console.log('[SmartSync] Processor initialized with', maxWorkers, 'workers')
  }
  
  async processBatch(
    files: File[],
    onProgress: (completed: number, total: number) => void
  ): Promise<any[]> {
    console.log('[SmartSync] Processing batch of', files.length, 'files')
    
    // Create tasks
    this.queue = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      metadata: {
        name: file.name,
        type: file.type,
        size: file.size,
        preview: '',
        metadata: FileContentExtractor.extractMetadata(file)
      },
      status: 'pending' as const
    }))
    
    // Extract file previews in parallel
    await this.extractPreviews()
    
    // Process queue
    const processingPromises: Promise<void>[] = []
    let completed = 0
    
    // Start initial workers
    for (let i = 0; i < Math.min(this.maxWorkers, this.queue.length); i++) {
      processingPromises.push(this.processNextTask(async () => {
        completed++
        onProgress(completed, files.length)
      }))
    }
    
    // Wait for all processing to complete
    await Promise.all(processingPromises)
    
    // Return results in original order
    return files.map(file => {
      const task = this.queue.find(t => t.file === file)
      return task ? this.results.get(task.id) : null
    })
  }
  
  private async extractPreviews() {
    const previewPromises = this.queue.map(async (task) => {
      try {
        task.metadata.preview = await this.extractFilePreview(task.file)
        
        // For image files, also extract base64 data for vision analysis
        if (task.file.type.startsWith('image/') || 
            task.file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tiff|tif)$/i)) {
          try {
            const imageData = await FileContentExtractor.extractImageAsBase64(task.file)
            if (imageData) {
              task.metadata.imageData = imageData
              console.log(`[SmartSync] Extracted base64 for ${task.file.name} (${(imageData.length / 1024).toFixed(1)}KB)`)
            }
          } catch (error) {
            console.error('[SmartSync] Failed to extract image data:', error)
            // Continue without image data
          }
        }
      } catch (error) {
        console.error('[SmartSync] Preview extraction failed for', task.file.name, error)
        task.metadata.preview = ''
      }
    })
    
    await Promise.all(previewPromises)
  }
  
  private async extractFilePreview(file: File): Promise<string> {
    try {
      return await FileContentExtractor.extractContent(file)
    } catch (error) {
      console.error('[SmartSync] Preview extraction failed:', error)
      return `[Failed to extract content from ${file.name}]`
    }
  }
  
  private async processNextTask(onComplete: () => void): Promise<void> {
    const task = this.queue.find(t => t.status === 'pending')
    if (!task) return
    
    task.status = 'processing'
    this.activeWorkers++
    
    // Add adaptive delay if we're hitting rate limits
    if (this.adaptiveDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.adaptiveDelay))
    }
    
    const startTime = Date.now()
    
    try {
      // Call the API
      const result = await this.analyzeFile(task.metadata)
      task.status = 'complete'
      task.result = result
      this.results.set(task.id, result)
      
      // Track successful request time
      const responseTime = Date.now() - startTime
      this.updateAdaptiveDelay(responseTime, false)
      
    } catch (error) {
      console.error('[SmartSync] Processing error for', task.file.name, error)
      task.status = 'error'
      task.error = error instanceof Error ? error.message : 'Unknown error'
      
      // Check if it's a rate limit error (Grok may use different error codes)
      if (error instanceof Error && (
        error.message.includes('429') || 
        error.message.includes('rate') ||
        error.message.includes('quota') ||
        error.message.includes('limit')
      )) {
        this.updateAdaptiveDelay(0, true)
        console.log('[SmartSync] Rate limit detected, adding delay:', this.adaptiveDelay)
      }
      
      this.results.set(task.id, {
        originalName: task.file.name,
        suggestedName: task.file.name,
        confidence: 0,
        reasoning: 'Processing failed'
      })
    } finally {
      this.activeWorkers--
      onComplete()
      
      // Process next task if available
      if (this.queue.some(t => t.status === 'pending')) {
        await this.processNextTask(onComplete)
      }
    }
  }
  
  private async analyzeFile(metadata: FileMetadata): Promise<any> {
    console.log('[SmartSync] Analyzing file:', metadata.name, 'Size:', metadata.size)
    
    const response = await fetch('/api/ai/smart-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: [metadata]
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const result = data.results[0]
    
    console.log('[SmartSync] AI suggestion for', metadata.name, ':', result.suggestedName)
    
    return result
  }
  
  // Update adaptive delay based on response times and errors
  private updateAdaptiveDelay(responseTime: number, isRateLimited: boolean) {
    if (isRateLimited) {
      // If rate limited, increase delay significantly
      this.adaptiveDelay = Math.min(this.adaptiveDelay + 500, 3000) // Max 3 second delay
    } else if (responseTime < 200) {
      // Very fast response, we can decrease delay
      this.adaptiveDelay = Math.max(0, this.adaptiveDelay - 100)
    } else if (responseTime > 1000) {
      // Slow response, add small delay
      this.adaptiveDelay = Math.min(this.adaptiveDelay + 50, 500)
    }
  }
  
  // Adaptive concurrency based on performance
  adjustConcurrency(responseTime: number) {
    if (responseTime < 500 && this.maxWorkers < 10) {
      this.maxWorkers++
      console.log('[SmartSync] Increased workers to', this.maxWorkers)
    } else if (responseTime > 2000 && this.maxWorkers > 2) {
      this.maxWorkers--
      console.log('[SmartSync] Decreased workers to', this.maxWorkers)
    }
  }
}