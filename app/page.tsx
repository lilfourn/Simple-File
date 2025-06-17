import Logo from "@/public/simple-file-brandkit/logo.png";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="px-6 py-4 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-12">
              <Link href="/" className="flex items-center">
                <Image src={Logo} alt="Simple File Logo" height={40} />
              </Link>
              
              <ul className="hidden md:flex items-center gap-8">
                <li>
                  <Link href="/releases" className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
                    RELEASES
                  </Link>
                </li>
                <li>
                  <Link href="/tutorials" className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
                    TUTORIALS
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
                    CONTACT
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
                    PRICING
                  </Link>
                </li>
              </ul>
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" className="font-medium" asChild>
                <Link href="/auth/sign-in">SIGN IN</Link>
              </Button>
              <Button size="sm" className="font-medium" asChild>
                <Link href="/auth/sign-up">GET STARTED</Link>
              </Button>
            </div>
          </nav>
        </div>
      </header>
    </main>
  );
}
