export const UPLOAD_CONFIG = {
  // Concurrency settings
  DEFAULT_CONCURRENCY: 2,
  MIN_CONCURRENCY: 1,
  MAX_CONCURRENCY: 6,
  LARGE_BATCH_THRESHOLD: 50, // Files count to consider as large batch
  LARGE_BATCH_CONCURRENCY: 1, // Concurrency for large batches
  
  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAYS: [2000, 5000, 10000, 20000, 30000], // ms
  
  // Throttling settings
  UPLOAD_START_DELAY: 500, // ms between starting uploads
  ERROR_BACKOFF_BASE: 1000, // ms
  MAX_BACKOFF_DELAY: 30000, // ms
  
  // Rate limit detection
  RATE_LIMIT_KEYWORDS: ['unexpected response', '429', 'rate limit', 'too many requests'],
  RATE_LIMIT_THRESHOLD: 2, // Number of rate limit errors before aggressive throttling
  
  // Bandwidth settings
  DEFAULT_CHUNK_SIZE: 6 * 1024 * 1024, // 6MB
  PARALLEL_CHUNKS: 1, // Disable parallel chunk uploads for stability
  
  // Error recovery
  ERROR_WINDOW: 60000, // ms to keep error history
  SUCCESS_RESET_WINDOW: 300000, // ms of success before resetting backoff
  
  // Progress updates
  PROGRESS_UPDATE_INTERVAL: 100, // ms
  
  // Supabase specific
  SUPABASE_TIMEOUT: 120000, // 2 minutes
  SUPABASE_CACHE_CONTROL: '3600',
}

export const getUploadDelayForBatch = (fileCount: number, errorCount: number = 0): number => {
  let delay = UPLOAD_CONFIG.UPLOAD_START_DELAY
  
  // Increase delay for larger batches
  if (fileCount > 100) {
    delay = 1000
  } else if (fileCount > 50) {
    delay = 750
  }
  
  // Add extra delay for errors
  if (errorCount > 0) {
    delay += errorCount * 500
  }
  
  return Math.min(delay, 5000)
}

export const getConcurrencyForBatch = (fileCount: number): number => {
  if (fileCount > UPLOAD_CONFIG.LARGE_BATCH_THRESHOLD) {
    return UPLOAD_CONFIG.LARGE_BATCH_CONCURRENCY
  }
  return UPLOAD_CONFIG.DEFAULT_CONCURRENCY
}