'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import Logo from '@/public/simple-file-brandkit/logo.png'
import {
  Home,
  FolderOpen,
  ListChecks,
  Settings,
  HelpCircle,
  LogOut,
  BarChart3
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { signOut } from '@/app/auth/actions'
import { createClient } from '@/utils/supabase/client'

interface NavItem {
  title: string
  href: string
  icon: React.ReactNode
  children?: NavItem[]
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: <Home className="h-5 w-5" />
  },
  {
    title: 'File Organizer',
    href: '/dashboard/file-organizer',
    icon: <FolderOpen className="h-5 w-5" />
  },
  {
    title: 'Checklist Organizer',
    href: '/dashboard/checklist',
    icon: <ListChecks className="h-5 w-5" />
  },
  {
    title: 'Analytics',
    href: '/dashboard/analytics',
    icon: <BarChart3 className="h-5 w-5" />
  },
  {
    title: 'Settings',
    href: '/dashboard/settings',
    icon: <Settings className="h-5 w-5" />
  }
]

const bottomNavItems: NavItem[] = [
  {
    title: 'Help & Support',
    href: '/dashboard/help',
    icon: <HelpCircle className="h-5 w-5" />
  }
]

export default function CustomSidebar() {
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState<string>('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const getUserEmail = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        setUserEmail(user.email)
      }
    }
    getUserEmail()
  }, [])

  const isActive = (href: string) => {
    // Exact match
    if (pathname === href) return true
    
    // For /dashboard, only match exact (not sub-routes)
    if (href === '/dashboard') return false
    
    // For other routes, check if it's a sub-route
    return pathname.startsWith(href + '/')
  }

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href)

    return (
      <Tooltip key={item.href} delayDuration={500}>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            className={cn(
              "flex items-center justify-center rounded-lg p-3 transition-all hover:bg-accent",
              active && "bg-primary/10"
            )}
          >
            {item.icon}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <p>{item.title}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex h-full w-20 flex-col border-r bg-background">
        {/* Logo */}
        <div className="flex h-16 items-center justify-center px-3">
          <Link href="/dashboard">
            <Image src={Logo} alt="Simple File" height={32} />
          </Link>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map(item => renderNavItem(item))}
        </nav>

        {/* Bottom Section */}
        <div className="space-y-1 border-t p-3">
          {bottomNavItems.map(item => renderNavItem(item))}
          
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="w-full p-3"
                title="Account"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="right" className="w-64">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Signed in as</p>
                  <p className="text-sm font-medium">{userEmail}</p>
                </div>
                <form action={signOut}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full"
                    size="sm"
                  >
                    Sign out
                  </Button>
                </form>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </TooltipProvider>
  )
}