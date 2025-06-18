'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Download,
  Edit,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  FileSpreadsheet
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tables } from '@/utils/supabase/database.types'
import { createFolder, deleteNode, moveNode } from '@/app/dashboard/file-organizer/actions'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import WorkspaceSettings from './workspace-settings'
import { toast } from 'sonner'

type Node = Tables<'nodes'>

interface FileExplorerProps {
  nodes: Node[]
  workspaceId: string
  workspace: Tables<'workspaces'>
  workspaces: Tables<'workspaces'>[]
  onNodeSelect?: (node: Node) => void
}

interface TreeNode extends Node {
  children: TreeNode[]
}

function buildTree(nodes: Node[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>()
  const rootNodes: TreeNode[] = []

  // First pass: create TreeNode for each node
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [] })
  })

  // Second pass: build hierarchy
  nodes.forEach(node => {
    const treeNode = nodeMap.get(node.id)!
    if (node.parent_id) {
      const parent = nodeMap.get(node.parent_id)
      if (parent) {
        parent.children.push(treeNode)
      }
    } else {
      rootNodes.push(treeNode)
    }
  })

  // Sort nodes: folders first, then by name
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.node_type !== b.node_type) {
        return a.node_type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    nodes.forEach(node => sortNodes(node.children))
  }

  sortNodes(rootNodes)
  return rootNodes
}

function getFileIcon(mimeType: string | null, name: string) {
  if (!mimeType) {
    const ext = name.split('.').pop()?.toLowerCase()
    if (ext) {
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) 
        return <FileImage className="h-4 w-4" />
      if (['mp4', 'avi', 'mov', 'webm'].includes(ext)) 
        return <FileVideo className="h-4 w-4" />
      if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) 
        return <FileAudio className="h-4 w-4" />
      if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs'].includes(ext)) 
        return <FileCode className="h-4 w-4" />
      if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) 
        return <FileArchive className="h-4 w-4" />
      if (['xls', 'xlsx', 'csv'].includes(ext)) 
        return <FileSpreadsheet className="h-4 w-4" />
      if (['doc', 'docx', 'pdf', 'txt'].includes(ext)) 
        return <FileText className="h-4 w-4" />
    }
  } else {
    if (mimeType.startsWith('image/')) return <FileImage className="h-4 w-4" />
    if (mimeType.startsWith('video/')) return <FileVideo className="h-4 w-4" />
    if (mimeType.startsWith('audio/')) return <FileAudio className="h-4 w-4" />
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) 
      return <FileSpreadsheet className="h-4 w-4" />
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.startsWith('text/')) 
      return <FileText className="h-4 w-4" />
  }
  return <File className="h-4 w-4" />
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

