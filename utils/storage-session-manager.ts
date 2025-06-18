import { createClient } from '@/utils/supabase/client'
import { Session } from '@supabase/supabase-js'

export class StorageSessionManager {
  private supabase = createClient()
  private refreshTimer: NodeJS.Timeout | null = null
  private session: Session | null = null
  
  async getValidSession(): Promise<Session | null> {
    try {
      // Get current session
      const { data: { session } } = await this.supabase.auth.getSession()
      
      if (!session) {
        console.error('No session found')
        return null
      }
      
      // Check if token is about to expire (within 5 minutes)
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
      const now = Date.now()
      const timeUntilExpiry = expiresAt - now
      
      // If token expires in less than 5 minutes, refresh it
      if (timeUntilExpiry < 5 * 60 * 1000) {
        console.log('Session expiring soon, refreshing...')
        const { data: { session: refreshedSession }, error } = await this.supabase.auth.refreshSession()
        
        if (error) {
          console.error('Failed to refresh session:', error)
          return null
        }
        
        return refreshedSession
      }
      
      return session
    } catch (error) {
      console.error('Error getting valid session:', error)
      return null
    }
  }
  
  startAutoRefresh(onRefresh?: (session: Session) => void) {
    // Clear any existing timer
    this.stopAutoRefresh()
    
    // Set up auth state change listener
    this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        console.log('Token refreshed successfully')
        this.session = session
        if (onRefresh) {
          onRefresh(session)
        }
      }
    })
    
    // Check and refresh token every 30 seconds during uploads
    this.refreshTimer = setInterval(async () => {
      const session = await this.getValidSession()
      if (session && onRefresh) {
        onRefresh(session)
      }
    }, 30000) // 30 seconds
  }
  
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }
  
  async validateUploadSession(): Promise<{ valid: boolean; session: Session | null }> {
    const session = await this.getValidSession()
    
    if (!session) {
      return { valid: false, session: null }
    }
    
    // Additional validation
    if (!session.access_token || !session.user?.id) {
      console.error('Invalid session structure')
      return { valid: false, session: null }
    }
    
    return { valid: true, session }
  }
}