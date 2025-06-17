import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('redirect_to') ?? '/dashboard'

  if (token_hash && type) {
    const supabase = await createClient()
    
    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    })

    if (!error) {
      // Redirect to dashboard or the specified redirect URL
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  // Redirect to error page if something went wrong
  return NextResponse.redirect(new URL('/auth/auth-code-error', request.url))
}