'use client'

import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface ProgressToastProps {
  message: string
  progress: number
  onCancel?: () => void
  className?: string
}

export function ProgressToast({ 
  message, 
  progress,
  onCancel,
  className 
}: ProgressToastProps) {
  const percentage = Math.min(Math.max(progress, 0), 100)
  
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium flex-1 break-words">{message}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {Math.floor(percentage)}%
          </span>
          {onCancel && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log('Cancel button clicked in ProgressToast')
                onCancel()
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -m-1"
              aria-label="Cancel"
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="relative w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        >
          <div className="absolute inset-0 bg-white/20 animate-pulse" />
        </div>
      </div>
    </div>
  )
}