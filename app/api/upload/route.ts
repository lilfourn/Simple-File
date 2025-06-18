import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const workspaceId = formData.get('workspaceId') as string
    const parentId = formData.get('parentId') as string | null
    const path = formData.get('path') as string | null

    if (!file || !workspaceId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Parse path if provided
    const pathArray = path ? JSON.parse(path) : undefined

    // Generate unique storage path
    const fileId = crypto.randomUUID()
    const fileExt = file.name.split('.').pop()
    const storagePath = `${user.id}/${fileId}.${fileExt}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('user-files')
      .upload(storagePath, file)

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // If path is provided, we need to create the folder structure
    let currentParentId = parentId === 'null' ? null : parentId
    
    if (pathArray && pathArray.length > 0) {
      for (const folderName of pathArray) {
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
          // Create the folder
          const { data: newFolder, error: folderError } = await supabase
            .from('nodes')
            .insert({
              user_id: user.id,
              workspace_id: workspaceId,
              parent_id: currentParentId,
              node_type: 'folder',
              name: folderName
            })
            .select()
            .single()

          if (folderError) {
            // Clean up storage if folder creation fails
            await supabase.storage.from('user-files').remove([storagePath])
            return NextResponse.json({ error: folderError.message }, { status: 500 })
          }

          currentParentId = newFolder.id
        }
      }
    }

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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    revalidatePath('/dashboard/file-organizer')
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}