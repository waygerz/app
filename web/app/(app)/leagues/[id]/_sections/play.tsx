'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeague } from '../league-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { groupByKickoff, leaguesApi, shortPeriodLabel, type LeagueDetail, type LeaguePeriod, type PickRow } from '@/lib/leagues';
import { cancelLocked, groupWagers, wagersApi, type WagerGroup } from '@/lib/wagers';
import { FILTERS, filterWagers, type BetFilter } from '@/app/(app)/bets/bets-common';
import { BetSortMenu, sortGroups, type SortKey } from '@/components/bet-sort-menu';
import { CounterButton } from '@/components/counter-dialog';
import { fetchPeriodEvents, fetchEvent, type SportEvent } from '@/lib/ingestor';
import { useAuth } from '@/auth/AuthContext';
import { useNow } from '@/hooks/use-now';
import { TeamLogo, formatStart } from '@/components/event-card';
import { WeekChips } from '@/components/week-chips';
import { SectionTitle } from '@/components/section-title';
import { CenterCard } from '@/components/ui/center-card';
import { ListSearch } from '@/components/list-search';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CalendarDays, Check } from 'lucide-react';
import { WagerBetCard } from './wager-card';

// ===================== PLAY (type-aware) =====================
export function LeaguePlay() {
  const lg = useLeague();
  if (lg.status !== 'active') {
    return <CenterCard><p className="text-sm text-muted-foreground">This league isn’t active yet.</p></CenterCard>;
  }
  if (lg.league_type === 'pickem') return <PickemPlay lg={lg} />;
  return <HeadToHeadPlay lg={lg} />;
}

// ---- Pick'em ----
// The point spread for one side of a game, from the odds persisted on the event.
// spread.line is the home team's number, so the away side is its inverse; an even
// game reads "EVEN". Null when the game has no spread (e.g. odds not posted yet).
function sideSpread(ev: SportEvent, side: 'home' | 'away'): string | null {
  const sp = ev.odds?.spread;
  if (!sp) return null;
  const line = side === 'home' ? sp.line : -sp.line;
  if (line === 0) return 'EVEN';
  return line > 0 ? `+${line}` : `${line}`;
}

