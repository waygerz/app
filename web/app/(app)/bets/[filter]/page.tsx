'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { redirect, useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ticket } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { leaguesApi } from '@/lib/leagues';
import { cancelLocked, groupWagers, wagersApi, type WagerGroup } from '@/lib/wagers';
import { fetchEvent, type SportEvent } from '@/lib/ingestor';
import { CenterCard } from '@/components/ui/center-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FILTERS, filterWagers, type BetFilter } from '../bets-common';
import { WagerBetCard } from '@/app/(app)/leagues/[id]/sections';
import { ListSearch } from '@/components/list-search';

type SortKey = 'date-desc' | 'date-asc' | 'stake-desc';

export default function BetsView() {
  const { filter = 'all' } = useParams<{ filter: string }>();
  const activeFilter: BetFilter =
    filter === 'open' ? 'pending' : FILTERS.some((f) => f.key === filter) ? (filter as BetFilter) : 'all';
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
    () => filterWagers(wagersQ.data ?? [], activeFilter),
    [wagersQ.data, activeFilter],
  );

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('date-desc');

  // Group siblings, then apply the client-side search (team / opponent / league)
  // and the chosen sort. Search and sort operate on the current filter's bets.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    let gs = groupWagers(rows, me);
    if (q) {
      gs = gs.filter((g) =>
        [g.rep.home_team, g.rep.away_team, leagueNames.get(g.rep.league_id) ?? '',
          ...g.opponents.map((o) => o.name)]
          .join(' ').toLowerCase().includes(q),
      );
    }
    const start = (g: WagerGroup) => new Date(g.rep.start_time ?? 0).getTime();
    return [...gs].sort((a, b) =>
      sort === 'stake-desc' ? b.rep.amount_cents - a.rep.amount_cents
      : sort === 'date-asc' ? start(a) - start(b)
      : start(b) - start(a),
    );
  }, [rows, me, query, sort, leagueNames]);

  // Events behind the bets, for the live/final score line. Keyed on the full
  // wager set (not the filtered rows) so switching tabs reuses the same cache.
  const eventIds = useMemo(
    () => Array.from(new Set((wagersQ.data ?? []).map((w) => w.event_id))),
    [wagersQ.data],
  );
  const eventsQ = useQuery({
    queryKey: ['bet-events', [...eventIds].sort().join(',')],
    queryFn: async () => {
      const map: Record<string, SportEvent> = {};
      await Promise.all(
        eventIds.map(async (id) => {
          const ev = await fetchEvent(id);
          if (ev) map[id] = ev;
        }),
      );
      return map;
    },
    enabled: eventIds.length > 0,
    staleTime: 5 * 60_000,
    // Poll only while a game is live; the ingestor refreshes those every 60s.
    refetchInterval: (query) =>
      Object.values(query.state.data ?? {}).some((e) => e.status === 'live') ? 30_000 : false,
  });
  const eventMap = eventsQ.data ?? {};

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['wagers-all'] });
    qc.invalidateQueries({ queryKey: ['wagers'] });
  };
  const onErr = (e: Error) => toast.error(e.message);

  // A card can stand for several siblings (the same bet offered to a few
  // friends), so each action runs across the whole group's ids at once.
  const acceptM = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(wagersApi.accept)),
    onSuccess: () => { toast.success('Bet accepted'); refresh(); },
    onError: onErr,
  });
  const declineM = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(wagersApi.decline)),
    onSuccess: () => { toast.success('Bet declined'); refresh(); },
    onError: onErr,
  });
  const cancelM = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(wagersApi.cancel)),
    onSuccess: () => { toast.success('Bet cancelled'); refresh(); },
    onError: onErr,
  });
  const confirmM = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => wagersApi.confirm(id))),
    onSuccess: () => { toast.success('Result confirmed — you got paid'); refresh(); },
    onError: onErr,
  });
  const reqCancelM = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(wagersApi.requestCancel)),
    onSuccess: () => { toast.success('Cancel requested — waiting on your opponent'); refresh(); },
    onError: onErr,
  });
  const approveCancelM = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(wagersApi.approveCancel)),
    onSuccess: () => { toast.success('Bet cancelled — both stakes refunded'); refresh(); },
    onError: onErr,
  });
  const rejectCancelM = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(wagersApi.rejectCancel)),
    onSuccess: () => { toast.success('Cancel request declined — the bet stands'); refresh(); },
    onError: onErr,
  });

  // The status badge on the card carries the state, so the buttons in the
  // compact action column stay terse.
  function actionsFor(g: WagerGroup) {
    const w = g.rep;
    const ids = g.wagers.map((x) => x.id);
    if (w.status === 'completed' && (w.proposer_id === me || w.acceptor_id === me)) {
      // Score-decided winner: only the winner claims; everyone else sees no
      // button (the badge carries the result).
      if (w.winner_user_id === me) {
        return (
          <Button size="sm" className="h-9 w-full" disabled={confirmM.isPending} onClick={() => confirmM.mutate(ids)}>
            Confirm
          </Button>
        );
      }
      return null;
    }
    // Accepted wagers hold both stakes, so calling one off takes both sides:
    // one requests, the other approves. Locks 10 minutes before kickoff.
    if (w.status === 'accepted' && (w.proposer_id === me || w.acceptor_id === me)) {
      if (cancelLocked(w)) {
        // Game started — no action; the row's status badge carries the state.
        return null;
      }
      if (!w.cancel_requested_by) {
        return (
          <Button size="sm" variant="outline" className="h-9 w-full" disabled={reqCancelM.isPending} onClick={() => reqCancelM.mutate(ids)}>
            Cancel
          </Button>
        );
      }
      if (w.cancel_requested_by === me) {
        return <span className="text-center text-[11px] text-muted-foreground">Requested</span>;
      }
      return (
        <>
          <Button size="sm" className="h-9 w-full" disabled={approveCancelM.isPending} onClick={() => approveCancelM.mutate(ids)}>Approve</Button>
          <Button size="sm" variant="ghost" className="h-9 w-full" disabled={rejectCancelM.isPending} onClick={() => rejectCancelM.mutate(ids)}>Reject</Button>
        </>
      );
    }
    if (w.status !== 'open') return null;
    if (w.acceptor_id === me) {
      return (
        <>
          <Button size="sm" className="h-9 w-full" disabled={acceptM.isPending} onClick={() => acceptM.mutate(ids)}>Accept</Button>
          <Button size="sm" variant="outline" className="h-9 w-full" disabled={declineM.isPending} onClick={() => declineM.mutate(ids)}>Decline</Button>
        </>
      );
    }
    if (w.proposer_id === me) {
      if (cancelLocked(w)) {
        // Game started — no action; the row's status badge carries the state.
        return null;
      }
      return (
        <Button size="sm" variant="outline" className="h-9 w-full" disabled={cancelM.isPending} onClick={() => cancelM.mutate(ids)}>Cancel</Button>
      );
    }
    return null;
  }

  // Normalize legacy/invalid filters in the URL (replaces <Navigate replace />).
  if (filter === 'open' || !FILTERS.some((f) => f.key === filter)) {
    redirect(`/bets/${activeFilter}`);
  }

  return (
    <div>
      {!wagersQ.isLoading && (rows.length > 0 || query.trim()) && (
        <div className="mb-4 flex items-center gap-2">
          <ListSearch value={query} onChange={setQuery} placeholder="Search teams, opponents, leagues" className="flex-1" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort bets"
            className="h-11 shrink-0 rounded-xl border border-input bg-background px-2.5 text-sm text-foreground sm:h-10"
          >
            <option value="date-desc">Newest game</option>
            <option value="date-asc">Oldest game</option>
            <option value="stake-desc">Biggest stake</option>
          </select>
        </div>
      )}

      {wagersQ.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}

      {!wagersQ.isLoading && groups.length === 0 && (
        <CenterCard>
          <Ticket className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {query.trim()
              ? `No bets match “${query.trim()}”.`
              : activeFilter === 'all' ? 'No bets yet.' : `No ${meta.label.toLowerCase()} bets.`}
          </p>
          {activeFilter === 'pending' && !query.trim() && (
            <>
              <p className="text-xs text-muted-foreground">Incoming and outgoing proposals show up here.</p>
              <Link href="/" className="text-sm text-primary hover:underline">Browse leagues to place a bet</Link>
            </>
          )}
        </CenterCard>
      )}

      {/* One continuous list for the current filter, searched + sorted; each
          card's own status badge carries its state. */}
      {groups.length > 0 && (
        <div>
          {groups.map((g) => (
            <WagerBetCard
              key={g.key}
              group={g}
              me={me}
              leagueName={leagueNames.get(g.rep.league_id)}
              ev={eventMap[g.rep.event_id]}
              actions={actionsFor(g)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
