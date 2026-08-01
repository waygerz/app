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
  switch (filter) {
    case 'pending':
      return wagers.filter((w) => w.status === 'open');
    case 'active':
      return wagers.filter((w) => ACTIVE_STATUSES.includes(w.status));
    case 'closed':
      return wagers.filter((w) => CLOSED_STATUSES.includes(w.status));
    case 'cancelled':
      return wagers.filter((w) => w.status === 'cancelled');
    case 'all':
      return [...wagers].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    default:
      return wagers;
  }
}
