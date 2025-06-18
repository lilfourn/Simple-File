'use client'

import { cn } from '@/lib/utils'

interface ProgressToastProps {
  message: string
  progress: number
  total?: number
  className?: string
}

export function ProgressToast({ 
  message, 
  progress, 
  total,
  className 
}: ProgressToastProps) {
  const percentage = Math.min(Math.max(progress, 0), 100)
  
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">{message}</p>
        <span className="text-xs text-muted-foreground">
          {total ? `${Math.floor(progress)} / ${total}` : `${Math.floor(percentage)}%`}
        </span>
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