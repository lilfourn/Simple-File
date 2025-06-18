'use client'

import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react'

interface SimpleToastProps {
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  className?: string
}

export function SimpleToast({ 
  message, 
  type = 'info',
  className 
}: SimpleToastProps) {
  const icons = {
    success: <CheckCircle className="h-4 w-4 text-green-600" />,
    error: <XCircle className="h-4 w-4 text-destructive" />,
    warning: <AlertCircle className="h-4 w-4 text-yellow-600" />,
    info: <Info className="h-4 w-4 text-blue-600" />
  }
  
  return (
    <div className={cn("w-full flex items-center gap-2", className)}>
      {icons[type]}
      <p className="text-sm font-medium flex-1">{message}</p>
    </div>
  )
}