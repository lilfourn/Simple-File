'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Trash2, 
  AlertTriangle, 
  FileText, 
  FolderOpen,
  Shield,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DeleteConfirmationDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  itemCount: number
  itemType: 'file' | 'folder'
  downloadLocation?: string
}

export function DeleteConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  itemCount,
  itemType,
  downloadLocation
}: DeleteConfirmationDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState(0)
  const [understandRisks, setUnderstandRisks] = useState(false)
  const [hasBackup, setHasBackup] = useState(false)

  const canProceed = understandRisks && hasBackup

  const handleDelete = async () => {
    if (!canProceed) return
    
    setIsDeleting(true)
    setDeleteProgress(0)
    
    try {
      // Simulate progress (actual implementation would track real progress)
      const progressInterval = setInterval(() => {
        setDeleteProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 10
        })
      }, 200)
      
      await onConfirm()
      
      clearInterval(progressInterval)
      setDeleteProgress(100)
      
      // Close after short delay
      setTimeout(() => {
        onClose()
        resetState()
      }, 500)
    } catch (error) {
      console.error('Delete failed:', error)
      setIsDeleting(false)
      setDeleteProgress(0)
    }
  }

  const resetState = () => {
    setIsDeleting(false)
    setDeleteProgress(0)
    setUnderstandRisks(false)
    setHasBackup(false)
  }

  const handleClose = () => {
    if (!isDeleting) {
      onClose()
      resetState()
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
              <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <AlertDialogTitle>Delete Original {itemType === 'folder' ? 'Folder' : 'Files'}?</AlertDialogTitle>
              <AlertDialogDescription className="mt-1">
                This will permanently delete {itemCount} original {itemCount === 1 ? itemType : `${itemType}s`}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Download confirmation */}
          {downloadLocation && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
              <Shield className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Files have been downloaded
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  Your renamed files are saved in: {downloadLocation}
                </p>
              </div>
            </div>
          )}
          
          {/* Warning */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                This action cannot be undone
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                Deleted files may not be recoverable from your system's trash/recycle bin
              </p>
            </div>
          </div>
          
          {/* Info about what will be deleted */}
          <div className="space-y-2">
            <p className="text-sm font-medium">What will be deleted:</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {itemType === 'folder' ? (
                <FolderOpen className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span>{itemCount} original {itemCount === 1 ? itemType : `${itemType}s`} with old names</span>
            </div>
          </div>
          
          {/* Confirmation checkboxes */}
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="understand"
                checked={understandRisks}
                onCheckedChange={(checked) => setUnderstandRisks(checked as boolean)}
                disabled={isDeleting}
              />
              <label 
                htmlFor="understand" 
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I understand this action is permanent and cannot be undone
              </label>
            </div>
            
            <div className="flex items-start gap-2">
              <Checkbox
                id="backup"
                checked={hasBackup}
                onCheckedChange={(checked) => setHasBackup(checked as boolean)}
                disabled={isDeleting}
              />
              <label 
                htmlFor="backup" 
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I have verified my downloaded files are complete and correct
              </label>
            </div>
          </div>
          
          {/* Progress bar */}
          {isDeleting && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Deleting files...</span>
                <span className="font-medium">{deleteProgress}%</span>
              </div>
              <Progress value={deleteProgress} className="h-2" />
            </div>
          )}
        </div>
        
        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={handleClose}
            disabled={isDeleting}
          >
            Keep Original Files
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canProceed || isDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? 'Deleting...' : 'Delete Original Files'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}