'use client';

import { type Wager, type WagerStatus } from '@/lib/wagers';

export type BetFilter = 'pending' | 'active' | 'closed' | 'all';

export const FILTERS: { key: BetFilter; label: string; description: string }[] = [
  { key: 'all', label: 'All', description: 'Every bet, newest first, with its live status and score' },
  { key: 'active', label: 'Active', description: 'Accepted bets in play, plus finished bets waiting on a result' },
  { key: 'pending', label: 'Pending', description: 'Proposed bets awaiting accept, decline, or cancel' },
  { key: 'closed', label: 'Closed', description: 'Settled, declined, cancelled, or refunded' },
];

const ACTIVE_STATUSES: WagerStatus[] = ['accepted', 'completed'];
const CLOSED_STATUSES: WagerStatus[] = ['settled', 'declined', 'cancelled', 'refunded'];

export function filterWagers(wagers: Wager[], filter: BetFilter): Wager[] {
  switch (filter) {
    case 'pending':
      return wagers.filter((w) => w.status === 'open');
    case 'active':
      return wagers.filter((w) => ACTIVE_STATUSES.includes(w.status));
    case 'closed':
      return wagers.filter((w) => CLOSED_STATUSES.includes(w.status));
    case 'all':
      return [...wagers].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    default:
      return wagers;
  }
}
