import { createClient } from '@/utils/supabase/client'

export interface FolderPath {
  path: string[]
  depth: number
}

export interface FolderNode {
  name: string
  parentId: string | null
  id?: string
  children: Map<string, FolderNode>
}

export class FolderStructureProcessor {
  private supabase = createClient()
  private folderCache = new Map<string, string>() // path -> folder ID

  /**
   * Extract unique folder paths from files and sort by depth
   */
  extractFolderPaths(files: Array<{ path?: string[] }>): FolderPath[] {
    const uniquePaths = new Map<string, FolderPath>()

    files.forEach(file => {
      if (!file.path || file.path.length === 0) return

      // Add all parent paths
      for (let i = 1; i <= file.path.length; i++) {
        const partialPath = file.path.slice(0, i)
        const pathKey = partialPath.join('/')
        
        if (!uniquePaths.has(pathKey)) {
          uniquePaths.set(pathKey, {
            path: partialPath,
            depth: partialPath.length
          })
        }
      }
    })

    // Sort by depth (parents first)
    return Array.from(uniquePaths.values()).sort((a, b) => a.depth - b.depth)
  }

  /**
   * Create folder structure in database
   */
  async createFolderStructure(
    workspaceId: string,
    rootParentId: string | null,
    folderPaths: FolderPath[],
    userId: string
  ): Promise<Map<string, string>> {
    const pathToId = new Map<string, string>()

    for (const folderPath of folderPaths) {
      const fullPath = folderPath.path.join('/')
      
      // Check cache first
      const cacheKey = `${workspaceId}:${rootParentId || 'root'}:${fullPath}`
      if (this.folderCache.has(cacheKey)) {
        pathToId.set(fullPath, this.folderCache.get(cacheKey)!)
        continue
      }

      // Determine parent ID
      let parentId = rootParentId
      if (folderPath.path.length > 1) {
        const parentPath = folderPath.path.slice(0, -1).join('/')
        parentId = pathToId.get(parentPath) || rootParentId
      }

      const folderName = folderPath.path[folderPath.path.length - 1]

      // Check if folder exists
      let query = this.supabase
        .from('nodes')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('name', folderName)
        .eq('node_type', 'folder')

      if (parentId === null) {
        query = query.is('parent_id', null)
      } else {
        query = query.eq('parent_id', parentId)
      }

      const { data: existingFolder, error: queryError } = await query.maybeSingle()
      
      // Handle actual errors (not just "not found")
      if (queryError) {
        console.error('Error checking folder existence:', queryError)
      }

      if (existingFolder) {
        pathToId.set(fullPath, existingFolder.id)
        this.folderCache.set(cacheKey, existingFolder.id)
      } else {
        // Create folder
        const { data: newFolder, error } = await this.supabase
          .from('nodes')
          .insert({
            user_id: userId,
            workspace_id: workspaceId,
            parent_id: parentId,
            node_type: 'folder',
            name: folderName
          })
          .select()
          .single()

        if (error) {
          console.error('Failed to create folder:', error)
          throw new Error(`Failed to create folder: ${folderName}`)
        }

        pathToId.set(fullPath, newFolder.id)
        this.folderCache.set(cacheKey, newFolder.id)
      }
    }

    return pathToId
  }

  /**
   * Build a tree structure from folder paths for visualization
   */
  buildFolderTree(folderPaths: FolderPath[], rootParentId: string | null = null): FolderNode {
    const root: FolderNode = {
      name: 'root',
      parentId: null,
      children: new Map()
    }

    folderPaths.forEach(folderPath => {
      let currentNode = root
      let currentParentId = rootParentId

      folderPath.path.forEach((folderName, index) => {
        if (!currentNode.children.has(folderName)) {
          currentNode.children.set(folderName, {
            name: folderName,
            parentId: currentParentId,
            children: new Map()
          })
        }
        currentNode = currentNode.children.get(folderName)!
        // Parent ID will be set when folders are created
      })
    })

    return root
  }

  /**
   * Clear the folder cache (useful when switching workspaces)
   */
  clearCache() {
    this.folderCache.clear()
  }

  /**
   * Get the folder ID for a given path from cache
   */
  getFolderIdFromPath(workspaceId: string, rootParentId: string | null, path: string[]): string | undefined {
    const fullPath = path.join('/')
    const cacheKey = `${workspaceId}:${rootParentId || 'root'}:${fullPath}`
    return this.folderCache.get(cacheKey)
  }
}