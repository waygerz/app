'use client';

import Link from 'next/link';
import { type Wager, type WagerStatus } from '@/lib/wagers';
import { formatCredits } from '@/lib/wallet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export type BetFilter = 'pending' | 'active' | 'closed';

export const FILTERS: { key: BetFilter; label: string; description: string }[] = [
  { key: 'pending', label: 'Pending', description: 'Proposed bets awaiting accept, decline, or cancel' },
  { key: 'active', label: 'Active', description: 'Accepted bets in play, plus finished bets waiting on a result' },
  { key: 'closed', label: 'Closed', description: 'Settled, declined, cancelled, or refunded' },
];

const ACTIVE_STATUSES: WagerStatus[] = ['accepted', 'completed'];
const CLOSED_STATUSES: WagerStatus[] = ['settled', 'declined', 'cancelled', 'refunded'];

export function filterWagers(wagers: Wager[], filter: BetFilter, me: string): Wager[] {
  switch (filter) {
    case 'pending':
      return wagers.filter((w) => w.status === 'open');
    case 'active':
      return wagers.filter((w) => ACTIVE_STATUSES.includes(w.status));
    case 'closed':
      return wagers.filter((w) => CLOSED_STATUSES.includes(w.status));
    default:
      return wagers;
  }
}

function statusBadge(w: Wager, me: string) {
  if (w.status === 'open' && w.acceptor_id === me) {
    return <Badge size="sm" variant="warning" appearance="light">Needs response</Badge>;
  }
  if (w.status === 'open') {
    return <Badge size="sm" variant="warning" appearance="light">Awaiting</Badge>;
  }
  if (w.status === 'accepted') {
    return <Badge size="sm" variant="info" appearance="light">Active</Badge>;
  }
  if (w.status === 'completed') {
    return <Badge size="sm" variant="warning" appearance="light">Confirm result</Badge>;
  }
  if (w.status === 'settled') {
    const won = w.winner_user_id === me;
    return (
      <Badge size="sm" variant={won ? 'success' : 'destructive'} appearance="light">
        {won ? 'Won' : 'Lost'}
      </Badge>
    );
  }
  if (w.status === 'refunded') {
    return <Badge size="sm" variant="secondary" appearance="light">Push</Badge>;
  }
  if (w.status === 'declined') {
    return <Badge size="sm" variant="secondary" appearance="light">Declined</Badge>;
  }
  if (w.status === 'cancelled') {
    return <Badge size="sm" variant="secondary" appearance="light">Cancelled</Badge>;
  }
  return null;
}

export function WagerRow({
  w,
  me,
  leagueName,
  actions,
}: {
  w: Wager;
  me: string;
  leagueName?: string;
  actions?: React.ReactNode;
}) {
  const iAmProposer = w.proposer_id === me;
  const mySide = iAmProposer ? w.proposer_side : w.acceptor_side;
  const myTeam = mySide === 'home' ? w.home_team : w.away_team;
  const opponent = iAmProposer ? w.acceptor_name : w.proposer_name;

  return (
    <Card className="flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{w.event_name}</span>
          {statusBadge(w, me)}
        </div>
        <p className="text-xs text-muted-foreground">
          {leagueName && <span className="font-medium text-foreground/80">{leagueName} · </span>}
          vs {opponent} · backing {myTeam} · {formatCredits(w.amount_cents)}
        </p>
        <Link
          href={`/leagues/${w.league_id}/play`}
          className="text-xs text-primary hover:underline"
        >
          View in league
        </Link>
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div>}
    </Card>
  );
}