function TreeItem({ 
  node, 
  level = 0,
  workspaceId,
  onNodeSelect,
  onRefresh,
  draggedNode,
  onDragStart,
  onDragEnd,
  onDrop
}: { 
  node: TreeNode
  level?: number
  workspaceId: string
  onNodeSelect?: (node: Node) => void
  onRefresh: () => void
  draggedNode: Node | null
  onDragStart: (node: Node) => void
  onDragEnd: () => void
  onDrop: (targetNode: Node) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [expandTimer, setExpandTimer] = useState<NodeJS.Timeout | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Check if this node can accept the dragged node
  const canAcceptDrop = useCallback(() => {
    if (!draggedNode) return false
    if (node.node_type !== 'folder') return false
    if (draggedNode.id === node.id) return false
    if (draggedNode.workspace_id !== node.workspace_id) return false
    // Additional validation will be done server-side
    return true
  }, [draggedNode, node])

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/json', JSON.stringify({
      nodeId: node.id,
      nodeType: node.node_type,
      workspaceId: node.workspace_id,
      parentId: node.parent_id
    }))
    onDragStart(node)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (canAcceptDrop()) {
      e.dataTransfer.dropEffect = 'move'
      setIsDragOver(true)
      
      // Auto-expand folders after hovering for 500ms
      if (node.node_type === 'folder' && !isExpanded && !expandTimer) {
        const timer = setTimeout(() => {
          setIsExpanded(true)
          setExpandTimer(null)
        }, 500)
        setExpandTimer(timer)
      }
    } else {
      e.dataTransfer.dropEffect = 'none'
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    
    if (expandTimer) {
      clearTimeout(expandTimer)
      setExpandTimer(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    
    if (expandTimer) {
      clearTimeout(expandTimer)
      setExpandTimer(null)
    }
    
    if (canAcceptDrop()) {
      onDrop(node)
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return

    try {
      await createFolder(workspaceId, node.id, newFolderName.trim())
      setNewFolderName('')
      setIsCreatingFolder(false)
      setIsExpanded(true)
      onRefresh()
    } catch (error) {
      console.error('Failed to create folder:', error)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${node.name}"?`)) return

    try {
      await deleteNode(node.id)
      onRefresh()
    } catch (error) {
      console.error('Failed to delete node:', error)
    }
  }

  const handleDownload = async () => {
    if (node.node_type !== 'file' || !node.storage_object_path) return

    try {
      const { data } = await supabase.storage
        .from('user-files')
        .download(node.storage_object_path)
      
      if (data) {
        const url = URL.createObjectURL(data)
        const a = document.createElement('a')
        a.href = url
        a.download = node.name
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Failed to download file:', error)
    }
  }

  const isDragging = draggedNode?.id === node.id
  const isValidDropTarget = node.node_type === 'folder' && canAcceptDrop()

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={onDragEnd}
            onDragOver={node.node_type === 'folder' ? handleDragOver : undefined}
            onDragLeave={node.node_type === 'folder' ? handleDragLeave : undefined}
            onDrop={node.node_type === 'folder' ? handleDrop : undefined}
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer group",
              "select-none transition-all",
              isDragging && "opacity-50",
              isDragOver && isValidDropTarget && "ring-2 ring-blue-500 bg-blue-50/50",
              isDragOver && !isValidDropTarget && "ring-2 ring-red-500 cursor-not-allowed"
            )}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => {
              if (node.node_type === 'folder') {
                setIsExpanded(!isExpanded)
              } else {
                onNodeSelect?.(node)
              }
            }}
          >
            {node.node_type === 'folder' ? (
              <Folder className="h-4 w-4 text-blue-600" />
            ) : (
              getFileIcon(node.mime_type, node.name)
            )}
            
            <span className="text-sm flex-1 truncate">{node.name}</span>
            
            {node.node_type === 'file' && node.size && (
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
                {formatFileSize(node.size)}
              </span>
            )}
            
            {node.node_type === 'folder' && (
              <button
                className="p-0.5 hover:bg-accent rounded"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsExpanded(!isExpanded)
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        
        <ContextMenuContent>
          {node.node_type === 'folder' && (
            <>
              <ContextMenuItem onClick={() => setIsCreatingFolder(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Folder
              </ContextMenuItem>
            </>
          )}
          
          {node.node_type === 'file' && (
            <ContextMenuItem onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </ContextMenuItem>
          )}
          
          <ContextMenuItem onClick={handleDelete} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isCreatingFolder && (
        <div className="flex items-center gap-2 px-2 py-1" style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}>
          <Folder className="h-4 w-4 text-blue-600" />
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder()
              if (e.key === 'Escape') {
                setIsCreatingFolder(false)
                setNewFolderName('')
              }
            }}
            placeholder="Folder name"
            className="h-6 text-sm"
            autoFocus
          />
        </div>
      )}

      {isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              workspaceId={workspaceId}
              onNodeSelect={onNodeSelect}
              onRefresh={onRefresh}
              draggedNode={draggedNode}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FileExplorer({ nodes, workspaceId, workspace, workspaces, onNodeSelect }: FileExplorerProps) {
  const router = useRouter()
  const tree = buildTree(nodes)
  const [isCreatingRootFolder, setIsCreatingRootFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [draggedNode, setDraggedNode] = useState<Node | null>(null)
  const [isDraggingOverRoot, setIsDraggingOverRoot] = useState(false)
  const [isMoving, setIsMoving] = useState(false)

  const handleCreateRootFolder = async () => {
    if (!newFolderName.trim()) return

    try {
      await createFolder(workspaceId, null, newFolderName.trim())
      setNewFolderName('')
      setIsCreatingRootFolder(false)
      router.refresh()
    } catch (error) {
      console.error('Failed to create folder:', error)
    }
  }

  const handleRefresh = () => {
    router.refresh()
  }

  const handleDragStart = (node: Node) => {
    setDraggedNode(node)
  }

  const handleDragEnd = () => {
    setDraggedNode(null)
    setIsDraggingOverRoot(false)
  }

  const handleDrop = async (targetNode: Node | null) => {
    if (!draggedNode || isMoving) return
    
    // Don't move if dropping on same parent
    if (draggedNode.parent_id === targetNode?.id || 
        (draggedNode.parent_id === null && targetNode === null)) {
      return
    }

    setIsMoving(true)
    try {
      const result = await moveNode(draggedNode.id, targetNode?.id || null)
      
      if (result.newName !== draggedNode.name) {
        toast.success(`Moved "${draggedNode.name}" and renamed to "${result.newName}" to avoid conflicts.`)
      } else {
        toast.success(`Moved "${draggedNode.name}" successfully.`)
      }
      
      router.refresh()
    } catch (error) {
      console.error('Failed to move node:', error)
      toast.error(error instanceof Error ? error.message : "Failed to move item")
    } finally {
      setIsMoving(false)
      setDraggedNode(null)
    }
  }

  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (draggedNode && draggedNode.parent_id !== null) {
      e.dataTransfer.dropEffect = 'move'
      setIsDraggingOverRoot(true)
    }
  }

  const handleRootDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOverRoot(false)
  }

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOverRoot(false)
    
    if (draggedNode && draggedNode.parent_id !== null) {
      handleDrop(null)
    }
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">Files</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsCreatingRootFolder(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {isCreatingRootFolder && (
          <div className="flex items-center gap-2 px-2 py-1 mb-2">
            <Folder className="h-4 w-4 text-blue-600" />
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateRootFolder()
                if (e.key === 'Escape') {
                  setIsCreatingRootFolder(false)
                  setNewFolderName('')
                }
              }}
              placeholder="Folder name"
              className="h-6 text-sm"
              autoFocus
            />
          </div>
        )}

        {tree.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2">
            No files yet. Upload files or create folders to get started.
          </p>
        ) : (
          <>
            <div className="space-y-0.5">
              {tree.map((node) => (
                <TreeItem
                  key={node.id}
                  node={node}
                  workspaceId={workspaceId}
                  onNodeSelect={onNodeSelect}
                  onRefresh={handleRefresh}
                  draggedNode={draggedNode}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                />
              ))}
            </div>
            
            {/* Root drop zone */}
            {draggedNode && draggedNode.parent_id !== null && (
              <div
                onDragOver={handleRootDragOver}
                onDragLeave={handleRootDragLeave}
                onDrop={handleRootDrop}
                className={cn(
                  "mt-2 p-4 border-2 border-dashed rounded-lg transition-all",
                  isDraggingOverRoot
                    ? "border-blue-500 bg-blue-50/50"
                    : "border-gray-300"
                )}
              >
                <p className="text-sm text-muted-foreground text-center">
                  Drop here to move to root
                </p>
              </div>
            )}
          </>
        )}
      </div>
      
      <div className="border-t">
        <div className="px-3 py-4">
          <WorkspaceSettings workspace={workspace} workspaces={workspaces} />
        </div>
      </div>
    </div>
  )
}