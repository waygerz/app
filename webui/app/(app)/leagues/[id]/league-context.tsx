'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { LeagueDetail } from '@/lib/leagues';

// Replaces react-router's <Outlet context={lg}> / useOutletContext<LeagueDetail>().
// The layout fetches the league, gates on loading/error, and only renders children
// inside this provider — so useLeague() is always given a defined LeagueDetail.
const LeagueContext = createContext<LeagueDetail | null>(null);

export function LeagueProvider({
  value,
  children,
}: {
  value: LeagueDetail;
  children: ReactNode;
}) {
  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

export function useLeague(): LeagueDetail {
  const ctx = useContext(LeagueContext);
  if (!ctx) throw new Error('useLeague must be used within a LeagueProvider');
  return ctx;
}
