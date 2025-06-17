import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import CustomSidebar from '@/components/dashboard/custom-sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/sign-in')
  }

  return (
    <div className="flex h-screen">
      <CustomSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}