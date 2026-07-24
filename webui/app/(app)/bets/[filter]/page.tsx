'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { redirect, useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ticket } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { leaguesApi } from '@/lib/leagues';
import { cancelLocked, wagersApi, type Wager, type WagerResult } from '@/lib/wagers';
import { fetchEvent, type SportEvent } from '@/lib/ingestor';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FILTERS, filterWagers, type BetFilter } from '../bets-common';
import { WagerBetCard } from '@/app/(app)/leagues/[id]/sections';

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
    () => filterWagers(wagersQ.data ?? [], activeFilter, me),
    [wagersQ.data, activeFilter, me],
  );

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
  const confirmM = useMutation({
    mutationFn: ({ id, result }: { id: string; result: WagerResult }) => wagersApi.confirm(id, result),
    onSuccess: (_d, v) => {
      toast.success(v.result === 'draw' ? 'Called a draw' : 'Result confirmed');
      refresh();
    },
    onError: onErr,
  });
  const reqCancelM = useMutation({
    mutationFn: (id: string) => wagersApi.requestCancel(id),
    onSuccess: () => { toast.success('Cancel requested — waiting on your opponent'); refresh(); },
    onError: onErr,
  });
  const approveCancelM = useMutation({
    mutationFn: (id: string) => wagersApi.approveCancel(id),
    onSuccess: () => { toast.success('Bet cancelled — both stakes refunded'); refresh(); },
    onError: onErr,
  });
  const rejectCancelM = useMutation({
    mutationFn: (id: string) => wagersApi.rejectCancel(id),
    onSuccess: () => { toast.success('Cancel request declined — the bet stands'); refresh(); },
    onError: onErr,
  });

  function actionsFor(w: Wager) {
    if (w.status === 'completed' && (w.proposer_id === me || w.acceptor_id === me)) {
      // Score-decided winner: only the winner claims; the loser just waits.
      if (w.winner_user_id) {
        if (w.winner_user_id === me) {
          return (
            <Button size="sm" disabled={confirmM.isPending} onClick={() => confirmM.mutate({ id: w.id, result: 'won' })}>
              Confirm &amp; get paid
            </Button>
          );
        }
        return <span className="text-xs text-muted-foreground">You lost — awaiting payout</span>;
      }
      // Fallback: result couldn't be read from a score — settle by hand.
      return (
        <>
          <Button size="sm" variant="outline" disabled={confirmM.isPending} title="Concede — pays your opponent" onClick={() => confirmM.mutate({ id: w.id, result: 'lost' })}>I lost</Button>
          <Button size="sm" variant="ghost" disabled={confirmM.isPending} onClick={() => confirmM.mutate({ id: w.id, result: 'draw' })}>Draw</Button>
        </>
      );
    }
    // Accepted wagers hold both stakes, so calling one off takes both sides:
    // one requests, the other approves. Locks 10 minutes before kickoff.
    if (w.status === 'accepted' && (w.proposer_id === me || w.acceptor_id === me)) {
      if (cancelLocked(w)) {
        return <span className="text-xs text-muted-foreground">Too close to start to cancel</span>;
      }
      if (!w.cancel_requested_by) {
        return (
          <Button size="sm" variant="outline" disabled={reqCancelM.isPending} onClick={() => reqCancelM.mutate(w.id)}>
            Request cancel
          </Button>
        );
      }
      if (w.cancel_requested_by === me) {
        return <span className="text-xs text-muted-foreground">Cancel requested — waiting on your opponent</span>;
      }
      return (
        <>
          <Button size="sm" disabled={approveCancelM.isPending} onClick={() => approveCancelM.mutate(w.id)}>Approve cancel</Button>
          <Button size="sm" variant="ghost" disabled={rejectCancelM.isPending} onClick={() => rejectCancelM.mutate(w.id)}>Reject</Button>
        </>
      );
    }
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
      if (cancelLocked(w)) {
        return <span className="text-xs text-muted-foreground">Too close to start to cancel</span>;
      }
      return (
        <Button size="sm" variant="outline" disabled={cancelM.isPending} onClick={() => cancelM.mutate(w.id)}>Cancel</Button>
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
      {wagersQ.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}

      {!wagersQ.isLoading && rows.length === 0 && (
        <Card className="items-center gap-2 p-8 text-center">
          <Ticket className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {activeFilter === 'all' ? 'No bets yet.' : `No ${meta.label.toLowerCase()} bets.`}
          </p>
          {activeFilter === 'pending' && (
            <>
              <p className="text-xs text-muted-foreground">Incoming and outgoing proposals show up here.</p>
              <Link href="/" className="text-sm text-primary hover:underline">Browse leagues to place a bet</Link>
            </>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rows.map((w) => (
          <WagerBetCard
            key={w.id}
            w={w}
            me={me}
            leagueName={leagueNames.get(w.league_id)}
            ev={eventMap[w.event_id]}
            accentClass="border-l-border"
            actions={actionsFor(w)}
          />
        ))}
      </div>
    </div>
  );
}
