'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database, Tables, TablesInsert } from '@/utils/supabase/database.types'

type Node = Tables<'nodes'>
type Workspace = Tables<'workspaces'>

export async function getUserWorkspaces() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching workspaces:', error)
    return [] as Workspace[]
  }
  
  return (data || []) as Workspace[]
}

export async function createWorkspace(name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      user_id: user.id,
      name,
      is_default: false
    })
    .select()
    .single()

  if (error) throw error
  revalidatePath('/dashboard/file-organizer')
  return data as Workspace
}

export async function updateWorkspace(id: string, name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('workspaces')
    .update({ name })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) throw error
  revalidatePath('/dashboard/file-organizer')
  return data as Workspace
}

export async function getWorkspaceNodes(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('nodes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .order('node_type', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data as Node[]
}

export async function createFolder(workspaceId: string, parentId: string | null, name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')


  // Try to create with original name first
  let folderName = name
  let attempt = 0
  let created = false
  let finalData: Node | null = null

  while (!created && attempt < 10) { // Max 10 attempts
    try {
      const { data, error } = await supabase
        .from('nodes')
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          parent_id: parentId,
          node_type: 'folder',
          name: folderName
        })
        .select()
        .single()

      if (error) throw error
      
      created = true
      finalData = data as Node
    } catch (error: any) {
      // Check if it's a duplicate key error
      if (error?.code === '23505' && error?.message?.includes('idx_unique_node_in_root')) {
        attempt++
        // Generate a new name with number suffix
        folderName = `${name} (${attempt + 1})`
      } else {
        // Re-throw other errors
        throw error
      }
    }
  }

  if (!created || !finalData) {
    throw new Error('Failed to create folder after multiple attempts')
  }

  revalidatePath('/dashboard/file-organizer')
  
  // Return both the created folder and whether it was renamed
  return {
    ...finalData,
    wasRenamed: finalData.name !== name
  } as Node & { wasRenamed: boolean }
}

export async function uploadFile(
  workspaceId: string,
  parentId: string | null,
  file: File,
  path?: string[]
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

  // If path is provided, we need to create the folder structure
  let currentParentId = parentId
  
  if (path && path.length > 0) {
    for (const folderName of path) {
      // Check if folder already exists
      let query = supabase
        .from('nodes')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('name', folderName)
        .eq('node_type', 'folder')
        .eq('user_id', user.id)
      
      // Handle NULL parent_id properly
      if (currentParentId === null) {
        query = query.is('parent_id', null)
      } else {
        query = query.eq('parent_id', currentParentId)
      }
      
      const { data: existingFolder } = await query.single()

      if (existingFolder) {
        currentParentId = existingFolder.id
      } else {
        // Create the folder using our updated createFolder function
        try {
          const result = await createFolder(workspaceId, currentParentId, folderName)
          currentParentId = result.id
          
          // Log if folder was renamed during creation
          if (result.wasRenamed) {
            console.log(`Folder "${folderName}" was created as "${result.name}" to avoid conflict`)
          }
        } catch (err) {
          console.error('Error creating folder:', folderName, err)
          throw err
        }
      }
    }
  }

  // Generate unique storage path
  const fileId = crypto.randomUUID()
  const fileExt = file.name.split('.').pop()
  const storagePath = `${user.id}/${fileId}.${fileExt}`

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('user-files')
    .upload(storagePath, file)

  if (uploadError) throw uploadError

  // Check if file already exists with same name
  let fileQuery = supabase
    .from('nodes')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .eq('node_type', 'file')
    .eq('user_id', user.id)
    .eq('name', file.name)
  
  // Handle NULL parent_id properly
  if (currentParentId === null) {
    fileQuery = fileQuery.is('parent_id', null)
  } else {
    fileQuery = fileQuery.eq('parent_id', currentParentId)
  }
  
  const { data: existingFile } = await fileQuery.single()
  
  // If file exists, generate a unique name
  let fileName = file.name
  if (existingFile) {
    const nameParts = file.name.split('.')
    const extension = nameParts.pop()
    const baseName = nameParts.join('.')
    fileName = `${baseName}_${Date.now()}.${extension}`
  }

  // Create database record
  const { data, error } = await supabase
    .from('nodes')
    .insert({
      user_id: user.id,
      workspace_id: workspaceId,
      parent_id: currentParentId,
      node_type: 'file',
      name: fileName,
      mime_type: file.type,
      size: file.size,
      storage_object_path: storagePath
    })
    .select()
    .single()

  if (error) {
    // Clean up storage if database insert fails
    await supabase.storage.from('user-files').remove([storagePath])
    throw error
  }

  revalidatePath('/dashboard/file-organizer')
  return data as Node
}

