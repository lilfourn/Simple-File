import React from 'react'
import { toast } from 'sonner'
import { SimpleToast } from '@/components/ui/simple-toast'
import { ProgressToast } from '@/components/ui/progress-toast'

export const showToast = {
  success: (message: string, options?: any) => {
    toast(
      <SimpleToast message={message} type="success" />,
      {
        ...options,
        className: 'min-w-[300px] max-w-[500px]'
      }
    )
  },
  
  error: (message: string, options?: any) => {
    toast(
      <SimpleToast message={message} type="error" />,
      {
        ...options,
        className: 'min-w-[300px] max-w-[500px]'
      }
    )
  },
  
  info: (message: string, options?: any) => {
    toast(
      <SimpleToast message={message} type="info" />,
      {
        ...options,
        className: 'min-w-[300px] max-w-[500px]'
      }
    )
  },
  
  warning: (message: string, options?: any) => {
    toast(
      <SimpleToast message={message} type="warning" />,
      {
        ...options,
        className: 'min-w-[300px] max-w-[500px]'
      }
    )
  },
  
  progress: (message: string, progress: number, onCancel?: () => void, id?: string) => {
    toast(
      <ProgressToast 
        message={message}
        progress={progress}
        onCancel={onCancel}
      />,
      { 
        id, 
        duration: Infinity,
        className: 'min-w-[300px] max-w-[500px]'
      }
    )
  },
  
  dismiss: (id?: string) => {
    toast.dismiss(id)
  }
}