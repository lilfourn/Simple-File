import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MailIcon } from 'lucide-react'
import Logo from '@/public/simple-file-brandkit/logo.png'
import Image from 'next/image'

export default function VerifyEmail() {
  return (
    <main className="min-h-screen flex">
      <div className="w-full lg:w-1/2 flex items-center justify-center px-4">
        <Card className="w-full max-w-md border-0 shadow-none">
          <CardHeader className="space-y-1 flex flex-col items-center">
            <Link href="/" className="mb-4">
              <Image src={Logo} alt="Simple File Logo" height={40} />
            </Link>
            <div className="rounded-full bg-primary/10 p-3 mb-4">
              <MailIcon className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Check your email
            </CardTitle>
            <CardDescription className="text-center">
              We've sent you a verification link to confirm your email address
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              <p className="mb-2">To complete your registration:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Check your email inbox</li>
                <li>Click the verification link in the email</li>
                <li>You'll be redirected to sign in</li>
              </ol>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Didn't receive the email? Check your spam folder or contact support.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-6">
            <Button 
              asChild 
              variant="outline" 
              className="w-full"
            >
              <Link href="/auth/sign-in">
                Return to sign in
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-8">
        <div className="w-full h-full bg-gradient-to-br from-[#61aaf2] via-[#cc785c] to-[#fafaf0] rounded-3xl flex items-center justify-center">
          <div className="max-w-md text-center px-8">
            <h2 className="text-4xl font-bold text-white mb-4">
              Almost there!
            </h2>
            <p className="text-lg text-white/90">
              We take security seriously. Email verification helps keep your account safe.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}