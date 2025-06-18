'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import WorkspaceHeader from '@/components/dashboard/workspace-header'
import FileExplorer from '@/components/dashboard/file-explorer'
import { Tables } from '@/utils/supabase/database.types'
import { Card } from '@/components/ui/card'

type Workspace = Tables<'workspaces'>
type Node = Tables<'nodes'>

interface FileOrganizerClientProps {
  workspaces: Workspace[]
  currentWorkspaceId: string
  initialNodes: Node[]
}

export default function FileOrganizerClient({
  workspaces,
  currentWorkspaceId,
  initialNodes
}: FileOrganizerClientProps) {
  const router = useRouter()
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [hasInitialized, setHasInitialized] = useState(false)

  useEffect(() => {
    // If we have workspaces, mark as initialized
    if (workspaces.length > 0) {
      setHasInitialized(true)
    }
  }, [workspaces])

  const handleWorkspaceChange = (workspaceId: string) => {
    router.push(`/dashboard/file-organizer?workspace=${workspaceId}`)
  }


  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        onWorkspaceChange={handleWorkspaceChange}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - File Explorer */}
        <div className="w-64 border-r bg-muted/10 flex">
          <FileExplorer
            nodes={initialNodes}
            workspaceId={currentWorkspaceId}
            workspace={workspaces.find(w => w.id === currentWorkspaceId)!}
            workspaces={workspaces}
            onNodeSelect={setSelectedNode}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold">File Organizer</h1>
              <p className="text-muted-foreground">
                Upload and organize your files with AI-powered assistance
              </p>
            </div>


            {/* Selected File Info */}
            {selectedNode?.node_type === 'file' && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">File Details</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{selectedNode.name}</span>
                  </div>
                  {selectedNode.mime_type && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span>{selectedNode.mime_type}</span>
                    </div>
                  )}
                  {selectedNode.size && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Size:</span>
                      <span>{(selectedNode.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span>{new Date(selectedNode.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </Card>
            )}

            {/* AI Features Preview */}
            <Card className="p-6 bg-muted/50">
              <h2 className="text-lg font-semibold mb-4">AI Features (Coming Soon)</h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                  <div>
                    <p className="font-medium text-foreground">Smart Rename</p>
                    <p>AI will analyze your files and suggest better names based on content</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                  <div>
                    <p className="font-medium text-foreground">Auto-Organize</p>
                    <p>Automatically sort files into appropriate folders</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                  <div>
                    <p className="font-medium text-foreground">Content Search</p>
                    <p>Search files by their actual content, not just names</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}