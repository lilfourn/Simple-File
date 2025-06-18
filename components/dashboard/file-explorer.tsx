'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
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
import { createFolder, deleteNode, deleteNodes, moveNode, moveNodes } from '@/app/dashboard/file-organizer/actions'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import WorkspaceSettings from './workspace-settings'
import UploadPopover from './upload-popover'
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
  onDrop,
  selectedNodes,
  onNodeClick,
  onDeleteSelected
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
  selectedNodes: Set<string>
  onNodeClick: (node: Node, e: React.MouseEvent) => void
  onDeleteSelected: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [expandTimer, setExpandTimer] = useState<NodeJS.Timeout | null>(null)
  const router = useRouter()
  const supabase = createClient()
  
  const isSelected = selectedNodes.has(node.id)
  const selectedCount = selectedNodes.size

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
    
    // Create custom drag image
    const dragPreview = document.createElement('div')
    dragPreview.className = 'flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-lg'
    
    const count = isSelected ? selectedCount : 1
    const label = count > 1 ? `${count} items` : node.name
    
    dragPreview.innerHTML = `
      <span>${node.node_type === 'folder' ? '📁' : '📄'}</span>
      <span class="text-sm font-medium">${label}</span>
    `
    dragPreview.style.position = 'absolute'
    dragPreview.style.top = '-1000px'
    document.body.appendChild(dragPreview)
    e.dataTransfer.setDragImage(dragPreview, 0, 0)
    setTimeout(() => dragPreview.remove(), 0)
    
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
      // Add drop animation class temporarily
      const element = e.currentTarget as HTMLElement
      element.style.animation = 'dropBounce 0.4s ease-out'
      setTimeout(() => {
        element.style.animation = ''
      }, 400)
      
      onDrop(node)
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
            data-tree-item
            draggable
            onDragStart={handleDragStart}
            onDragEnd={onDragEnd}
            onDragOver={node.node_type === 'folder' ? handleDragOver : undefined}
            onDragLeave={node.node_type === 'folder' ? handleDragLeave : undefined}
            onDrop={node.node_type === 'folder' ? handleDrop : undefined}
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer group",
              "select-none transition-all duration-200 ease-out",
              "hover:scale-[1.01] active:scale-[0.99]",
              isSelected && "ring-1 ring-primary/30 bg-primary/5",
              isDragging && "opacity-50 scale-105 rotate-1",
              isDragOver && isValidDropTarget && "ring-2 ring-blue-500 bg-blue-50/50 scale-[1.02]",
              isDragOver && !isValidDropTarget && "ring-2 ring-red-500 cursor-not-allowed"
            )}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={(e) => {
              onNodeClick(node, e)
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey && node.node_type === 'folder') {
                setIsExpanded(!isExpanded)
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
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {formatFileSize(node.size)}
              </span>
            )}
            
            {node.node_type === 'folder' && (
              <button
                className="p-0.5 hover:bg-accent rounded transition-all duration-200"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsExpanded(!isExpanded)
                }}
              >
                <ChevronRight 
                  className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    isExpanded && "rotate-90"
                  )} 
                />
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        
        <ContextMenuContent>
          {selectedCount > 1 && isSelected ? (
            // Multi-select context menu
            <>
              <ContextMenuItem disabled className="font-medium">
                {selectedCount} items selected
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={onDeleteSelected} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {selectedCount} items
              </ContextMenuItem>
            </>
          ) : (
            // Single item context menu
            <>
              {node.node_type === 'folder' && (
                <>
                  <UploadPopover
                    workspaceId={workspaceId}
                    parentId={node.id}
                    trigger={
                      <ContextMenuItem onSelect={(e) => e.preventDefault()}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add to Folder
                      </ContextMenuItem>
                    }
                  />
                  <ContextMenuSeparator />
                </>
              )}
              
              {node.node_type === 'file' && (
                <>
                  <ContextMenuItem onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}
              
              <ContextMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>


      {isExpanded && node.children.length > 0 && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {node.children.map((child, index) => (
            <div
              key={child.id}
              style={{ 
                animationDelay: `${index * 20}ms`,
                opacity: 0,
                animation: `fadeIn 0.2s ease-out ${index * 20}ms forwards`
              }}
            >
              <TreeItem
                node={child}
                level={level + 1}
                workspaceId={workspaceId}
                onNodeSelect={onNodeSelect}
                onRefresh={onRefresh}
                draggedNode={draggedNode}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDrop={onDrop}
                selectedNodes={selectedNodes}
                onNodeClick={onNodeClick}
                onDeleteSelected={onDeleteSelected}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FileExplorer({ nodes, workspaceId, workspace, workspaces, onNodeSelect }: FileExplorerProps) {
  const router = useRouter()
  const tree = buildTree(nodes)
  const [draggedNode, setDraggedNode] = useState<Node | null>(null)
  const [isDraggingOverRoot, setIsDraggingOverRoot] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  
  // Multi-select state
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set())
  const [lastSelectedNode, setLastSelectedNode] = useState<string | null>(null)
  const [isCtrlPressed, setIsCtrlPressed] = useState(false)
  const [isShiftPressed, setIsShiftPressed] = useState(false)

  const handleRefresh = () => {
    router.refresh()
  }

  const handleDragStart = (node: Node) => {
    // If dragging a selected node, drag all selected
    if (selectedNodes.has(node.id)) {
      setDraggedNode(node) // Still track the original dragged node
    } else {
      // If dragging non-selected, clear selection and drag only this
      setSelectedNodes(new Set([node.id]))
      setDraggedNode(node)
    }
  }

  const handleDragEnd = () => {
    setDraggedNode(null)
    setIsDraggingOverRoot(false)
  }

  const handleDrop = async (targetNode: Node | null) => {
    if (!draggedNode || isMoving) return
    
    // Get all nodes to move (selected if dragging selected, otherwise just the dragged node)
    const nodesToMove = selectedNodes.has(draggedNode.id) 
      ? Array.from(selectedNodes)
      : [draggedNode.id]
    
    // Check if any node is already in target
    const nodesData = nodes.filter(n => nodesToMove.includes(n.id))
    const allInTarget = nodesData.every(n => 
      n.parent_id === targetNode?.id || (n.parent_id === null && targetNode === null)
    )
    
    if (allInTarget) return

    setIsMoving(true)
    
    // Show optimistic feedback
    const count = nodesToMove.length
    const targetName = targetNode?.name || 'root'
    toast.loading(`Moving ${count} item${count > 1 ? 's' : ''} to ${targetName}...`)
    
    try {
      if (count === 1) {
        const result = await moveNode(draggedNode.id, targetNode?.id || null)
        toast.dismiss()
        
        if (result.newName !== draggedNode.name) {
          toast.success(`Moved "${draggedNode.name}" and renamed to "${result.newName}" to avoid conflicts.`)
        } else {
          toast.success(`Moved "${draggedNode.name}" successfully.`)
        }
      } else {
        const results = await moveNodes(nodesToMove, targetNode?.id || null)
        toast.dismiss()
        
        const renamedCount = results.filter(r => r.renamed).length
        if (renamedCount > 0) {
          toast.success(`Moved ${count} items successfully (${renamedCount} renamed to avoid conflicts)`)
        } else {
          toast.success(`Moved ${count} items successfully`)
        }
      }
      
      setSelectedNodes(new Set())
      router.refresh()
    } catch (error) {
      toast.dismiss()
      console.error('Failed to move items:', error)
      toast.error(error instanceof Error ? error.message : "Failed to move items")
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

  // Multi-select handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(true)
      }
      if (e.key === 'Shift') {
        setIsShiftPressed(true)
      }
      
      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        const allNodeIds = new Set(nodes.map(n => n.id))
        setSelectedNodes(allNodeIds)
      }
      
      // Clear selection
      if (e.key === 'Escape') {
        setSelectedNodes(new Set())
      }
      
      // Delete selected
      if (e.key === 'Delete' && selectedNodes.size > 0) {
        e.preventDefault()
        handleDeleteSelected()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(false)
      }
      if (e.key === 'Shift') {
        setIsShiftPressed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [selectedNodes, nodes])

  const handleNodeClick = (node: Node, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      const newSelection = new Set(selectedNodes)
      if (newSelection.has(node.id)) {
        newSelection.delete(node.id)
      } else {
        newSelection.add(node.id)
      }
      setSelectedNodes(newSelection)
      setLastSelectedNode(node.id)
    } else if (e.shiftKey && lastSelectedNode) {
      // Range selection
      const allNodeIds = nodes.map(n => n.id)
      const startIndex = allNodeIds.indexOf(lastSelectedNode)
      const endIndex = allNodeIds.indexOf(node.id)
      
      if (startIndex !== -1 && endIndex !== -1) {
        const range = allNodeIds.slice(
          Math.min(startIndex, endIndex),
          Math.max(startIndex, endIndex) + 1
        )
        setSelectedNodes(new Set([...selectedNodes, ...range]))
      }
    } else {
      // Single selection
      setSelectedNodes(new Set([node.id]))
      setLastSelectedNode(node.id)
      onNodeSelect?.(node)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedNodes.size === 0) return
    
    const count = selectedNodes.size
    const message = count === 1 
      ? 'Are you sure you want to delete this item?'
      : `Are you sure you want to delete ${count} items?`
    
    if (!confirm(message)) return

    toast.loading(`Deleting ${count} item${count > 1 ? 's' : ''}...`)
    
    try {
      if (count === 1) {
        await deleteNode(Array.from(selectedNodes)[0])
      } else {
        await deleteNodes(Array.from(selectedNodes))
      }
      
      toast.dismiss()
      toast.success(`Deleted ${count} item${count > 1 ? 's' : ''} successfully`)
      setSelectedNodes(new Set())
      router.refresh()
    } catch (error) {
      toast.dismiss()
      console.error('Failed to delete items:', error)
      toast.error('Failed to delete items')
    }
  }


  return (
    <div className="flex flex-col h-full w-full">
      <div 
        className="flex-1 overflow-y-auto px-3 py-4"
        onClick={(e) => {
          // Clear selection if clicking on empty space
          if (e.target === e.currentTarget || e.currentTarget.contains(e.target as Node)) {
            const isClickOnItem = (e.target as HTMLElement).closest('[data-tree-item]')
            if (!isClickOnItem) {
              setSelectedNodes(new Set())
            }
          }
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">Files</h3>
          <UploadPopover
            workspaceId={workspaceId}
            parentId={null}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                className="transition-all duration-200 hover:scale-110 active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </Button>
            }
          />
        </div>


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
                  selectedNodes={selectedNodes}
                  onNodeClick={handleNodeClick}
                  onDeleteSelected={handleDeleteSelected}
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
                  "mt-2 p-4 border-2 border-dashed rounded-lg transition-all duration-300 ease-out",
                  "animate-in fade-in slide-in-from-bottom-2",
                  isDraggingOverRoot
                    ? "border-blue-500 bg-blue-50/50 scale-[1.02] shadow-lg shadow-blue-500/20"
                    : "border-gray-300 hover:border-gray-400"
                )}
              >
                <p className={cn(
                  "text-sm text-muted-foreground text-center transition-all duration-200",
                  isDraggingOverRoot && "text-blue-700 font-medium"
                )}>
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