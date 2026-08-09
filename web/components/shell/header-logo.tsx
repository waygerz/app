'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetBody } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { useLayout } from './context';
import { Navbar, secondaryNavItems } from './navbar';

// Page title shown next to the logo in the top bar on mobile (desktop uses the
// Navbar links instead). League detail / new-league keep their own in-page
// headers, so they return null here.
function pageTitle(pathname: string): string | null {
  if (pathname === '/') return 'My Leagues';
  if (pathname === '/bets' || pathname.startsWith('/bets/')) return 'My Bets';
  if (pathname === '/account') return 'Account';
  if (pathname === '/friends') return 'Friends';
  if (pathname.startsWith('/sports')) return 'Sports';
  return null;
}

export function HeaderLogo() {
  const pathname = usePathname();
  const { isMobile } = useLayout();
  const title = pageTitle(pathname);

  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Close sheet when route changes
  useEffect(() => {
    setIsSheetOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-w-0 shrink items-center gap-2 sm:gap-5 lg:w-[200px]">
      <div className="flex items-center gap-1">
        {isMobile && (
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="dim" mode="icon" className="-ms-2.5">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              className="p-2.5 gap-0 w-[200px] dark"
              side="left"
              close={false}
            >
              <SheetHeader className="p-0 space-y-0" />
              <SheetBody className="flex flex-col grow p-0 dark overflow-y-auto">
                <Navbar items={secondaryNavItems} />
              </SheetBody>
            </SheetContent>
          </Sheet>
        )}
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo-64.png" alt="Waygerz" className="size-9 shrink-0" />
          <span className="hidden text-lg font-extrabold tracking-tight text-white lg:inline">Waygerz</span>
        </Link>
      </div>
      {/* Mobile: the page title rides in the top bar (desktop shows the Navbar). */}
      {title && (
        <span className="min-w-0 truncate text-lg font-bold text-white lg:hidden">{title}</span>
      )}
    </div>
  );
}
