'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { leaguesApi } from '@/lib/leagues';
import { isEspnSport } from '@/lib/espn';

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// Page title shown next to the logo in the top bar on mobile (desktop uses the
// Navbar links instead). The message thread keeps its own in-thread header, so
// it returns null. League detail also returns null here — its title is the
// league name, filled in from the league query in HeaderLogo (the path only
// carries the id, not the name).
function pageTitle(pathname: string): string | null {
  if (pathname === '/') return 'My Leagues';
  if (pathname === '/bets' || pathname.startsWith('/bets/')) return 'My Bets';
  if (pathname === '/account') return 'Account';
  if (pathname === '/friends') return 'Friends';
  if (pathname === '/sports') return 'Pick a sport';
  if (pathname === '/leagues/new') return 'Create a league';
  // The message thread renders its own in-thread header (avatar + name), so
  // suppress the generic title there — same as league detail.
  if (pathname === '/messages') return 'Messages';
  if (pathname.startsWith('/messages/')) return null;
  if (pathname === '/notifications') return 'Notifications';
  // Dynamic sports pages mirror their slug-derived in-page title so the mobile
  // top bar carries it. ESPN sports render their own header (EspnSportList), so
  // return null for those and let that view own the title.
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'sports') {
    if (parts.length === 2) {
      return isEspnSport(parts[1]) ? null : titleCase(parts[1].replace(/-/g, ' '));
    }
    if (parts.length === 4 && parts[2] === 'leagues') {
      return parts[3].replace(/-/g, ' ').toUpperCase();
    }
  }
  return null;
}

export function HeaderLogo() {
  const pathname = usePathname();

  // On a league detail path (/leagues/<id> and its sub-tabs), the mobile top bar
  // carries the league NAME. The fixed header stays pinned as the page scrolls,
  // so this keeps league context visible after the in-page header scrolls away.
  // Read from the same ['league', id] cache the league layout populates (shared,
  // so no extra fetch); show a neutral "League" until it resolves on a cold open.
  const parts = pathname.split('/').filter(Boolean);
  const leagueId = parts[0] === 'leagues' && parts[1] && parts[1] !== 'new' ? parts[1] : null;
  const league = useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => leaguesApi.get(leagueId as string),
    enabled: !!leagueId,
    staleTime: 30_000,
  });

  const title = leagueId ? (league.data?.name ?? 'League') : pageTitle(pathname);

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
