'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Settings } from 'lucide-react'
import { Tables } from '@/utils/supabase/database.types'
import { updateWorkspace, deleteWorkspace } from '@/app/dashboard/file-organizer/actions'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Workspace = Tables<'workspaces'>

interface WorkspaceSettingsProps {
  workspace: Workspace
  workspaces: Workspace[]
}

export default function WorkspaceSettings({ workspace, workspaces }: WorkspaceSettingsProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [workspaceName, setWorkspaceName] = useState(workspace.name)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleUpdateWorkspace = async () => {
    if (!workspaceName.trim() || workspaceName === workspace.name) return

    setIsUpdating(true)
    setError('')

    try {
      await updateWorkspace(workspace.id, workspaceName.trim())
      router.refresh()
      setOpen(false)
    } catch (error) {
      setError('Failed to update workspace name')
      console.error('Failed to update workspace:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDeleteWorkspace = async () => {
    if (deleteConfirmation !== workspace.name) {
      setError('Workspace name does not match')
      return
    }

    if (workspace.is_default) {
      setError('Cannot delete the default workspace')
      return
    }

    if (workspaces.length <= 1) {
      setError('You must have at least one workspace')
      return
    }

    setIsDeleting(true)
    setError('')

    try {
      await deleteWorkspace(workspace.id)
      // Navigate to first available workspace
      const nextWorkspace = workspaces.find(w => w.id !== workspace.id)
      if (nextWorkspace) {
        router.push(`/dashboard/file-organizer?workspace=${nextWorkspace.id}`)
      } else {
        router.push('/dashboard/file-organizer')
      }
    } catch (error) {
      setError('Failed to delete workspace')
      console.error('Failed to delete workspace:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen) {
      setWorkspaceName(workspace.name)
      setDeleteConfirmation('')
      setError('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-center">
          <Settings className="h-4 w-4 mr-2" />
          Workspace Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Workspace Settings</DialogTitle>
          <DialogDescription>
            Manage your workspace settings and preferences.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Workspace Name</Label>
            <Input
              id="name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Enter workspace name"
              disabled={workspace.is_default}
            />
            {workspace.is_default && (
              <p className="text-sm text-muted-foreground">
                Default workspace name cannot be changed.
              </p>
            )}
          </div>

          {!workspace.is_default && (
            <div className="space-y-2 border-t pt-4">
              <h4 className="text-sm font-medium text-destructive">Danger Zone</h4>
              <p className="text-sm text-muted-foreground">
                Delete this workspace and all its contents. This action cannot be undone.
              </p>
              <div className="space-y-2">
                <Label htmlFor="delete-confirm" className="text-sm">
                  Type <span className="font-medium">{workspace.name}</span> to confirm deletion
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="Enter workspace name"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteWorkspace}
                  disabled={deleteConfirmation !== workspace.name || isDeleting}
                  className="w-full"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Workspace'}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {!workspace.is_default && (
            <Button 
              onClick={handleUpdateWorkspace} 
              disabled={!workspaceName.trim() || workspaceName === workspace.name || isUpdating}
            >
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}