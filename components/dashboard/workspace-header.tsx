'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Edit2, Check, X } from 'lucide-react'
import { Tables } from '@/utils/supabase/database.types'
import { createWorkspace, updateWorkspace } from '@/app/dashboard/file-organizer/actions'
import { useRouter } from 'next/navigation'

type Workspace = Tables<'workspaces'>

interface WorkspaceHeaderProps {
  workspaces: Workspace[]
  currentWorkspaceId: string
  onWorkspaceChange: (workspaceId: string) => void
}

export default function WorkspaceHeader({
  workspaces,
  currentWorkspaceId,
  onWorkspaceChange
}: WorkspaceHeaderProps) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId)

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return

    try {
      await createWorkspace(newWorkspaceName.trim())
      setNewWorkspaceName('')
      setIsCreating(false)
      router.refresh()
    } catch (error) {
      console.error('Failed to create workspace:', error)
    }
  }

  const handleUpdateWorkspace = async () => {
    if (!editingId || !editingName.trim()) return

    try {
      await updateWorkspace(editingId, editingName.trim())
      setEditingId(null)
      setEditingName('')
      router.refresh()
    } catch (error) {
      console.error('Failed to update workspace:', error)
    }
  }

  const startEditing = () => {
    if (currentWorkspace) {
      setEditingId(currentWorkspace.id)
      setEditingName(currentWorkspace.name)
    }
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingName('')
  }

  return (
    <div className="border-b bg-background">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {editingId === currentWorkspaceId ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="h-8 w-48"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateWorkspace()
                    if (e.key === 'Escape') cancelEditing()
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={handleUpdateWorkspace}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={cancelEditing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Select value={currentWorkspaceId} onValueChange={onWorkspaceChange}>
                  <SelectTrigger className="w-48 h-8">
                    <SelectValue placeholder="Select workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                        {workspace.is_default && (
                          <span className="ml-2 text-xs text-muted-foreground">(default)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {currentWorkspace && !currentWorkspace.is_default && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={startEditing}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                New Workspace
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Workspace</DialogTitle>
                <DialogDescription>
                  Create a new workspace to organize your files separately.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Workspace name"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateWorkspace()
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateWorkspace}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}