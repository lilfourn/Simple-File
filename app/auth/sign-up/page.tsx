'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { signup } from '@/app/auth/actions'
import Logo from '@/public/simple-file-brandkit/logo.png'
import Image from 'next/image'

export default function SignUp() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setLoading(true)
    
    try {
      const result = await signup(formData)
      if (result?.error) {
        setError(result.error)
        setLoading(false)
      }
    } catch (err) {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex">
      <div className="w-full lg:w-1/2 flex items-center justify-center px-4">
        <Card className="w-full max-w-md border-0 shadow-none">
          <CardHeader className="space-y-1 flex flex-col items-center">
            <Link href="/" className="mb-4">
              <Image src={Logo} alt="Simple File Logo" height={40} />
            </Link>
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Create an account
            </CardTitle>
            <CardDescription>
              Enter your email below to create your account
            </CardDescription>
          </CardHeader>
          <form action={handleSubmit}>
            <input type="hidden" name="origin" value={typeof window !== 'undefined' ? window.location.origin : ''} />
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-[#bf4d43]">{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  disabled={loading}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-6">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'Sign up'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link 
                  href="/auth/sign-in" 
                  className="font-medium text-primary hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-8">
        <div className="w-full h-full bg-gradient-to-br from-[#61aaf2] via-[#cc785c] to-[#fafaf0] rounded-3xl flex items-center justify-center">
          <div className="max-w-md text-center px-8">
            <h2 className="text-4xl font-bold text-white mb-4">
              Start organizing smarter
            </h2>
            <p className="text-lg text-white/90">
              Transform how you manage files with AI-powered automation. Your data never leaves your device.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
