import * as tus from 'tus-js-client'

export interface UploadTask {
  id: string
  file: File
  path?: string[]
  parentId?: string | null
  status: 'pending' | 'uploading' | 'complete' | 'error' | 'cancelled'
  progress: number
  error?: string
  uploadInstance?: tus.Upload
  bytesUploaded: number
  bytesTotal: number
}

export interface UploadBatch {
  id: string
  tasks: Map<string, UploadTask>
  totalBytes: number
  uploadedBytes: number
  concurrencyLimit: number
  activeUploads: Set<string>
  onProgress?: (progress: number, uploadedBytes: number, totalBytes: number) => void
  onTaskComplete?: (taskId: string, success: boolean) => void
  onBatchComplete?: (successCount: number, totalCount: number) => void
}

export class ParallelUploadManager {
  private batches: Map<string, UploadBatch> = new Map()
  private globalConcurrencyLimit: number = 4
  private isProcessing: boolean = false
  private abortController: AbortController | null = null
  private errorCount: number = 0
  private lastErrorTime: number = 0
  private dynamicConcurrencyEnabled: boolean = true
  private minConcurrency: number = 1
  private maxConcurrency: number = 8
  private bandwidthLimitMBps: number = 0 // 0 = no limit
  private currentBandwidthUsage: number = 0
  private bandwidthWindow: { time: number; bytes: number }[] = []
  private recentErrors: { time: number; error: string }[] = []
  private backoffMultiplier: number = 1
  private lastBackoffReset: number = Date.now()
  private failedTasks: Map<string, { task: UploadTask; retries: number }> = new Map()
  private maxRetries: number = 3

  constructor(concurrencyLimit: number = 4) {
    this.globalConcurrencyLimit = concurrencyLimit
  }

  createBatch(
    files: Array<{ file: File; path?: string[]; parentId?: string | null }>,
    options: {
      concurrencyLimit?: number
      onProgress?: (progress: number, uploadedBytes: number, totalBytes: number) => void
      onTaskComplete?: (taskId: string, success: boolean) => void
      onBatchComplete?: (successCount: number, totalCount: number) => void
    } = {}
  ): string {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const tasks = new Map<string, UploadTask>()
    let totalBytes = 0

    // Create tasks for each file
    files.forEach((item, index) => {
      const taskId = `${batchId}-task-${index}`
      totalBytes += item.file.size

      tasks.set(taskId, {
        id: taskId,
        file: item.file,
        path: item.path,
        parentId: item.parentId,
        status: 'pending',
        progress: 0,
        bytesUploaded: 0,
        bytesTotal: item.file.size
      })
    })

    const batch: UploadBatch = {
      id: batchId,
      tasks,
      totalBytes,
      uploadedBytes: 0,
      concurrencyLimit: options.concurrencyLimit || this.globalConcurrencyLimit,
      activeUploads: new Set(),
      onProgress: options.onProgress,
      onTaskComplete: options.onTaskComplete,
      onBatchComplete: options.onBatchComplete
    }

    this.batches.set(batchId, batch)
    return batchId
  }

