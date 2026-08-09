'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Page title shown next to the logo in the top bar on mobile (desktop uses the
// Navbar links instead). League detail / new-league keep their own in-page
// headers, so they return null here.
function pageTitle(pathname: string): string | null {
  if (pathname === '/') return 'My Leagues';
  if (pathname === '/bets' || pathname.startsWith('/bets/')) return 'My Bets';
  if (pathname === '/account') return 'Account';
  if (pathname === '/friends') return 'Friends';
  return null;
}

export function HeaderLogo() {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <div className="flex min-w-0 shrink items-center gap-2 sm:gap-5 lg:w-[200px]">
      {/* Brand — links home */}
      <Link href="/" className="flex items-center gap-2">
        <img src="/logo-64.png" alt="Waygerz" className="size-9 shrink-0" />
        <span className="hidden text-lg font-extrabold tracking-tight text-white lg:inline">Waygerz</span>
      </Link>
      {/* Mobile: the page title rides in the top bar (desktop shows the Navbar). */}
      {title && (
        <span className="min-w-0 truncate text-lg font-bold text-white lg:hidden">{title}</span>
      )}
    </div>
  );
}