function PickemPlay({ lg }: { lg: LeagueDetail }) {
  const qc = useQueryClient();
  const isCommish = lg.my_role === 'commissioner';
  const sportLeagueIds = lg.sports.map((s) => s.sport_league_id);

  const periodsQ = useQuery({ queryKey: ['periods', lg.id], queryFn: () => leaguesApi.periods(lg.id) });
  const periods: LeaguePeriod[] = [...(periodsQ.data ?? [])].sort((a, b) => a.index - b.index);

  // Default to the open week (this week's picks), else the latest.
  const openPeriod = periods.find((p) => p.status === 'open') ?? null;
  const [periodId, setPeriodId] = useState('');
  const selectedId = periodId || openPeriod?.id || periods[periods.length - 1]?.id || '';
  const period = periods.find((p) => p.id === selectedId) ?? null;

  // Only the selected week's games (not the whole upcoming list).
  const events = useQuery({
    queryKey: ['period-events', lg.id, selectedId],
    queryFn: () => fetchPeriodEvents(sportLeagueIds, period?.starts_at, period?.ends_at),
    enabled: !!period && sportLeagueIds.length > 0,
  });
  const existing = useQuery({
    queryKey: ['picks', lg.id, selectedId],
    queryFn: () => leaguesApi.getPicks(lg.id, selectedId),
    enabled: !!selectedId,
  });

  const [sel, setSel] = useState<Record<string, 'home' | 'away'>>({});
  const [tiebreaker, setTiebreaker] = useState('');
  // The save bar's "no tie-breaker" jumps here.
  const tbRef = useRef<HTMLInputElement>(null);
  // Drop local edits when switching weeks.
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setSel({});
    setTiebreaker('');
  }
  const now = useNow();

  const regen = useMutation({
    mutationFn: () => leaguesApi.regeneratePeriods(lg.id),
    onSuccess: () => { toast.success('Schedule synced'); qc.invalidateQueries({ queryKey: ['periods', lg.id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const graded = new Map((existing.data ?? []).map((p: PickRow) => [p.event_id, p]));
  const pick = (eid: string) => sel[eid] ?? graded.get(eid)?.pick_side;

  const evs = events.data ?? [];
  // The tie-breaker lives on the week's last game (latest start time).
  const lastGame = evs.reduce<SportEvent | null>((latest, e) => {
    const t = new Date(e.start_time ?? 0).getTime();
    if (isNaN(t)) return latest;
    return !latest || t > new Date(latest.start_time ?? 0).getTime() ? e : latest;
  }, null);
  const lastGameId = lastGame?.external_id ?? null;
  const existingTb = lastGameId ? graded.get(lastGameId)?.tiebreaker_total ?? null : null;

  // Prefill the saved tie-breaker whenever it loads or changes (null start so an
  // already-cached value still prefills on mount).
  const [prevExistingTb, setPrevExistingTb] = useState<number | null>(null);
  if (existingTb !== prevExistingTb) {
    setPrevExistingTb(existingTb);
    if (existingTb != null) setTiebreaker(String(existingTb));
  }

  const save = useMutation({
    mutationFn: () => {
      const picks: { event_id: string; side: 'home' | 'away'; tiebreaker_total?: number }[] =
        Object.entries(sel).map(([event_id, side]) => ({ event_id, side }));
      if (lastGameId && tiebreaker !== '') {
        const tb = Math.max(0, Math.round(Number(tiebreaker)));
        const side = sel[lastGameId] ?? graded.get(lastGameId)?.pick_side;
        const found = picks.find((p) => p.event_id === lastGameId);
        if (found) found.tiebreaker_total = tb;
        else if (side) picks.push({ event_id: lastGameId, side, tiebreaker_total: tb });
      }
      return leaguesApi.submitPicks(lg.id, selectedId, picks);
    },
    onSuccess: () => {
      toast.success('Picks saved');
      setSel({});
      qc.invalidateQueries({ queryKey: ['picks', lg.id, selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (periodsQ.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (periods.length === 0) {
    return (
      <CenterCard>
        <p className="text-sm text-muted-foreground">No weeks scheduled yet.</p>
        {isCommish && (
          <Button size="sm" variant="outline" disabled={regen.isPending} onClick={() => regen.mutate()}>
            {regen.isPending ? 'Syncing…' : 'Sync schedule'}
          </Button>
        )}
      </CenterCard>
    );
  }

  // Only the open week is editable; other weeks are read-only (preview / results).
  const editable = period?.status === 'open';
  // Picks lock 1 hour before the first game of the week kicks off.
  const startTimes = evs
    .map((e) => e.start_time)
    .filter((s): s is string => !!s)
    .map((s) => new Date(s).getTime())
    .filter((t) => !isNaN(t));
  const firstStart = startTimes.length ? Math.min(...startTimes) : null;
  const lockAt = firstStart !== null ? firstStart - 60 * 60 * 1000 : null;
  const picksLocked = lockAt !== null && now >= lockAt;
  const canEdit = !!editable && !picksLocked;
  const unsaved = Object.keys(sel).length;
  const tbDirty = tiebreaker !== '' && (existingTb === null || Number(tiebreaker) !== existingTb);
  const hasChanges = unsaved > 0 || tbDirty;
  const pickedCount = evs.filter((e) => pick(e.external_id)).length;
  const tbMissing = !!lastGameId && tiebreaker === '';
  const tbHint = lastGame?.odds?.overUnder?.total;
  const jumpToTiebreaker = () => {
    tbRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => tbRef.current?.focus({ preventScroll: true }), 300);
  };

  return (
    <div className="flex flex-col gap-4 pb-24">
      <WeekChips
        weeks={periods.map((p) => ({ value: p.id, label: shortPeriodLabel(p.label), title: p.label }))}
        value={selectedId}
        onChange={setPeriodId}
      />

      <SectionTitle
        title={`${editable ? 'Make your Picks' : 'Picks'} · ${period?.label ?? ''}`}
        subtitle={
          editable
            ? lockAt !== null
              ? picksLocked
                ? 'Picks are locked — the first game is about to start.'
                : `${pickedCount}/${evs.length} picked · locks ${formatStart(new Date(lockAt).toISOString())}`
              : undefined
            : period?.status === 'upcoming'
              ? 'This week hasn’t opened yet — preview only.'
              : 'This week is closed.'
        }
      />

      {events.isLoading && <Skeleton className="h-24 rounded-xl" />}
      {!events.isLoading && evs.length === 0 && (
        <p className="text-sm text-muted-foreground">No games scheduled for this week.</p>
      )}

      {/* Games under kickoff headers; each game is its two team rows + spread. */}
      <div className="flex flex-col gap-4">
        {groupByKickoff(evs, (e) => e.start_time).map((grp) => (
          <section key={grp.key} className="flex flex-col gap-3">
            <h3 className="flex items-baseline justify-between px-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>{grp.day}</span>
              <span className="normal-case tracking-normal">{grp.time}</span>
            </h3>
            {grp.items.map((ev) => {
              const g = graded.get(ev.external_id);
              const gradedLock = !!(g && g.correct !== null);
              const disabled = gradedLock || !canEdit;
              const cur = pick(ev.external_id);
              return (
                <div key={ev.external_id} className="flex flex-col gap-1.5">
                  {gradedLock && (
                    <div className="flex justify-end px-0.5">
                      <Badge size="sm" appearance="light" variant={g!.correct ? 'success' : 'destructive'}>
                        {g!.correct ? '✓ correct' : '✗ wrong'}
                      </Badge>
                    </div>
                  )}
                  {(['away', 'home'] as const).map((side) => {
                    const isHome = side === 'home';
                    const teamName = isHome ? ev.home_team : ev.away_team;
                    const teamAbbr = isHome ? ev.home_abbr : ev.away_abbr;
                    const teamLogo = isHome ? ev.home_logo : ev.away_logo;
                    const active = cur === side;
                    const isMyPick = gradedLock && g!.pick_side === side;
                    const picked = active || isMyPick;
                    const spread = sideSpread(ev, side);
                    // Tinted fill by state: green correct / red wrong once graded, blue
                    // for the current selection, neutral otherwise (like the bet board).
                    const tone = isMyPick
                      ? (g!.correct ? 'bg-brand/20' : 'bg-destructive/20')
                      : active ? 'bg-blue-500/20' : 'bg-muted/60';
                    return (
                      <div key={side} className="grid grid-cols-[minmax(0,1fr)_3.75rem] gap-1.5">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setSel((s) => ({ ...s, [ev.external_id]: side }))}
                          className={cn(
                            'flex h-12 items-center gap-2.5 rounded-md px-2.5 text-left text-foreground transition',
                            tone,
                            disabled ? 'cursor-not-allowed' : 'hover:brightness-110',
                            disabled && !picked && 'opacity-60',
                          )}
                        >
                          <TeamLogo src={teamLogo} name={teamAbbr || teamName} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{teamName}</span>
                          {picked && <Check className="size-4 shrink-0 text-foreground/70" />}
                        </button>
                        <div className="flex h-12 items-center justify-center rounded-md bg-muted/60 text-xs font-semibold tabular-nums text-muted-foreground">
                          {spread || '—'}
                        </div>
                      </div>
                    );
                  })}
                  {/* The tie-breaker: a row in the same shading as the teams, so it
                      reads as part of the pick; the 🎯 and number box set it apart. */}
                  {ev.external_id === lastGameId && (
                    <label className="flex h-15 items-center gap-2.5 rounded-md bg-muted/60 ps-2.5 pe-2">
                      {/* Sized and placed like the team logos above it. */}
                      <span className="flex size-8 shrink-0 items-center justify-center text-[26px] leading-none" aria-hidden>🎯</span>
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="text-sm font-semibold text-foreground">Tie-breaker</span>
                        <span className="text-xs text-muted-foreground">Total points</span>
                      </span>
                      <Input
                        ref={tbRef}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={tiebreaker}
                        onChange={(e) => setTiebreaker(e.target.value)}
                        disabled={disabled}
                        placeholder={tbHint != null ? String(tbHint) : '48'}
                        aria-label="Tie-breaker: total points"
                        className="h-11 w-20 text-center text-lg font-bold tabular-nums"
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {/* Save bar pinned to the bottom of the page (open week only) */}
      {evs.length > 0 && editable && (
        <div className="app-column fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-20 border-t border-border bg-background/95 backdrop-blur-sm lg:bottom-0">
          <div className="container flex items-center justify-between gap-3 py-3">
            <span className="text-xs text-muted-foreground">
              {picksLocked
                ? 'Picks are locked for this week.'
                : hasChanges
                  ? `${unsaved} unsaved pick${unsaved === 1 ? '' : 's'}${tbDirty ? ' + tie-breaker' : ''}`
                  : 'Tap a team to make a pick.'}
              {!picksLocked && tbMissing && (
                <>
                  {' · '}
                  <button type="button" onClick={jumpToTiebreaker} className="font-semibold text-amber-600 dark:text-amber-400">
                    🎯 no tie-breaker ↓
                  </button>
                </>
              )}
            </span>
            <Button size="lg" className="h-11 shrink-0" disabled={save.isPending || picksLocked || !hasChanges} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save picks'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Head-to-head: "My Bets" — games you've bet against friends. Placing a
// bet now happens from the Schedule tab (tap a game), so this is the list view.
function HeadToHeadPlay({ lg }: { lg: LeagueDetail }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const me = user?.id;
  const bets = useQuery({ queryKey: ['wagers', lg.id], queryFn: () => wagersApi.mine(lg.id) });

  const canBet = lg.status === 'active';

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['wagers', lg.id] });
    qc.invalidateQueries({ queryKey: ['wagers-all'] });
  };
  const onErr = (e: Error) => toast.error(e.message);
  // A card can stand for several siblings (same bet offered to a few friends),
  // so every action runs across the group's ids at once.
  const acceptM = useMutation({ mutationFn: (ids: string[]) => Promise.all(ids.map(wagersApi.accept)), onSuccess: refresh, onError: onErr });
  const declineM = useMutation({ mutationFn: (ids: string[]) => Promise.all(ids.map(wagersApi.decline)), onSuccess: refresh, onError: onErr });
  const cancelM = useMutation({ mutationFn: (ids: string[]) => Promise.all(ids.map(wagersApi.cancel)), onSuccess: refresh, onError: onErr });
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
  const confirmM = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => wagersApi.confirm(id))),
    onSuccess: () => { toast.success('Result confirmed — you got paid'); refresh(); },
    onError: onErr,
  });

  const all = bets.data ?? [];
  // Filter pills mirror the global /bets page: one filtered, sorted list rather
  // than per-status sections. Closed and cancelled bets now surface here too
  // (previously only on the Results tab).
  const [filter, setFilter] = useState<BetFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('date-desc');
  const count = (f: BetFilter) => filterWagers(all, f).length;
  const q = query.trim().toLowerCase();
  let groups = groupWagers(filterWagers(all, filter), me ?? '');
  if (q) {
    groups = groups.filter((g) =>
      [g.rep.home_team, g.rep.away_team, ...g.opponents.map((o) => o.name)]
        .join(' ').toLowerCase().includes(q),
    );
  }
  groups = sortGroups(groups, sort);
  const pill = (activePill: boolean) =>
    cn(
      'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium',
      activePill ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-muted-foreground',
    );

  // One consolidated per-group action set (mirrors the global /bets page). The
  // status badge on the card carries the state, so the buttons stay terse.
  const actionsFor = (g: WagerGroup) => {
    const w = g.rep;
    const ids = g.wagers.map((x) => x.id);
    const mine = w.proposer_id === me || w.acceptor_id === me;
    // Score-decided: only the winner claims the pot; everyone else just reads it.
    if (w.status === 'completed' && mine) {
      return w.winner_user_id === me ? (
        <Button size="sm" className="w-full" disabled={confirmM.isPending} onClick={() => confirmM.mutate(ids)}>Confirm</Button>
      ) : null;
    }
    // Accepted wagers hold both stakes, so calling one off takes both sides: one
    // requests, the other approves. Locks 10 minutes before kickoff.
    if (w.status === 'accepted' && mine) {
      if (cancelLocked(w)) return null;
      if (!w.cancel_requested_by) {
        return (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="w-full" disabled={reqCancelM.isPending}>Cancel</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Do you really want to cancel?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your opponent has to approve the cancellation — both stakes are refunded only once they do. Until then the bet stands.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={reqCancelM.isPending}>Keep bet</AlertDialogCancel>
                <AlertDialogAction disabled={reqCancelM.isPending} onClick={() => reqCancelM.mutate(ids)}>Cancel bet</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      }
      if (w.cancel_requested_by === me) {
        return <span className="text-center text-[11px] text-muted-foreground">Cancel Requested</span>;
      }
      return (
        <>
          <Button size="sm" className="w-full" disabled={approveCancelM.isPending} onClick={() => approveCancelM.mutate(ids)}>Approve</Button>
          <Button size="sm" variant="ghost" className="w-full" disabled={rejectCancelM.isPending} onClick={() => rejectCancelM.mutate(ids)}>Reject</Button>
        </>
      );
    }
    if (w.status !== 'open') return null;
    // Whoever's turn it is can Accept / Counter / Decline; the member holding the
    // current offer (waiting on the other side) can Withdraw it. Fall back to the
    // original acceptor/proposer roles if the negotiation fields are absent (an old
    // backend during a deploy window), and only offer Counter once they're present.
    const respondTurn = w.my_turn ?? (w.pending_id != null ? w.pending_id === me : w.acceptor_id === me);
    const holderIsMe = w.held_id != null ? w.held_id === me : w.proposer_id === me;
    if (respondTurn) {
      return (
        <>
          <Button size="sm" className="w-full" disabled={acceptM.isPending} onClick={() => acceptM.mutate(ids)}>Accept</Button>
          {/* Counter acts on a single wager; hide it if identical challenges from
              different people merged into one card (rare — it self-splits once countered). */}
          {w.pending_id != null && g.wagers.length === 1 && <CounterButton wager={w} me={me!} onDone={refresh} />}
          <Button size="sm" variant="outline" className="w-full" disabled={declineM.isPending} onClick={() => declineM.mutate(ids)}>Decline</Button>
        </>
      );
    }
    if (holderIsMe && !cancelLocked(w)) {
      return <Button size="sm" variant="outline" className="w-full" disabled={cancelM.isPending} onClick={() => cancelM.mutate(ids)}>Withdraw</Button>;
    }
    return null;
  };

  const eventIds = Array.from(new Set(all.map((w) => w.event_id)));
  const eventsQ = useQuery({
    queryKey: ['wager-events', lg.id, [...eventIds].sort().join(',')],
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
    // Poll only while a game is actually in progress — the ingestor refreshes
    // those scores every 60s, so 30s here keeps the card within about a minute
    // of the real score without polling around the clock.
    refetchInterval: (query) =>
      Object.values(query.state.data ?? {}).some((e) => e.status === 'live') ? 30_000 : false,
  });
  const eventMap = eventsQ.data ?? {};

  return (
    <div className="flex flex-col gap-4">
      {/* Filter pills — same set as the global Bets page. */}
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={pill(filter === f.key)}>
            {f.label} ({count(f.key)})
          </button>
        ))}
      </div>

      {!bets.isLoading && all.length > 0 && (
        <div className="flex items-center gap-2">
          <ListSearch value={query} onChange={setQuery} placeholder="Search teams, opponents" className="flex-1" />
          <BetSortMenu value={sort} onChange={setSort} />
        </div>
      )}

      {bets.isLoading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : groups.length === 0 ? (
        <CenterCard>
          <CalendarDays className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {q
              ? `No bets match “${query.trim()}”.`
              : filter === 'all'
                ? 'No bets yet. Settled bets are on the Results tab.'
                : `No ${FILTERS.find((f) => f.key === filter)!.label.toLowerCase()} bets.`}
          </p>
          {canBet && filter === 'all' && !q && (
            <Button size="sm" variant="outline" onClick={() => router.push(`/leagues/${lg.id}/sports`)}>
              Browse games
            </Button>
          )}
        </CenterCard>
      ) : (
        <div>
          {groups.map((g) => (
            <WagerBetCard key={g.key} group={g} me={me} ev={eventMap[g.rep.event_id]} actions={actionsFor(g)} />
          ))}
        </div>
      )}
    </div>
  );
}