export async function deleteNode(nodeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

  // Get node details first
  const { data: node } = await supabase
    .from('nodes')
    .select('*')
    .eq('id', nodeId)
    .eq('user_id', user.id)
    .single()

  if (!node) throw new Error('Node not found')

  // If it's a file, delete from storage
  if (node.node_type === 'file' && node.storage_object_path) {
    await supabase.storage
      .from('user-files')
      .remove([node.storage_object_path])
  }

  // Delete from database (cascade will handle children)
  const { error } = await supabase
    .from('nodes')
    .delete()
    .eq('id', nodeId)
    .eq('user_id', user.id)

  if (error) throw error
  revalidatePath('/dashboard/file-organizer')
}

export async function deleteNodes(nodeIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  if (nodeIds.length === 0) return

  // Get all nodes to be deleted
  const { data: nodes } = await supabase
    .from('nodes')
    .select('*')
    .in('id', nodeIds)
    .eq('user_id', user.id)

  if (!nodes || nodes.length === 0) throw new Error('No nodes found')

  // Collect storage paths for files
  const storagePaths = nodes
    .filter(node => node.node_type === 'file' && node.storage_object_path)
    .map(node => node.storage_object_path!)

  // Delete files from storage if any
  if (storagePaths.length > 0) {
    await supabase.storage
      .from('user-files')
      .remove(storagePaths)
  }

  // Delete all nodes from database (cascade will handle children)
  const { error } = await supabase
    .from('nodes')
    .delete()
    .in('id', nodeIds)
    .eq('user_id', user.id)

  if (error) throw error
  revalidatePath('/dashboard/file-organizer')
}

export async function moveNodes(nodeIds: string[], newParentId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  if (nodeIds.length === 0) return

  // Get all nodes to be moved
  const { data: nodes } = await supabase
    .from('nodes')
    .select('*')
    .in('id', nodeIds)
    .eq('user_id', user.id)

  if (!nodes || nodes.length === 0) throw new Error('No nodes found')

  // Validate target if not root
  if (newParentId) {
    const { data: targetFolder } = await supabase
      .from('nodes')
      .select('*')
      .eq('id', newParentId)
      .eq('user_id', user.id)
      .single()

    if (!targetFolder || targetFolder.node_type !== 'folder') {
      throw new Error('Invalid target folder')
    }

    // Check workspace consistency
    const differentWorkspace = nodes.some(node => node.workspace_id !== targetFolder.workspace_id)
    if (differentWorkspace) {
      throw new Error('Cannot move items between workspaces')
    }

    // Check for circular references for folders
    for (const node of nodes.filter(n => n.node_type === 'folder')) {
      const isCircular = await checkCircularReference(supabase, node.id, newParentId, user.id)
      if (isCircular) {
        throw new Error(`Cannot move folder "${node.name}" into itself or its descendants`)
      }
    }
  }

  // Move all nodes
  const results = []
  for (const node of nodes) {
    // Check for duplicate names and rename if needed
    let finalName = node.name
    let query = supabase
      .from('nodes')
      .select('name')
      .eq('workspace_id', node.workspace_id)
      .eq('user_id', user.id)
      .eq('node_type', node.node_type)
      .neq('id', node.id) // Exclude the node being moved
    
    if (newParentId === null) {
      query = query.is('parent_id', null)
    } else {
      query = query.eq('parent_id', newParentId)
    }
    
    const { data: existingNodes } = await query

    if (existingNodes) {
      const existingNames = new Set(existingNodes.map(n => n.name))
      if (existingNames.has(node.name)) {
        let counter = 1
        const baseName = node.name.replace(/ \(\d+\)$/, '')
        while (existingNames.has(finalName)) {
          finalName = `${baseName} (${counter})`
          counter++
        }
      }
    }

    // Update the node
    const { error } = await supabase
      .from('nodes')
      .update({ 
        parent_id: newParentId,
        name: finalName,
        updated_at: new Date().toISOString()
      })
      .eq('id', node.id)
      .eq('user_id', user.id)

    if (error) throw error
    
    results.push({ id: node.id, newName: finalName, renamed: finalName !== node.name })
  }

  revalidatePath('/dashboard/file-organizer')
  return results
}

