import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export default function AuthCodeError() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-semibold">Authentication Error</CardTitle>
          <CardDescription>
            There was an error confirming your authentication request.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p className="mb-4">
            This could happen for a few reasons:
          </p>
          <ul className="space-y-2 text-left">
            <li>• The authentication link has expired</li>
            <li>• The link has already been used</li>
            <li>• There was an issue with your email provider</li>
          </ul>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <Button asChild className="w-full">
            <Link href="/auth/sign-in">
              Try signing in again
            </Link>
          </Button>
          <Button variant="outline" asChild className="w-full">
            <Link href="/">
              Go to homepage
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}