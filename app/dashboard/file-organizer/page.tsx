import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getUserWorkspaces, getWorkspaceNodes } from './actions'
import FileOrganizerClient from './file-organizer-client'

export default async function FileOrganizerPage({
  searchParams
}: {
  searchParams: Promise<{ workspace?: string }>
}) {
  // Handle async searchParams in Next.js 15
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/sign-in')
  }

  // Get user workspaces
  let workspaces = await getUserWorkspaces()
  
  if (workspaces.length === 0) {
    // Try to fetch workspaces directly in case there was a timing issue
    const { data: existingWorkspaces } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    
    if (existingWorkspaces && existingWorkspaces.length > 0) {
      workspaces = existingWorkspaces
    } else {
      // Only create if truly no workspaces exist
      const { data, error } = await supabase
        .from('workspaces')
        .insert({
          user_id: user.id,
          name: 'Default Workspace',
          is_default: true
        })
        .select()
        .single()
      
      if (error) {
        // If it's a duplicate key error, fetch the existing workspace
        if (error.code === '23505') {
          const { data: defaultWorkspace } = await supabase
            .from('workspaces')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_default', true)
            .single()
          
          if (defaultWorkspace) {
            workspaces = [defaultWorkspace]
          } else {
            // Fetch any workspace
            const { data: anyWorkspace } = await supabase
              .from('workspaces')
              .select('*')
              .eq('user_id', user.id)
              .limit(1)
              
            workspaces = anyWorkspace || []
          }
        } else {
          console.error('Failed to create default workspace:', error)
          return (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Failed to initialize workspace. Please try refreshing the page.</p>
            </div>
          )
        }
      } else {
        workspaces = [data]
      }
    }
  }

  // Get current workspace
  const currentWorkspaceId = params.workspace || workspaces.find(w => w.is_default)?.id || workspaces[0].id
  
  // Verify user owns this workspace
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId)
  if (!currentWorkspace) {
    redirect(`/dashboard/file-organizer?workspace=${workspaces[0].id}`)
  }

  // Get nodes for current workspace
  const nodes = await getWorkspaceNodes(currentWorkspaceId)

  return (
    <FileOrganizerClient
      workspaces={workspaces}
      currentWorkspaceId={currentWorkspaceId}
      initialNodes={nodes}
    />
  )
}