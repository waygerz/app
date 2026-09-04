'use client';

import { type Wager, type WagerStatus } from '@/lib/wagers';

export type BetFilter = 'pending' | 'active' | 'closed' | 'cancelled' | 'all';

export const FILTERS: { key: BetFilter; label: string; description: string }[] = [
  { key: 'all', label: 'All', description: 'Every bet, newest first, with its live status and score' },
  { key: 'active', label: 'Active', description: 'Accepted bets in play' },
  { key: 'pending', label: 'Pending', description: 'Proposed bets awaiting accept, decline, or cancel' },
  { key: 'closed', label: 'Closed', description: 'Settled (won/lost), refunded, or declined' },
  { key: 'cancelled', label: 'Cancelled', description: 'Bets called off before they played' },
];

const ACTIVE_STATUSES: WagerStatus[] = ['accepted', 'completed'];
const CLOSED_STATUSES: WagerStatus[] = ['settled', 'declined', 'refunded'];

export function filterWagers(wagers: Wager[], filter: BetFilter): Wager[] {
  const picked =
    filter === 'pending' ? wagers.filter((w) => w.status === 'open')
    : filter === 'active' ? wagers.filter((w) => ACTIVE_STATUSES.includes(w.status))
    : filter === 'closed' ? wagers.filter((w) => CLOSED_STATUSES.includes(w.status))
    : filter === 'cancelled' ? wagers.filter((w) => w.status === 'cancelled')
    : wagers;
  // Sort by the GAME date (event start), most recent / upcoming first — not by
  // when the bet was placed. Unknown start times sort last.
  return [...picked].sort(
    (a, b) => new Date(b.start_time ?? 0).getTime() - new Date(a.start_time ?? 0).getTime(),
  );
}