  async processBatch(
    batchId: string,
    uploadHandler: (task: UploadTask) => Promise<tus.Upload | null>
  ): Promise<{ successCount: number; totalCount: number }> {
    const batch = this.batches.get(batchId)
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`)
    }

    console.log(`[Upload Manager] Starting batch processing for batch ${batchId} with ${batch.tasks.size} tasks`)

    this.isProcessing = true
    this.abortController = new AbortController()

    let successCount = 0
    const totalCount = batch.tasks.size
    const pendingTasks = Array.from(batch.tasks.values()).filter(t => t.status === 'pending')
    let consecutiveErrors = 0

    console.log(`[Upload Manager] Pending tasks: ${pendingTasks.length}`)

    // For large batches, start with lower concurrency
    if (totalCount > 50) {
      this.globalConcurrencyLimit = Math.min(2, this.globalConcurrencyLimit)
      console.log(`Large batch detected (${totalCount} files), starting with concurrency: ${this.globalConcurrencyLimit}`)
    }

    // Process tasks with dynamic concurrency limit
    while ((pendingTasks.length > 0 || batch.activeUploads.size > 0 || this.failedTasks.size > 0) && !this.abortController.signal.aborted) {
      // Check if cancelled
      if (this.abortController.signal.aborted) {
        break
      }

      // Adjust concurrency based on error rate
      this.adjustConcurrencyBasedOnErrors()

      // Wait for bandwidth availability
      await this.waitForBandwidthAvailability()

      // Apply backoff if we have recent errors
      const backoffDelay = this.getBackoffDelay()
      if (backoffDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
      }

      // Retry failed tasks if we have capacity
      if (this.failedTasks.size > 0 && batch.activeUploads.size < this.globalConcurrencyLimit) {
        const retryTasks = Array.from(this.failedTasks.entries())
          .filter(([_, { retries }]) => retries < this.maxRetries)
          .slice(0, this.globalConcurrencyLimit - batch.activeUploads.size)

        for (const [taskId, { task, retries }] of retryTasks) {
          console.log(`Retrying task ${taskId} (attempt ${retries + 1}/${this.maxRetries})`)
          this.failedTasks.delete(taskId)
          task.status = 'pending'
          task.error = undefined
          pendingTasks.push(task)
        }
      }

      // Use dynamic concurrency limit
      const currentLimit = Math.min(this.globalConcurrencyLimit, batch.concurrencyLimit)

      // Start new uploads up to current limit
      while (batch.activeUploads.size < currentLimit && pendingTasks.length > 0) {
        const task = pendingTasks.shift()!
        batch.activeUploads.add(task.id)
        
        console.log(`[Upload Manager] Processing task ${task.id}, active: ${batch.activeUploads.size}/${currentLimit}`)
        
        // Start upload asynchronously
        this.startUpload(batch, task, uploadHandler).then(success => {
          batch.activeUploads.delete(task.id)
          
          console.log(`[Upload Manager] Task ${task.id} completed: ${success ? 'success' : 'failed'}`)
          
          if (success) {
            successCount++
            consecutiveErrors = 0 // Reset on success
            this.resetBackoffIfNeeded()
          } else {
            consecutiveErrors++
            this.errorCount++
            this.lastErrorTime = Date.now()
            
            // Add to failed tasks for potential retry
            const existingRetries = this.failedTasks.get(task.id)?.retries || 0
            if (existingRetries < this.maxRetries) {
              this.failedTasks.set(task.id, { task, retries: existingRetries + 1 })
            }
            
            // Track error for pattern detection
            this.trackError(task.error || 'Unknown error')
            
            // If too many consecutive errors, increase backoff
            if (consecutiveErrors >= 2) {
              this.increaseBackoff()
              console.log(`Consecutive errors: ${consecutiveErrors}, backoff multiplier: ${this.backoffMultiplier}`)
            }
          }
          
          // Notify task completion
          batch.onTaskComplete?.(task.id, success)
          
          // Update batch progress
          this.updateBatchProgress(batch)
        })

        // Progressive delay based on active uploads and error rate
        const delay = this.calculateUploadDelay(batch.activeUploads.size, consecutiveErrors)
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Final attempt for permanently failed tasks
    const permanentlyFailed = Array.from(this.failedTasks.values()).filter(({ retries }) => retries >= this.maxRetries)
    console.log(`Upload batch complete. Success: ${successCount}/${totalCount}, Permanently failed: ${permanentlyFailed.length}`)

    // Notify batch completion
    batch.onBatchComplete?.(successCount, totalCount)
    
    this.isProcessing = false
    this.abortController = null
    this.failedTasks.clear()

    return { successCount, totalCount }
  }

  private async startUpload(
    batch: UploadBatch,
    task: UploadTask,
    uploadHandler: (task: UploadTask) => Promise<tus.Upload | null>
  ): Promise<boolean> {
    console.log(`[Upload Manager] Starting upload for task ${task.id} - ${task.file.name}`)
    try {
      // Update task status
      task.status = 'uploading'
      
      // Create and start upload
      const upload = await uploadHandler(task)
      if (!upload) {
        console.error(`[Upload Manager] Failed to create upload for ${task.file.name}`)
        task.status = 'error'
        task.error = 'Failed to create upload'
        return false
      }
      
      console.log(`[Upload Manager] Upload created for ${task.file.name}, waiting for completion...`)

      task.uploadInstance = upload
      
      // Wait for upload to complete
      return await new Promise<boolean>((resolve) => {
        // Check if the upload has already completed or errored
        const checkStatus = () => {
          if (task.status === 'complete') {
            resolve(true)
          } else if (task.status === 'error' || task.status === 'cancelled') {
            resolve(false)
          }
        }
        
        // Check immediately and set up periodic checks
        checkStatus()
        const intervalId = setInterval(() => {
          checkStatus()
          if (task.status !== 'uploading') {
            clearInterval(intervalId)
          }
        }, 100)
      })
    } catch (error) {
      console.error('Upload error:', error)
      task.status = 'error'
      task.error = error instanceof Error ? error.message : 'Unknown error'
      return false
    }
  }

  updateTaskProgress(batchId: string, taskId: string, bytesUploaded: number, bytesTotal: number) {
    const batch = this.batches.get(batchId)
    if (!batch) return

    const task = batch.tasks.get(taskId)
    if (!task) return

    const previousBytes = task.bytesUploaded
    const bytesDelta = bytesUploaded - previousBytes
    
    task.bytesUploaded = bytesUploaded
    task.bytesTotal = bytesTotal
    task.progress = (bytesUploaded / bytesTotal) * 100
    
    console.log(`[Upload Manager] Progress update for ${task.file.name}: ${task.progress.toFixed(1)}%`)

    // Update batch total
    batch.uploadedBytes = batch.uploadedBytes - previousBytes + bytesUploaded
    
    // Track bandwidth usage
    if (bytesDelta > 0) {
      this.updateBandwidthUsage(bytesDelta)
    }
    
    this.updateBatchProgress(batch)
  }

  updateTaskStatus(batchId: string, taskId: string, status: UploadTask['status'], error?: string) {
    const batch = this.batches.get(batchId)
    if (!batch) return

    const task = batch.tasks.get(taskId)
    if (!task) return

    task.status = status
    if (error) task.error = error

    // If completed successfully, ensure progress is 100%
    if (status === 'complete') {
      task.progress = 100
      task.bytesUploaded = task.bytesTotal
      this.updateBatchProgress(batch)
    }
  }

  private updateBatchProgress(batch: UploadBatch) {
    const progress = batch.totalBytes > 0 
      ? (batch.uploadedBytes / batch.totalBytes) * 100 
      : 0
    
    batch.onProgress?.(progress, batch.uploadedBytes, batch.totalBytes)
  }

  cancelBatch(batchId: string) {
    const batch = this.batches.get(batchId)
    if (!batch) return

    // Abort the processing
    this.abortController?.abort()

    // Cancel all active uploads
    batch.tasks.forEach(task => {
      if (task.status === 'uploading' && task.uploadInstance) {
        try {
          task.uploadInstance.abort()
          task.status = 'cancelled'
        } catch (error) {
          console.error('Error aborting upload:', error)
        }
      } else if (task.status === 'pending') {
        task.status = 'cancelled'
      }
    })

    // Clear active uploads
    batch.activeUploads.clear()
  }

  getBatchStatus(batchId: string) {
    const batch = this.batches.get(batchId)
    if (!batch) return null

    const tasks = Array.from(batch.tasks.values())
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      uploading: tasks.filter(t => t.status === 'uploading').length,
      complete: tasks.filter(t => t.status === 'complete').length,
      error: tasks.filter(t => t.status === 'error').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      progress: batch.totalBytes > 0 ? (batch.uploadedBytes / batch.totalBytes) * 100 : 0
    }
  }

  clearBatch(batchId: string) {
    this.batches.delete(batchId)
  }

  setGlobalConcurrencyLimit(limit: number) {
    this.globalConcurrencyLimit = Math.max(this.minConcurrency, Math.min(limit, this.maxConcurrency))
  }

  setBandwidthLimit(limitMBps: number) {
    this.bandwidthLimitMBps = Math.max(0, limitMBps)
  }

  setDynamicConcurrency(enabled: boolean) {
    this.dynamicConcurrencyEnabled = enabled
  }

  private adjustConcurrencyBasedOnErrors() {
    if (!this.dynamicConcurrencyEnabled) return

    const now = Date.now()
    const timeSinceLastError = now - this.lastErrorTime

    // Clean old errors
    this.recentErrors = this.recentErrors.filter(e => now - e.time < 60000) // Keep last minute

    // Check for rate limit patterns
    const rateLimitErrors = this.recentErrors.filter(e => 
      e.error.includes('unexpected response') || 
      e.error.includes('429') ||
      e.error.includes('rate limit')
    ).length

    // If we detect rate limiting, be more aggressive
    if (rateLimitErrors >= 2) {
      const newLimit = Math.max(this.minConcurrency, Math.min(2, Math.floor(this.globalConcurrencyLimit * 0.5)))
      if (newLimit < this.globalConcurrencyLimit) {
        console.log(`Rate limiting detected! Reducing concurrency from ${this.globalConcurrencyLimit} to ${newLimit}`)
        this.globalConcurrencyLimit = newLimit
        this.errorCount = 0
      }
      return
    }

    // If we get errors too frequently (within 5 seconds), reduce concurrency
    if (timeSinceLastError < 5000 && this.errorCount > 2) {
      const newLimit = Math.max(this.minConcurrency, Math.floor(this.globalConcurrencyLimit * 0.7))
      if (newLimit < this.globalConcurrencyLimit) {
        console.log(`Reducing concurrency from ${this.globalConcurrencyLimit} to ${newLimit} due to errors`)
        this.globalConcurrencyLimit = newLimit
        this.errorCount = 0 // Reset error count after adjustment
      }
    }
    
    // If no errors for 30 seconds, try increasing concurrency slowly
    if (timeSinceLastError > 30000 && this.globalConcurrencyLimit < this.maxConcurrency && this.recentErrors.length === 0) {
      const newLimit = Math.min(this.maxConcurrency, this.globalConcurrencyLimit + 1)
      console.log(`Increasing concurrency from ${this.globalConcurrencyLimit} to ${newLimit}`)
      this.globalConcurrencyLimit = newLimit
    }
  }

  private updateBandwidthUsage(bytes: number) {
    const now = Date.now()
    this.bandwidthWindow.push({ time: now, bytes })

    // Keep only last 5 seconds of data
    this.bandwidthWindow = this.bandwidthWindow.filter(w => now - w.time < 5000)

    // Calculate current bandwidth usage (MB/s)
    const totalBytes = this.bandwidthWindow.reduce((sum, w) => sum + w.bytes, 0)
    const timeSpan = this.bandwidthWindow.length > 0 
      ? (now - this.bandwidthWindow[0].time) / 1000 
      : 1
    this.currentBandwidthUsage = (totalBytes / 1024 / 1024) / timeSpan
  }

  private shouldThrottleForBandwidth(): boolean {
    if (this.bandwidthLimitMBps <= 0) return false
    return this.currentBandwidthUsage >= this.bandwidthLimitMBps * 0.9 // 90% threshold
  }

  private async waitForBandwidthAvailability() {
    while (this.shouldThrottleForBandwidth()) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  getUploadStats() {
    return {
      currentConcurrency: this.globalConcurrencyLimit,
      bandwidthUsageMBps: this.currentBandwidthUsage,
      bandwidthLimitMBps: this.bandwidthLimitMBps,
      errorCount: this.errorCount,
      dynamicConcurrencyEnabled: this.dynamicConcurrencyEnabled,
      backoffMultiplier: this.backoffMultiplier,
      recentErrorCount: this.recentErrors.length,
      failedTaskCount: this.failedTasks.size
    }
  }

  private trackError(error: string) {
    this.recentErrors.push({ time: Date.now(), error })
    // Keep only last 100 errors or last minute
    if (this.recentErrors.length > 100) {
      this.recentErrors = this.recentErrors.slice(-100)
    }
  }

  private calculateUploadDelay(activeUploads: number, consecutiveErrors: number): number {
    // Base delay increases with active uploads
    let delay = activeUploads > 3 ? 300 : 200
    
    // Increase delay if we have errors
    if (consecutiveErrors > 0) {
      delay += consecutiveErrors * 500
    }
    
    // Extra delay for rate limit errors
    const hasRateLimitError = this.recentErrors.some(e => 
      e.error.includes('unexpected response') || e.error.includes('429')
    )
    if (hasRateLimitError) {
      delay += 1000
    }
    
    return Math.min(delay, 5000) // Cap at 5 seconds
  }

  private getBackoffDelay(): number {
    if (this.backoffMultiplier <= 1) return 0
    
    // Exponential backoff with jitter
    const baseDelay = 1000 * this.backoffMultiplier
    const jitter = Math.random() * 500
    return Math.min(baseDelay + jitter, 30000) // Cap at 30 seconds
  }

  private increaseBackoff() {
    this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 16)
  }

  private resetBackoffIfNeeded() {
    const now = Date.now()
    // Reset backoff if we've had 5 minutes of success
    if (now - this.lastBackoffReset > 300000 && this.backoffMultiplier > 1) {
      this.backoffMultiplier = Math.max(1, this.backoffMultiplier * 0.5)
      this.lastBackoffReset = now
    }
  }
}