export async function moveNode(nodeId: string, newParentId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

  // Get the node to be moved
  const { data: node, error: nodeError } = await supabase
    .from('nodes')
    .select('*')
    .eq('id', nodeId)
    .eq('user_id', user.id)
    .single()

  if (nodeError || !node) throw new Error('Node not found')

  // If moving to a folder (not root), validate the target
  if (newParentId) {
    // Get target folder
    const { data: targetFolder, error: targetError } = await supabase
      .from('nodes')
      .select('*')
      .eq('id', newParentId)
      .eq('user_id', user.id)
      .single()

    if (targetError || !targetFolder) throw new Error('Target folder not found')
    
    // Ensure target is a folder
    if (targetFolder.node_type !== 'folder') {
      throw new Error('Can only move items into folders')
    }

    // Ensure same workspace
    if (targetFolder.workspace_id !== node.workspace_id) {
      throw new Error('Cannot move items between workspaces')
    }

    // Prevent circular reference - check if target is a descendant of the node
    if (node.node_type === 'folder') {
      const isCircular = await checkCircularReference(supabase, nodeId, newParentId, user.id)
      if (isCircular) {
        throw new Error('Cannot move a folder into itself or its descendants')
      }
    }
  }

  // Check for duplicate names in the target location
  let finalName = node.name
  let query = supabase
    .from('nodes')
    .select('name')
    .eq('workspace_id', node.workspace_id)
    .eq('user_id', user.id)
    .eq('node_type', node.node_type)
  
  // Handle NULL parent_id properly
  if (newParentId === null) {
    query = query.is('parent_id', null)
  } else {
    query = query.eq('parent_id', newParentId)
  }
  
  const { data: existingNodes } = await query

  if (existingNodes) {
    const existingNames = new Set(existingNodes.map(n => n.name))
    if (existingNames.has(node.name)) {
      // Generate unique name
      let counter = 1
      const baseName = node.name.replace(/ \(\d+\)$/, '') // Remove existing (n) suffix
      while (existingNames.has(finalName)) {
        finalName = `${baseName} (${counter})`
        counter++
      }
    }
  }

  // Perform the move
  const { error: updateError } = await supabase
    .from('nodes')
    .update({ 
      parent_id: newParentId,
      name: finalName,
      updated_at: new Date().toISOString()
    })
    .eq('id', nodeId)
    .eq('user_id', user.id)

  if (updateError) throw updateError

  revalidatePath('/dashboard/file-organizer')
  return { success: true, newName: finalName }
}

// Helper function to check for circular references
async function checkCircularReference(
  supabase: any,
  nodeId: string,
  targetId: string,
  userId: string
): Promise<boolean> {
  // If trying to move to itself
  if (nodeId === targetId) return true

  // Get all descendants of the node being moved
  const descendants = await getAllDescendants(supabase, nodeId, userId)
  
  // Check if target is in the descendants
  return descendants.has(targetId)
}

// Recursively get all descendant IDs
async function getAllDescendants(
  supabase: any,
  nodeId: string,
  userId: string
): Promise<Set<string>> {
  const descendants = new Set<string>()
  
  const { data: children } = await supabase
    .from('nodes')
    .select('id, node_type')
    .eq('parent_id', nodeId)
    .eq('user_id', userId)

  if (children) {
    for (const child of children) {
      descendants.add(child.id)
      if (child.node_type === 'folder') {
        const childDescendants = await getAllDescendants(supabase, child.id, userId)
        childDescendants.forEach(id => descendants.add(id))
      }
    }
  }

  return descendants
}

export async function deleteWorkspace(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

  // Check if workspace exists and belongs to user
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!workspace) throw new Error('Workspace not found')
  if (workspace.is_default) throw new Error('Cannot delete default workspace')

  // Get all files in this workspace to delete from storage
  const { data: files } = await supabase
    .from('nodes')
    .select('storage_object_path')
    .eq('workspace_id', workspaceId)
    .eq('node_type', 'file')
    .not('storage_object_path', 'is', null)

  // Delete files from storage
  if (files && files.length > 0) {
    const filePaths = files.map(f => f.storage_object_path).filter(Boolean) as string[]
    if (filePaths.length > 0) {
      await supabase.storage
        .from('user-files')
        .remove(filePaths)
    }
  }

  // Delete workspace (cascade will handle nodes)
  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('user_id', user.id)

  if (error) throw error
  revalidatePath('/dashboard/file-organizer')
}