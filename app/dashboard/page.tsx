import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export default async function Dashboard() {
  const supabase = await createClient()
  
  const { data, error } = await supabase.auth.getUser()
  
  if (error || !data?.user) {
    redirect('/auth/sign-in')
  }

  return (
    <main className="px-6 py-8 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Welcome to Simply File. Your AI-powered file organizer.
        </p>
        
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold">File Organizer</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Automatically organize and rename your files using AI
            </p>
          </div>
          
          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold">Checklist Manager</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Match documents to checklist items intelligently
            </p>
          </div>
          
          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold">Coming Soon</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              More features are on the way
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
