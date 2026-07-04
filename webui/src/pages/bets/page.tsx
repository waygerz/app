import { useMemo } from 'react';
import { Link, NavLink, Navigate, Outlet, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ticket } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { leaguesApi } from '@/lib/leagues';
import { wagersApi, type Wager, type WagerStatus } from '@/lib/wagers';
import { formatCredits } from '@/lib/wallet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type BetFilter = 'pending' | 'active' | 'closed';

const FILTERS: { key: BetFilter; label: string; description: string }[] = [
  { key: 'pending', label: 'Pending', description: 'Proposed bets awaiting accept, decline, or cancel' },
  { key: 'active', label: 'Active', description: 'Accepted bets in play' },
  { key: 'closed', label: 'Closed', description: 'Settled, declined, cancelled, or refunded' },
];

const CLOSED_STATUSES: WagerStatus[] = ['settled', 'declined', 'cancelled', 'refunded'];

export function filterWagers(wagers: Wager[], filter: BetFilter, me: string): Wager[] {
  switch (filter) {
    case 'pending':
      return wagers.filter((w) => w.status === 'open');
    case 'active':
      return wagers.filter((w) => w.status === 'accepted');
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

function WagerRow({
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
          to={`/leagues/${w.league_id}/play`}
          className="text-xs text-primary hover:underline"
        >
          View in league
        </Link>
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div>}
    </Card>
  );
}

export function BetsLayout() {
  const { data: wagers = [] } = useQuery({
    queryKey: ['wagers-all'],
    queryFn: () => wagersApi.all(),
  });
  const { user } = useAuth();
  const me = user?.id ?? '';

  const counts = useMemo(() => {
    const out = {} as Record<BetFilter, number>;
    for (const f of FILTERS) out[f.key] = filterWagers(wagers, f.key, me).length;
    return out;
  }, [wagers, me]);

  return (
    <div className="container min-w-0 w-full py-8">
      <div className="mb-6 flex items-center gap-3">
        <Ticket className="size-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Bets</h1>
          <p className="text-sm text-muted-foreground">Head-to-head wagers across all your leagues</p>
        </div>
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-input bg-background p-1.5">
        {FILTERS.map((f) => (
          <NavLink
            key={f.key}
            to={`/bets/${f.key}`}
            className={({ isActive }) =>
              cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'text-muted-foreground hover:bg-muted hover:text-foreground',
                isActive && 'bg-muted text-foreground',
              )
            }
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span className="ms-1.5 text-xs text-muted-foreground">({counts[f.key]})</span>
            )}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}

export function BetsIndex() {
  return <Navigate to="/bets/pending" replace />;
}

export function BetsView() {
  const { filter = 'pending' } = useParams<{ filter: string }>();
  const activeFilter: BetFilter =
    filter === 'open' ? 'pending' : FILTERS.some((f) => f.key === filter) ? (filter as BetFilter) : 'pending';
  const meta = FILTERS.find((f) => f.key === activeFilter)!;

  const qc = useQueryClient();
  const { user } = useAuth();
  const me = user?.id ?? '';

  const wagersQ = useQuery({ queryKey: ['wagers-all'], queryFn: () => wagersApi.all() });
  const leaguesQ = useQuery({ queryKey: ['leagues'], queryFn: leaguesApi.list });

  const leagueNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const lg of leaguesQ.data ?? []) m.set(lg.id, lg.name);
    return m;
  }, [leaguesQ.data]);

  const rows = useMemo(
    () => filterWagers(wagersQ.data ?? [], activeFilter, me),
    [wagersQ.data, activeFilter, me],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['wagers-all'] });
    qc.invalidateQueries({ queryKey: ['wagers'] });
  };
  const onErr = (e: Error) => toast.error(e.message);

  const acceptM = useMutation({
    mutationFn: (id: string) => wagersApi.accept(id),
    onSuccess: () => { toast.success('Bet accepted'); refresh(); },
    onError: onErr,
  });
  const declineM = useMutation({
    mutationFn: (id: string) => wagersApi.decline(id),
    onSuccess: () => { toast.success('Bet declined'); refresh(); },
    onError: onErr,
  });
  const cancelM = useMutation({
    mutationFn: (id: string) => wagersApi.cancel(id),
    onSuccess: () => { toast.success('Bet cancelled'); refresh(); },
    onError: onErr,
  });

  function actionsFor(w: Wager) {
    if (activeFilter !== 'pending' || w.status !== 'open') return null;
    if (w.acceptor_id === me) {
      return (
        <>
          <Button size="sm" disabled={acceptM.isPending} onClick={() => acceptM.mutate(w.id)}>Accept</Button>
          <Button size="sm" variant="outline" disabled={declineM.isPending} onClick={() => declineM.mutate(w.id)}>Decline</Button>
        </>
      );
    }
    if (w.proposer_id === me) {
      return (
        <Button size="sm" variant="outline" disabled={cancelM.isPending} onClick={() => cancelM.mutate(w.id)}>Cancel</Button>
      );
    }
    return null;
  }

  if (filter === 'open' || !FILTERS.some((f) => f.key === filter)) {
    return <Navigate to={`/bets/${activeFilter}`} replace />;
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">{meta.description}</p>

      {wagersQ.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}

      {!wagersQ.isLoading && rows.length === 0 && (
        <Card className="items-center gap-2 p-8 text-center">
          <Ticket className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No {meta.label.toLowerCase()} bets.</p>
          {activeFilter === 'pending' && (
            <>
              <p className="text-xs text-muted-foreground">Incoming and outgoing proposals show up here.</p>
              <Link to="/" className="text-sm text-primary hover:underline">Browse leagues to place a bet</Link>
            </>
          )}
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((w) => (
          <WagerRow
            key={w.id}
            w={w}
            me={me}
            leagueName={leagueNames.get(w.league_id)}
            actions={actionsFor(w)}
          />
        ))}
      </div>
    </div>
  );
}