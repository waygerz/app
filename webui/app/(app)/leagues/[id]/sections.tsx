'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLeague } from './league-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  leaguesApi,
  type LeagueDetail,
  type LeagueMember,
  type LeaguePeriod,
  type PeriodResults,
  type PickRow,
  type WeeklyResultRow,
} from '@/lib/leagues';
import { wagersApi, type Wager, type WagerResult } from '@/lib/wagers';
import {
  fetchUpcomingEvents, fetchPeriodEvents, fetchEventOdds, fetchEvent, fetchSports, fetchLeagues, type SportEvent,
} from '@/lib/ingestor';
import { fetchTransactions, formatCredits } from '@/lib/wallet';
import { useAuth } from '@/auth/AuthContext';
import { EventCard, TeamLogo, formatStart } from '@/components/event-card';
import { Combobox } from '@/components/ui/combobox';
import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { LeagueAvatar } from '@/components/league-avatar';
import { mediaApi } from '@/lib/media';
import { imageToWebp } from '@/lib/imageToWebp';
import { emojiFor } from '@/lib/sport-emoji';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Trophy, CalendarDays, Wallet, Settings, X, UserPlus, EllipsisVertical, MessageCircle, Check, CircleCheckBig, ImagePlus, Trash2 } from 'lucide-react';
import { friendsApi } from '@/lib/friends';
import { messagingApi } from '@/lib/messaging';
import { dispatchOpenChat } from '@/lib/open-chat';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function CenterCard({ children }: { children: ReactNode }) {
  return <Card className="items-center gap-2 p-6 text-center sm:p-10">{children}</Card>;
}

// Scheduled games restricted to a league's own sport-leagues (so an NBA league
// never shows college-football games). Pass the league's sport_league_ids.
function useScheduled(sportLeagueIds: string[]) {
  return useQuery({
    queryKey: ['schedule', [...sportLeagueIds].sort()],
    queryFn: () => fetchUpcomingEvents(50, sportLeagueIds),
    enabled: sportLeagueIds.length > 0,
  });
}

// Resolve an icon for a league's sports. LeagueSportRef has no sport slug or
// logo, so we derive the slug from each sport's events (for an emoji fallback),
// then pull competition logos from fetchLeagues(sport). id -> {logo?, emoji}.
function useSportMeta(evs: SportEvent[]) {
  const sportOf = new Map<string, string>();
  for (const e of evs) {
    if (e.sport_league_id && e.sport && !sportOf.has(e.sport_league_id)) {
      sportOf.set(e.sport_league_id, e.sport);
    }
  }
  const sports = Array.from(new Set(sportOf.values())).sort();
  const q = useQuery({
    queryKey: ['sport-league-logos', sports.join(',')],
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        sports.map(async (sp) => {
          const leagues = await fetchLeagues(sp);
          for (const l of leagues) {
            const id = String(l.sport_league_id || l.id);
            if (l.logo) map[id] = l.logo;
          }
        }),
      );
      return map;
    },
    enabled: sports.length > 0,
    staleTime: 30 * 60_000,
  });
  return (id: string): { logo?: string; emoji: string } => ({
    logo: q.data?.[id],
    emoji: emojiFor(sportOf.get(id) ?? ''),
  });
}

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
  // Drop local edits when switching weeks.
  useEffect(() => { setSel({}); setTiebreaker(''); }, [selectedId]);

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

  useEffect(() => {
    if (existingTb != null) setTiebreaker(String(existingTb));
  }, [existingTb]);

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
  const picksLocked = lockAt !== null && Date.now() >= lockAt;
  const canEdit = !!editable && !picksLocked;
  const unsaved = Object.keys(sel).length;
  const tbDirty = tiebreaker !== '' && (existingTb === null || Number(tiebreaker) !== existingTb);
  const hasChanges = unsaved > 0 || tbDirty;

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <Combobox
          ariaLabel="Select week"
          className="max-w-[220px] flex-1 sm:flex-none sm:w-[220px]"
          value={selectedId}
          onChange={setPeriodId}
          options={periods.map((p) => ({ value: p.id, label: p.label }))}
          searchPlaceholder="Search week…"
        />
        {isCommish && (
          <Button size="sm" variant="outline" disabled={regen.isPending} onClick={() => regen.mutate()}>
            {regen.isPending ? 'Syncing…' : 'Sync schedule'}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground sm:text-lg">
          {editable ? 'Make your Picks' : 'Picks'} · {period?.label}
        </h2>
        {editable ? (
          lockAt !== null && (
            <p className="text-xs text-muted-foreground">
              {picksLocked
                ? 'Picks are locked — the first game is about to start.'
                : `Picks lock ${formatStart(new Date(lockAt).toISOString())}, an hour before the first game.`}
            </p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">
            {period?.status === 'upcoming'
              ? 'This week hasn’t opened yet — preview only.'
              : 'This week is closed.'}
          </p>
        )}
      </div>

      {events.isLoading && <Skeleton className="h-24 rounded-xl" />}
      {!events.isLoading && evs.length === 0 && (
        <p className="text-sm text-muted-foreground">No games scheduled for this week.</p>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {evs.map((ev) => {
          const g = graded.get(ev.external_id);
          const gradedLock = !!(g && g.correct !== null);
          const disabled = gradedLock || !canEdit;
          const cur = pick(ev.external_id);
          return (
            <Card key={ev.external_id} className="gap-3 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{formatStart(ev.start_time)}</span>
                {gradedLock && (
                  <Badge size="sm" appearance="light" variant={g!.correct ? 'success' : 'destructive'}>
                    {g!.correct ? '✓ correct' : '✗ wrong'}
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {(['away', 'home'] as const).map((side) => {
                  const isHome = side === 'home';
                  const teamName = isHome ? ev.home_team : ev.away_team;
                  const teamAbbr = isHome ? ev.home_abbr : ev.away_abbr;
                  const teamLogo = isHome ? ev.home_logo : ev.away_logo;
                  const active = cur === side;
                  const isMyPick = gradedLock && g!.pick_side === side;
                  return (
                    <button
                      key={side}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSel((s) => ({ ...s, [ev.external_id]: side }))}
                      className={cn(
                        'flex flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-foreground transition-colors',
                        active || isMyPick
                          ? 'border-primary bg-primary/10'
                          : 'border-input hover:border-foreground/30',
                        disabled && 'cursor-not-allowed',
                        disabled && !active && !isMyPick && 'opacity-60',
                      )}
                    >
                      <TeamLogo src={teamLogo} name={teamAbbr || teamName} className="size-12 sm:size-14" />
                      <span className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{teamName}</span>
                      {isMyPick && <Check className="size-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
              {ev.external_id === lastGameId && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <span className="text-sm font-bold text-foreground">Tie-breaker · total points</span>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={tiebreaker}
                    onChange={(e) => setTiebreaker(e.target.value)}
                    disabled={disabled}
                    placeholder="e.g. 48"
                    className="h-9 w-24"
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Save bar pinned to the bottom of the page (open week only) */}
      {evs.length > 0 && editable && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-sm">
          <div className="container flex items-center justify-between gap-3 py-3">
            <span className="text-xs text-muted-foreground">
              {picksLocked
                ? 'Picks are locked for this week.'
                : hasChanges
                  ? `${unsaved} unsaved pick${unsaved === 1 ? '' : 's'}${tbDirty ? ' + tie-breaker' : ''}`
                  : 'Tap a team to make a pick.'}
            </span>
            <Button className="shrink-0" disabled={save.isPending || picksLocked || !hasChanges} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save picks'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type BetSectionTone = 'pending' | 'awaiting' | 'active' | 'history';

const BET_SECTION_TONE: Record<BetSectionTone, { accent: string; header: string }> = {
  pending: {
    accent: 'border-l-amber-500 bg-amber-500/5',
    header: 'text-amber-700 dark:text-amber-400',
  },
  awaiting: {
    accent: 'border-l-blue-500 bg-blue-500/5',
    header: 'text-blue-700 dark:text-blue-400',
  },
  active: {
    accent: 'border-l-green-600 bg-green-500/5',
    header: 'text-green-700 dark:text-green-400',
  },
  history: {
    accent: 'border-l-border bg-muted/30',
    header: 'text-muted-foreground',
  },
};

// ---- Standard state colors for betting / results cards ----
// selection (your pick) = primary · win = brand green · loss/push = muted · idle = unselected
const STATE = {
  selected: 'border-primary bg-primary/10 text-foreground',
  win: 'border-brand bg-brand/10 text-foreground',
  loss: 'border-border bg-muted/40 text-muted-foreground',
  idle: 'border-input text-muted-foreground hover:border-foreground/30',
} as const;

const pickBtn = (selected: boolean) =>
  `rounded-lg border text-sm transition-colors ${selected ? STATE.selected : STATE.idle}`;

function wagerStatusBadge(w: Wager, me?: string) {
  if (w.status === 'open' && w.acceptor_id === me) {
    return <Badge size="sm" variant="warning" appearance="light">Needs response</Badge>;
  }
  if (w.status === 'open') {
    return <Badge size="sm" variant="info" appearance="light">Awaiting</Badge>;
  }
  if (w.status === 'accepted') {
    return <Badge size="sm" variant="success" appearance="light">Live</Badge>;
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

function WagerBetCard({
  w,
  me,
  ev,
  actions,
  accentClass,
}: {
  w: Wager;
  me?: string;
  ev?: SportEvent | null;
  actions?: ReactNode;
  accentClass: string;
}) {
  const awayName = ev?.away_team ?? w.away_team;
  const homeName = ev?.home_team ?? w.home_team;
  const proposerIsHome = w.proposer_side === 'home';
  const acceptorIsHome = w.acceptor_side === 'home';
  const proposerTeam = proposerIsHome ? homeName : awayName;
  const acceptorTeam = acceptorIsHome ? homeName : awayName;
  const proposerLogo = proposerIsHome ? ev?.home_logo : ev?.away_logo;
  const acceptorLogo = acceptorIsHome ? ev?.home_logo : ev?.away_logo;
  const proposerAbbr = proposerIsHome ? (ev?.home_abbr ?? homeName) : (ev?.away_abbr ?? awayName);
  const acceptorAbbr = acceptorIsHome ? (ev?.home_abbr ?? homeName) : (ev?.away_abbr ?? awayName);
  const pickLogo = 'size-10 text-xs sm:size-10';

  // Once decided, the winner's side is green and the loser's muted; before that,
  // each committed side shows the selection (primary) style.
  const done = w.status === 'settled' || w.status === 'refunded';
  const boxFor = (userWon: boolean, committed: boolean) =>
    done ? (userWon ? STATE.win : STATE.loss) : committed ? STATE.selected : STATE.idle;
  const proposerBox = boxFor(w.winner_user_id === w.proposer_id, true);
  const acceptorBox = boxFor(w.winner_user_id === w.acceptor_id, w.status !== 'open');

  return (
    <Card className={cn('min-w-0 gap-3 border-l-4 p-4', accentClass)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {wagerStatusBadge(w, me)}
        <Badge size="sm" appearance="outline" variant="primary">
          {formatCredits(w.amount_cents)} each
        </Badge>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className={cn('flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 transition-colors', proposerBox)}>
          <UserAvatar userId={w.proposer_id} name={w.proposer_name} className="size-10" />
          <span className="max-w-full truncate text-center text-xs font-medium">{w.proposer_name}</span>
          <div className="flex max-w-full items-center gap-2">
            <TeamLogo src={proposerLogo} name={proposerAbbr} className={pickLogo} />
            <span className="truncate text-sm font-medium text-foreground">{proposerTeam}</span>
          </div>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">vs</span>
        <div className={cn('flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 transition-colors', acceptorBox)}>
          <UserAvatar userId={w.acceptor_id} name={w.acceptor_name} className="size-10" />
          <span className="max-w-full truncate text-center text-xs font-medium">{w.acceptor_name}</span>
          <div className="flex max-w-full items-center gap-2">
            <TeamLogo src={acceptorLogo} name={acceptorAbbr} className={pickLogo} />
            <span className="truncate text-sm font-medium text-foreground">{acceptorTeam}</span>
          </div>
        </div>
      </div>

      {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">{actions}</div>}
    </Card>
  );
}

function BetSection({
  title,
  tone,
  wagers,
  me,
  eventMap,
  actions,
}: {
  title: string;
  tone: BetSectionTone;
  wagers: Wager[];
  me?: string;
  eventMap: Record<string, SportEvent>;
  actions?: (w: Wager) => ReactNode;
}) {
  if (wagers.length === 0) return null;
  const style = BET_SECTION_TONE[tone];
  return (
    <section>
      <h3 className={cn('mb-3 text-sm font-semibold', style.header)}>
        {title} ({wagers.length})
      </h3>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {wagers.map((w) => (
          <WagerBetCard
            key={w.id}
            w={w}
            me={me}
            ev={eventMap[w.event_id]}
            accentClass={style.accent}
            actions={actions?.(w)}
          />
        ))}
      </div>
    </section>
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
  const acceptM = useMutation({ mutationFn: (id: string) => wagersApi.accept(id), onSuccess: refresh, onError: onErr });
  const declineM = useMutation({ mutationFn: (id: string) => wagersApi.decline(id), onSuccess: refresh, onError: onErr });
  const cancelM = useMutation({ mutationFn: (id: string) => wagersApi.cancel(id), onSuccess: refresh, onError: onErr });
  const confirmM = useMutation({
    mutationFn: ({ id, result }: { id: string; result: WagerResult }) => wagersApi.confirm(id, result),
    onSuccess: (_d, v) => { toast.success(v.result === 'draw' ? 'Called a draw' : 'Result confirmed'); refresh(); },
    onError: onErr,
  });

  const all = bets.data ?? [];
  // Live bets live here; settled ones live on the Results tab (grouped by week).
  const pending = all.filter((w) => w.status === 'open');
  const active = all.filter((w) => w.status === 'accepted');
  const awaiting = all.filter((w) => w.status === 'completed');
  const liveCount = pending.length + active.length + awaiting.length;

  const confirmActions = (w: Wager) =>
    w.proposer_id === me || w.acceptor_id === me ? (
      <>
        <Button size="sm" variant="outline" disabled={confirmM.isPending} title="Concede — pays your opponent" onClick={() => confirmM.mutate({ id: w.id, result: 'lost' })}>I lost</Button>
        <Button size="sm" variant="ghost" disabled={confirmM.isPending} onClick={() => confirmM.mutate({ id: w.id, result: 'draw' })}>Draw</Button>
      </>
    ) : null;

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
  });
  const eventMap = eventsQ.data ?? {};

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground sm:text-lg">My Bets</h2>
        <Link href={`/leagues/${lg.id}/sports`} className="text-xs text-primary hover:underline">
          Browse games →
        </Link>
      </div>
      <BetSection
        title="Pending"
        tone="pending"
        wagers={pending}
        me={me}
        eventMap={eventMap}
        actions={(w) =>
          w.acceptor_id === me ? (
            <>
              <Button size="sm" onClick={() => acceptM.mutate(w.id)}>Accept</Button>
              <Button size="sm" variant="outline" onClick={() => declineM.mutate(w.id)}>Decline</Button>
            </>
          ) : w.proposer_id === me ? (
            <Button size="sm" variant="outline" onClick={() => cancelM.mutate(w.id)}>Cancel</Button>
          ) : null
        }
      />
      <BetSection title="Active" tone="active" wagers={active} me={me} eventMap={eventMap} />
      <BetSection title="Awaiting result" tone="awaiting" wagers={awaiting} me={me} eventMap={eventMap} actions={confirmActions} />

      {bets.isLoading && <Skeleton className="h-24 rounded-xl" />}
      {!bets.isLoading && liveCount === 0 && (
        <CenterCard>
          <CalendarDays className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No active bets yet. Settled bets are on the Results tab.
          </p>
          {canBet && (
            <Button size="sm" variant="outline" onClick={() => router.push(`/leagues/${lg.id}/sports`)}>
              Browse games
            </Button>
          )}
        </CenterCard>
      )}
    </div>
  );
}

// ===================== SPORTS (Head-to-Head) =====================
// Hub: the league's configured competitions, each linking to its schedule.
// Sport icon: competition logo, falling back to the sport emoji, then initials.
function SportIcon({ logo, emoji, label, px }: { logo?: string; emoji?: string; label: string; px: number }) {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt=""
        loading="lazy"
        width={px}
        height={px}
        onError={() => setBroken(true)}
        className="shrink-0 object-contain"
      />
    );
  }
  if (emoji) {
    return (
      <span className="shrink-0 leading-none" style={{ fontSize: Math.round(px * 0.82) }}>
        {emoji}
      </span>
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl bg-primary/15 font-bold text-primary"
      style={{ width: px, height: px, fontSize: Math.round(px * 0.3) }}
    >
      {label.slice(0, 3).toUpperCase()}
    </span>
  );
}

export function LeagueSports() {
  const lg = useLeague();
  const events = useScheduled(lg.sports.map((s) => s.sport_league_id));
  const evs = events.data ?? [];
  const metaFor = useSportMeta(evs);
  const countFor = (id: string) => evs.filter((e) => e.sport_league_id === id).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Sports</h2>
        <p className="text-sm text-muted-foreground">The competitions this league bets on.</p>
      </div>

      {lg.sports.length === 0 ? (
        <CenterCard>
          <Trophy className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No sports set for this league yet.</p>
          {lg.my_role === 'commissioner' && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/leagues/${lg.id}/manage`}>Add sports</Link>
            </Button>
          )}
        </CenterCard>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {lg.sports.map((s) => {
            const label = s.name || s.sport_league_id;
            const meta = metaFor(s.sport_league_id);
            const n = countFor(s.sport_league_id);
            return (
              <Link key={s.sport_league_id} href={`/leagues/${lg.id}/sports/${s.sport_league_id}`} className="group">
                <Card className="h-32 cursor-pointer items-center justify-center gap-2 p-3 text-center transition-all group-hover:border-primary group-hover:shadow-md sm:p-4">
                  <SportIcon logo={meta.logo} emoji={meta.emoji} label={label} px={52} />
                  <span className="line-clamp-1 text-sm font-semibold text-foreground">{label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {events.isLoading ? '…' : n === 0 ? 'No games' : `${n} game${n === 1 ? '' : 's'}`}
                  </span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// One sport's upcoming schedule; tap a game to propose a wager.
export function LeagueSportSchedule() {
  const lg = useLeague();
  const { user } = useAuth();
  const me = user?.id;
  const params = useParams();
  const sportLeagueId = String(params.sportLeagueId ?? '');
  const sport = lg.sports.find((s) => s.sport_league_id === sportLeagueId);
  const events = useScheduled(sportLeagueId ? [sportLeagueId] : []);
  const evs = events.data ?? [];
  const metaFor = useSportMeta(evs);
  const [selected, setSelected] = useState<SportEvent | null>(null);
  const canBet = lg.status === 'active';
  const label = sport?.name || sportLeagueId;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <Link href={`/leagues/${lg.id}/sports`} className="text-xs text-muted-foreground hover:text-foreground">
          ← Sports
        </Link>
        <div className="flex items-center gap-2.5">
          <SportIcon logo={metaFor(sportLeagueId).logo} emoji={metaFor(sportLeagueId).emoji} label={label} px={36} />
          <h2 className="text-lg font-semibold text-foreground">{label}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Upcoming games{canBet ? ' · tap a game to challenge a friend' : ''}
        </p>
      </div>

      {!sport && (
        <CenterCard>
          <p className="text-sm text-muted-foreground">That sport isn’t part of this league.</p>
        </CenterCard>
      )}
      {sport && events.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      )}
      {sport && !events.isLoading && evs.length === 0 && (
        <CenterCard>
          <CalendarDays className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No upcoming {label} games right now.</p>
        </CenterCard>
      )}
      {sport && evs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {evs.map((ev: SportEvent) => (
            <EventCard key={ev.external_id} event={ev} onSelect={canBet ? () => setSelected(ev) : undefined} />
          ))}
        </div>
      )}

      {canBet && (
        <ScheduleBetDialog
          lg={lg}
          event={selected}
          me={me}
          open={!!selected}
          onOpenChange={(o) => { if (!o) setSelected(null); }}
        />
      )}
    </div>
  );
}

// ===================== STANDINGS =====================
function standingRankClass(rank: number) {
  if (rank === 1) return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  if (rank === 2) return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  if (rank === 3) return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300';
  return 'bg-muted text-muted-foreground';
}

function formatRecord(wins: number, losses: number, pushes?: number) {
  if (pushes) return `${wins}–${losses}–${pushes}`;
  return `${wins}–${losses}`;
}

export function LeagueStandings() {
  const lg = useLeague();
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const q = useQuery({ queryKey: ['standings', lg.id], queryFn: () => leaguesApi.standings(lg.id) });
  if (q.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  const rows = q.data?.standings ?? [];
  if (rows.length === 0) {
    return (
      <CenterCard>
        <Trophy className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No standings yet.</p>
      </CenterCard>
    );
  }
  const money = rows[0].balance_cents !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">Standings ({rows.length})</h2>
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const rank = i + 1;
          const isMe = String(r.user_id) === me;
          return (
            <Card key={r.user_id} className="flex w-full min-w-0 flex-row items-center gap-3 p-4">
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                  standingRankClass(rank),
                )}
              >
                {rank}
              </div>
              <UserAvatar
                userId={r.user_id}
                name={r.display_name}
                imageUrl={r.avatar_key}
                className="size-14 shrink-0"
                fallbackClassName="text-base"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {r.display_name}
                  {isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatRecord(r.wins, r.losses, r.pushes)} W–L
                </p>
              </div>
              {money ? (
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatCredits(r.balance_cents ?? 0)}
                  </p>
                  <p
                    className={cn(
                      'text-xs font-medium',
                      (r.net_cents ?? 0) >= 0 ? 'text-brand' : 'text-destructive',
                    )}
                  >
                    {(r.net_cents ?? 0) >= 0 ? '+' : ''}
                    {formatCredits(r.net_cents ?? 0)} net
                  </p>
                </div>
              ) : (
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {formatRecord(r.wins, r.losses, r.pushes)}
                  </p>
                  <p className="text-xs text-muted-foreground">W–L</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ===================== RESULTS (by week) =====================
export function LeagueResults() {
  const lg = useLeague();
  if (lg.league_type === 'pickem') return <PickemResults lg={lg} />;
  return <HeadToHeadResults lg={lg} />;
}

function NoResults({ text }: { text: string }) {
  return (
    <CenterCard>
      <Trophy className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </CenterCard>
  );
}

// Settled head-to-head bets, grouped by the week (period) they belong to.
function HeadToHeadResults({ lg }: { lg: LeagueDetail }) {
  const { user } = useAuth();
  const me = user?.id;
  const periodsQ = useQuery({ queryKey: ['periods', lg.id], queryFn: () => leaguesApi.periods(lg.id) });
  const betsQ = useQuery({ queryKey: ['wagers', lg.id], queryFn: () => wagersApi.mine(lg.id) });

  const settled = (betsQ.data ?? []).filter((w) => w.status === 'settled' || w.status === 'refunded');
  const eventIds = Array.from(new Set(settled.map((w) => w.event_id)));
  const eventsQ = useQuery({
    queryKey: ['result-events', lg.id, [...eventIds].sort().join(',')],
    queryFn: async () => {
      const map: Record<string, SportEvent> = {};
      await Promise.all(eventIds.map(async (id) => { const ev = await fetchEvent(id); if (ev) map[id] = ev; }));
      return map;
    },
    enabled: eventIds.length > 0,
    staleTime: 5 * 60_000,
  });
  const eventMap = eventsQ.data ?? {};

  if (betsQ.isLoading || periodsQ.isLoading) return <Skeleton className="h-40 rounded-xl" />;

  const byPeriod = new Map<string, Wager[]>();
  for (const w of settled) {
    const key = w.period_id ?? '_none';
    const arr = byPeriod.get(key);
    if (arr) arr.push(w);
    else byPeriod.set(key, [w]);
  }
  const ordered = [...(periodsQ.data ?? [])].sort((a, b) => b.index - a.index);
  const sections = ordered
    .map((p) => ({ label: p.label, wagers: byPeriod.get(p.id) ?? [] }))
    .filter((s) => s.wagers.length > 0);
  const orphan = byPeriod.get('_none') ?? [];
  if (orphan.length) sections.push({ label: 'Other', wagers: orphan });

  if (sections.length === 0) return <NoResults text="No results yet — settled bets show up here by week." />;

  return (
    <div className="flex flex-col gap-8">
      {sections.map((s) => (
        <section key={s.label} className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">{s.label}</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {s.wagers.map((w) => (
              <WagerBetCard key={w.id} w={w} me={me} ev={eventMap[w.event_id]} accentClass={BET_SECTION_TONE.history.accent} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// Graded pick'em picks, one section per week.
function PickemResults({ lg }: { lg: LeagueDetail }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const canModerate = lg.my_role === 'commissioner' || lg.my_role === 'moderator';
  const periodsQ = useQuery({ queryKey: ['periods', lg.id], queryFn: () => leaguesApi.periods(lg.id) });
  // Chronological order + default to the current (open) week, matching PickemPlay.
  const periods: LeaguePeriod[] = [...(periodsQ.data ?? [])].sort((a, b) => a.index - b.index);
  const openPeriod = periods.find((p) => p.status === 'open') ?? null;

  const [periodId, setPeriodId] = useState('');
  const selectedId = periodId || openPeriod?.id || periods[periods.length - 1]?.id || '';
  const [openMember, setOpenMember] = useState<WeeklyResultRow | null>(null);
  // Only crown a winner once the week is final — never mid-week.
  const weekFinal = periods.find((p) => p.id === selectedId)?.status === 'final';

  const resultsQ = useQuery({
    queryKey: ['period-results', lg.id, selectedId],
    queryFn: () => leaguesApi.periodResults(lg.id, selectedId),
    enabled: !!selectedId,
  });
  const confirmM = useMutation({
    mutationFn: ({ userId, confirmed }: { userId: string; confirmed: boolean }) =>
      leaguesApi.confirmMember(lg.id, selectedId, userId, confirmed),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['period-results', lg.id, selectedId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (periodsQ.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (periods.length === 0) return <NoResults text="No weeks yet." />;

  const res = resultsQ.data as PeriodResults | undefined;
  const rows = res?.rows ?? [];
  const rankCounts = rows.reduce<Record<number, number>>((acc, r) => {
    acc[r.rank] = (acc[r.rank] ?? 0) + 1;
    return acc;
  }, {});
  const last = res?.last_game;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Combobox
          ariaLabel="Select week"
          className="w-full max-w-[220px]"
          value={selectedId}
          onChange={setPeriodId}
          options={periods.map((p) => ({ value: p.id, label: p.label }))}
          searchPlaceholder="Search week…"
        />
        {last?.final && last.actual_total !== null && (
          <span className="text-xs text-muted-foreground">
            Tie-breaker: {last.away_team} @ {last.home_team} · {last.actual_total} pts
          </span>
        )}
      </div>

      {resultsQ.isLoading && <Skeleton className="h-40 rounded-xl" />}
      {!resultsQ.isLoading && rows.length === 0 && <NoResults text="No picks for this week yet." />}

      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const isMe = r.user_id === me;
          const tied = rankCounts[r.rank] > 1;
          const isWinner = weekFinal && r.rank === 1;
          return (
            <Card
              key={r.user_id}
              className={cn('flex-row items-center gap-2 p-3', isWinner && STATE.win)}
            >
              <button
                type="button"
                onClick={() => setOpenMember(r)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    isWinner ? 'bg-brand/20 text-brand' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isWinner ? <Trophy className="size-3" /> : tied ? `T${r.rank}` : r.rank}
                </div>
                <UserAvatar userId={r.user_id} name={r.display_name} imageUrl={r.avatar_key} className="size-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {r.display_name}
                    {isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
                  </p>
                  {r.tiebreaker_total !== null && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      tie-breaker {r.tiebreaker_total}
                      {r.tiebreaker_diff !== null ? ` · off by ${r.tiebreaker_diff}` : ''}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {r.correct}
                    <span className="text-xs font-normal text-muted-foreground">/{r.graded || r.total}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">correct</p>
                </div>
              </button>
              <ConfirmMemberButton
                row={r}
                canModerate={canModerate}
                pending={confirmM.isPending}
                onConfirm={(confirmed) => confirmM.mutate({ userId: r.user_id, confirmed })}
              />
            </Card>
          );
        })}
      </div>

      <MemberPicksDialog
        lg={lg}
        periodId={selectedId}
        periodLabel={periods.find((p) => p.id === selectedId)?.label ?? ''}
        member={openMember}
        open={!!openMember}
        onOpenChange={(o) => { if (!o) setOpenMember(null); }}
      />
    </div>
  );
}

// The weekly confirmation toggle. Members without moderation rights see a
// static indicator; commissioners and moderators get a confirmation dialog
// before (un)confirming a member.
function ConfirmMemberButton({
  row, canModerate, pending, onConfirm,
}: {
  row: WeeklyResultRow;
  canModerate: boolean;
  pending: boolean;
  onConfirm: (confirmed: boolean) => void;
}) {
  const icon = (
    <CircleCheckBig className={cn('size-6', row.confirmed ? 'text-brand' : 'text-muted-foreground/40')} />
  );

  if (!canModerate) {
    return (
      <span
        className="shrink-0 rounded-full p-1"
        aria-label={row.confirmed ? 'Confirmed' : 'Not confirmed'}
        title={row.confirmed ? 'Confirmed' : 'Not confirmed'}
      >
        {icon}
      </span>
    );
  }

  const next = !row.confirmed;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={row.confirmed ? 'Confirmed — tap to unconfirm' : 'Not confirmed — tap to confirm'}
          title={row.confirmed ? 'Confirmed — click to unconfirm' : 'Not confirmed — click to confirm'}
          className="shrink-0 rounded-full p-1 hover:bg-muted"
        >
          {icon}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{next ? 'Confirm results?' : 'Unconfirm results?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {next
              ? `Mark ${row.display_name}'s picks for this week as confirmed.`
              : `Remove the confirmation on ${row.display_name}'s picks for this week.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => onConfirm(next)}>
            {next ? 'Confirm' : 'Unconfirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Opened by tapping a member on the weekly leaderboard — their picks for the
// week (hidden by the backend until an hour before the first game).
function MemberPicksDialog({
  lg, periodId, periodLabel, member, open, onOpenChange,
}: {
  lg: LeagueDetail;
  periodId: string;
  periodLabel: string;
  member: WeeklyResultRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const q = useQuery({
    queryKey: ['member-picks', lg.id, periodId, member?.user_id],
    queryFn: () => leaguesApi.memberPicks(lg.id, periodId, member!.user_id),
    enabled: open && !!member && !!periodId,
    retry: false,
  });
  const picks = q.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh]">
        <DialogHeader>
          <DialogTitle>{member?.display_name}&rsquo;s picks</DialogTitle>
          <DialogDescription>{periodLabel || 'Selected week'}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex min-h-0 flex-col gap-2 overflow-y-auto py-2">
          {q.isLoading && <Skeleton className="h-24 rounded-xl" />}
          {q.isError && (
            <p className="text-sm text-muted-foreground">Picks are hidden until an hour before the first game.</p>
          )}
          {!q.isLoading && !q.isError && picks.length === 0 && (
            <p className="text-sm text-muted-foreground">No picks for this week.</p>
          )}
          {picks.map((p) => {
            const ev = p.event;
            return (
              <div key={p.id ?? p.event_id} className="flex items-center gap-1.5 rounded-lg border border-border p-2">
                <PickTeam
                  logo={ev?.away_logo}
                  label={ev?.away_abbr || ev?.away_team || '?'}
                  score={ev?.away_score}
                  picked={p.pick_side === 'away'}
                />
                <span className="shrink-0 px-0.5 text-xs font-medium text-muted-foreground">@</span>
                <PickTeam
                  logo={ev?.home_logo}
                  label={ev?.home_abbr || ev?.home_team || '?'}
                  score={ev?.home_score}
                  picked={p.pick_side === 'home'}
                />
                {p.correct === null ? (
                  <Badge size="sm" appearance="light" variant="secondary" className="shrink-0">—</Badge>
                ) : (
                  <Badge size="sm" appearance="light" variant={p.correct ? 'success' : 'destructive'} className="shrink-0">{p.correct ? '✓' : '✗'}</Badge>
                )}
              </div>
            );
          })}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// One team side inside a member's pick row: logo + abbreviation + score, with
// the member's picked side wrapped in a highlighted (primary) box.
function PickTeam({
  logo, label, score, picked,
}: {
  logo?: string | null;
  label: string;
  score?: number | null;
  picked: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-1 items-center gap-2 rounded-md px-2 py-1.5',
        picked ? 'bg-primary/10 ring-1 ring-inset ring-primary/60' : 'opacity-60',
      )}
    >
      <TeamLogo src={logo} name={label} className="size-6 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{label}</span>
      {score !== null && score !== undefined && (
        <span className="text-sm font-bold tabular-nums text-foreground">{score}</span>
      )}
    </div>
  );
}

// Two-step bet flow opened from a Schedule game card. Step 1 configures the bet
// (team, straight-up vs ATS + spread, amount); step 2 checks off which members
// to challenge. Each checked member gets a head-to-head request via propose.
function ScheduleBetDialog({
  lg, event, me, open, onOpenChange,
}: {
  lg: LeagueDetail;
  event: SportEvent | null;
  me?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'config' | 'members'>('config');
  const [side, setSide] = useState<'home' | 'away'>('away');
  const [betType, setBetType] = useState<'straight_up' | 'ats'>('straight_up');
  const [line, setLine] = useState('');
  const [credits, setCredits] = useState('10');
  const [selected, setSelected] = useState<string[]>([]);

  const oddsQ = useQuery({
    queryKey: ['odds', event?.external_id],
    queryFn: () => fetchEventOdds(event!.sport, event!.league, event!.external_id),
    enabled: open && !!event && !event.odds,
    initialData: event?.odds ?? undefined,
    staleTime: 5 * 60_000,
  });
  const spread = oddsQ.data?.spread;
  // home line is spread.line; the away side is its negation.
  const lineFor = (s: 'home' | 'away') => (spread ? (s === 'home' ? spread.line : -spread.line) : null);

  // Reset the flow whenever a new game is opened.
  useEffect(() => {
    if (open) {
      setStep('config'); setSide('away'); setBetType('straight_up'); setLine(''); setCredits('10'); setSelected([]);
    }
  }, [open, event?.external_id]);

  // Default the spread input to the current line for the picked side.
  useEffect(() => {
    if (betType === 'ats') {
      const def = lineFor(side);
      if (def !== null) setLine(String(def));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betType, side, spread]);

  const opponents = lg.members.filter((m) => m.user_id !== me);
  const toggle = (uid: string) =>
    setSelected((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));

  const propose = useMutation({
    mutationFn: () => wagersApi.propose({
      league_id: lg.id, event_id: event!.external_id, side,
      amount_cents: Math.round(Number(credits) * 100), acceptor_ids: selected,
      bet_type: betType, line: betType === 'ats' ? Number(line) : null,
    }),
    onSuccess: (r) => {
      if (r.created.length) toast.success(`Bet sent to ${r.created.length} member${r.created.length === 1 ? '' : 's'}`);
      r.errors.forEach((e) => toast.error(e.error));
      qc.invalidateQueries({ queryKey: ['wagers', lg.id] });
      qc.invalidateQueries({ queryKey: ['wagers-all'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!event) return null;
  const teamName = (s: 'home' | 'away') => (s === 'away' ? event.away_team : event.home_team);
  const teamLogo = (s: 'home' | 'away') => (s === 'away' ? event.away_logo : event.home_logo);
  const teamAbbr = (s: 'home' | 'away') => (s === 'away' ? event.away_abbr : event.home_abbr);
  const configReady = Number(credits) > 0 && (betType !== 'ats' || line.trim() !== '');
  const canSubmit = selected.length > 0 && configReady;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.away_team} @ {event.home_team}</DialogTitle>
          <DialogDescription className="sr-only">
            Configure and send a head-to-head bet to league members.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 py-2">
          {step === 'config' ? (
            <>
              <p className="text-sm text-muted-foreground">Pick the team you want to back.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {(['away', 'home'] as const).map((s) => {
                  const logo = teamLogo(s);
                  return (
                    <button key={s} type="button" onClick={() => setSide(s)} className={`flex flex-1 flex-col items-center gap-2 px-3 py-3 text-center ${pickBtn(side === s)}`}>
                      {logo ? (
                        <img src={logo} alt="" className="size-10 object-contain" />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                          {(teamAbbr(s) || teamName(s)).slice(0, 3).toUpperCase()}
                        </span>
                      )}
                      <span className="text-sm font-medium sm:text-base">{teamName(s)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                {([['straight_up', 'Straight Up'], ['ats', 'ATS']] as const).map(([v, lbl]) => (
                  <button key={v} type="button" onClick={() => setBetType(v)} className={`flex-1 px-3 py-2 ${pickBtn(betType === v)}`}>
                    {lbl}
                  </button>
                ))}
              </div>

              {betType === 'ats' && (
                <div className="flex items-center justify-between gap-3">
                  <Label>Spread</Label>
                  <Input
                    type="number" step="0.5" value={line} onChange={(e) => setLine(e.target.value)}
                    placeholder={oddsQ.isLoading ? 'Loading line…' : 'e.g. -3.5'} className="max-w-40"
                  />
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <Label>Amount (credits)</Label>
                <Input type="number" min={1} value={credits} onChange={(e) => setCredits(e.target.value)} className="max-w-40" />
              </div>

              <Button className="w-full self-stretch sm:w-auto sm:self-end" disabled={!configReady} onClick={() => setStep('members')}>Next</Button>
            </>
          ) : (
            <>
              <div className="text-sm text-foreground">
                Backing <span className="font-semibold">{teamName(side)}</span>
                {' · '}{betType === 'ats' ? `ATS ${line || '—'}` : 'Straight up'}
                {' · '}{formatCredits(Math.round(Number(credits) * 100))}
              </div>
              <div className="flex flex-col gap-2">
                <Label>Challenge members</Label>
                {opponents.length === 0 && (
                  <p className="text-sm text-muted-foreground">No other members to challenge yet.</p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {opponents.map((m) => {
                    const on = selected.includes(m.user_id);
                    return (
                      <button
                        key={m.user_id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(m.user_id)}
                        className={`flex flex-col items-center gap-2 px-3 py-3 text-center ${pickBtn(on)}`}
                      >
                        <UserAvatar userId={m.user_id} name={m.display_name} className="size-9" />
                        <span className="line-clamp-2 text-sm font-medium">{m.display_name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep('config')}>Back</Button>
                <Button className="w-full sm:w-auto" disabled={!canSubmit || propose.isPending} onClick={() => propose.mutate()}>
                  {propose.isPending
                    ? 'Sending…'
                    : `Send bet${selected.length > 1 ? `s (${selected.length})` : ''}`}
                </Button>
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ===================== ACTIVITY =====================
const TXN_LABEL: Record<string, string> = {
  league_grant: 'Starting grant', wager_hold: 'Bet hold', wager_payout: 'Bet payout',
  wager_refund: 'Bet refund',
};
export function LeagueActivity() {
  const lg = useLeague();
  const isMoney = lg.league_type !== 'pickem';
  const q = useQuery({
    queryKey: ['wallet-txns', lg.id],
    queryFn: () => fetchTransactions(`league:${lg.id}`),
    enabled: isMoney,
  });
  if (!isMoney) {
    return <CenterCard><Wallet className="size-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">Pick’em leagues don’t use money — see Standings for results.</p></CenterCard>;
  }
  if (q.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  const txns = q.data ?? [];
  if (txns.length === 0) return <CenterCard><Wallet className="size-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">No transactions yet.</p></CenterCard>;
  return (
    <Card className="min-w-0 overflow-x-auto p-0">
      <table className="w-full min-w-[26rem] text-sm">
        <tbody>
          {txns.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2 text-foreground">{TXN_LABEL[t.type] ?? t.type}</td>
              <td className={`px-4 py-2 text-right ${t.amount_cents >= 0 ? 'text-brand' : 'text-destructive'}`}>
                {t.amount_cents >= 0 ? '+' : ''}{formatCredits(t.amount_cents)}
              </td>
              <td className="px-4 py-2 text-right text-muted-foreground">{formatCredits(t.balance_after_cents)}</td>
              <td className="px-4 py-2 text-right text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const MEMBER_ROLE_LABELS: Record<string, string> = {
  commissioner: 'Commish',
  member: 'Member',
  moderator: 'Moderator',
};

function memberRoleLabel(role: string) {
  return MEMBER_ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

// ===================== MEMBERS =====================
// Per-member actions menu: commissioners manage roles + transfer + remove;
// moderators can only remove regular members. Consequential actions confirm.
function MemberActionsMenu({
  member, isCommish, canModerate, busy, onSetRole, onTransfer, onRemove,
}: {
  member: LeagueMember;
  isCommish: boolean;
  canModerate: boolean;
  busy: boolean;
  onSetRole: (role: 'moderator' | 'member') => void;
  onTransfer: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState<'transfer' | 'remove' | null>(null);

  const isCommishRow = member.role === 'commissioner';
  const canRemove = isCommish ? !isCommishRow : canModerate && member.role === 'member';
  const showMenu = isCommish ? !isCommishRow : canRemove;
  if (!showMenu) return null;

  return (
    <>
      {/* modal={false}: without it, the dropdown leaves pointer-events:none on
          <body> when it closes to open the AlertDialog, freezing the page. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="outline" className="size-8 shrink-0" aria-label="Member actions">
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {isCommish && !isCommishRow && (
            <DropdownMenuItem
              disabled={busy}
              onClick={() => onSetRole(member.role === 'moderator' ? 'member' : 'moderator')}
            >
              {member.role === 'moderator' ? 'Remove moderator' : 'Make moderator'}
            </DropdownMenuItem>
          )}
          {isCommish && !isCommishRow && (
            <DropdownMenuItem disabled={busy} onClick={() => setConfirming('transfer')}>
              Transfer commissioner
            </DropdownMenuItem>
          )}
          {canRemove && (
            <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => setConfirming('remove')}>
              Remove from league
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => { if (!o) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === 'transfer' ? 'Transfer commissioner?' : 'Remove member?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === 'transfer'
                ? `${member.display_name} will become the league commissioner and you'll become a moderator. You can only get it back if they transfer it to you.`
                : `Remove ${member.display_name} from this league? They'll lose access to it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming === 'transfer') onTransfer();
                else onRemove();
                setConfirming(null);
              }}
            >
              {confirming === 'transfer' ? 'Transfer' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function LeagueMembers() {
  const lg = useLeague();
  const qc = useQueryClient();
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const isCommish = lg.my_role === 'commissioner';
  const canModerate = isCommish || lg.my_role === 'moderator';

  const friendsQ = useQuery({ queryKey: ['friends'], queryFn: friendsApi.list });
  const reqsQ = useQuery({ queryKey: ['friend-requests'], queryFn: friendsApi.requests });
  const friendIds = new Set((friendsQ.data ?? []).map((f) => String(f.user_id)));
  const pendingIds = new Set([
    ...(reqsQ.data?.outgoing ?? []).map((r) => String(r.user_id)),
    ...(reqsQ.data?.incoming ?? []).map((r) => String(r.user_id)),
  ]);

  const onErr = (e: Error) => toast.error(e.message);
  const remove = useMutation({
    mutationFn: (uid: string) => leaguesApi.removeMember(lg.id, uid),
    onSuccess: () => { toast.success('Member removed'); qc.invalidateQueries({ queryKey: ['league', lg.id] }); },
    onError: onErr,
  });
  const setRole = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: 'moderator' | 'member' }) =>
      leaguesApi.setMemberRole(lg.id, uid, role),
    onSuccess: (_d, v) => {
      toast.success(v.role === 'moderator' ? 'Moderator added' : 'Moderator removed');
      qc.invalidateQueries({ queryKey: ['league', lg.id] });
    },
    onError: onErr,
  });
  const transfer = useMutation({
    mutationFn: (uid: string) => leaguesApi.transferCommissioner(lg.id, uid),
    onSuccess: () => { toast.success('Commissioner transferred'); qc.invalidateQueries({ queryKey: ['league', lg.id] }); },
    onError: onErr,
  });
  const addFriend = useMutation({
    mutationFn: (uid: string) => friendsApi.addByUserId(uid),
    onSuccess: () => { toast.success('Friend request sent'); qc.invalidateQueries({ queryKey: ['friend-requests'] }); },
    onError: onErr,
  });
  const openMessage = useMutation({
    mutationFn: (uid: string) => messagingApi.openDirect(uid),
    onSuccess: (conv) => {
      dispatchOpenChat(conv.id);
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: onErr,
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">Members ({lg.members.length})</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lg.members.map((m) => {
          const uid = String(m.user_id);
          const isMe = uid === me;
          return (
            <Card
              key={m.user_id}
              className="flex min-w-0 flex-row items-center gap-3 p-4"
            >
              <UserAvatar
                userId={m.user_id}
                name={m.display_name}
                imageUrl={m.avatar_key}
                className="size-14 shrink-0"
                fallbackClassName="text-base"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {m.display_name}
                  {isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
                </p>
                {m.role === 'member' ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">Member</p>
                ) : (
                  <Badge size="sm" appearance="light" className="mt-1">{memberRoleLabel(m.role)}</Badge>
                )}
              </div>
              {!isMe && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={openMessage.isPending}
                    onClick={() => openMessage.mutate(uid)}
                  >
                    <MessageCircle className="size-4" />
                    <span className="hidden sm:inline">Message</span>
                  </Button>
                  {friendIds.has(uid) ? (
                    <Button size="sm" variant="outline" disabled>
                      Friends
                    </Button>
                  ) : pendingIds.has(uid) ? (
                    <Button size="sm" variant="outline" disabled>
                      Pending
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={addFriend.isPending}
                      onClick={() => addFriend.mutate(uid)}
                    >
                      <UserPlus className="size-4" />
                      <span className="hidden sm:inline">Add friend</span>
                    </Button>
                  )}
                  <MemberActionsMenu
                    member={m}
                    isCommish={isCommish}
                    canModerate={canModerate}
                    busy={remove.isPending || setRole.isPending || transfer.isPending}
                    onSetRole={(role) => setRole.mutate({ uid, role })}
                    onTransfer={() => transfer.mutate(uid)}
                    onRemove={() => remove.mutate(uid)}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ===================== MANAGE =====================
// Edit the league's name, description, and which sport-leagues members can bet
// on. Mirrors the Create-League sports picker, seeded with the current values.
function EditLeagueDetails({ lg }: { lg: LeagueDetail }) {
  const qc = useQueryClient();
  const [name, setName] = useState(lg.name);
  const [description, setDescription] = useState(lg.description ?? '');
  const [chosen, setChosen] = useState<{ id: string; label: string }[]>(
    lg.sports.map((s) => ({ id: s.sport_league_id, label: s.name || s.sport_league_id })),
  );

  const sportsQ = useQuery({ queryKey: ['sports'], queryFn: fetchSports });
  const [activeSport, setActiveSport] = useState('');
  const leaguesQ = useQuery({
    queryKey: ['sport-leagues', activeSport],
    queryFn: () => fetchLeagues(activeSport),
    enabled: !!activeSport,
  });
  const toggleLeague = (id: string, label: string) =>
    setChosen((cur) => (cur.some((c) => c.id === id) ? cur.filter((c) => c.id !== id) : [...cur, { id, label }]));

  const save = useMutation({
    mutationFn: () => leaguesApi.update(lg.id, {
      name: name.trim(),
      description: description.trim() || null,
      sports: chosen.map((c) => ({ sport_league_id: c.id, name: c.label })),
    }),
    onSuccess: () => {
      toast.success('League updated');
      qc.invalidateQueries({ queryKey: ['league', lg.id] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = name.trim().length > 0 && chosen.length > 0;

  const fileRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const saveLogo = async (logo_url: string | null) => {
    await leaguesApi.update(lg.id, { logo_url });
    qc.invalidateQueries({ queryKey: ['league', lg.id] });
    qc.invalidateQueries({ queryKey: ['leagues'] });
  };
  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    try {
      const webp = await imageToWebp(file, { size: 400, square: true });
      const asset = await mediaApi.upload('league_logo', webp);
      await saveLogo(asset.s3_key);
      toast.success('Logo updated');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };
  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      await saveLogo(null);
      toast.success('Logo removed');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <Card className="gap-3 p-5">
      <h2 className="text-base font-semibold text-foreground">League details</h2>

      <div className="flex flex-col gap-2">
        <Label>Logo</Label>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
        <div className="flex items-center gap-4">
          <LeagueAvatar name={name} logoUrl={lg.logo_url} id={lg.id} size={64} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={logoBusy} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" />
              {logoBusy ? 'Uploading…' : lg.logo_url ? 'Change logo' : 'Upload logo'}
            </Button>
            {lg.logo_url && (
              <Button size="sm" variant="outline" disabled={logoBusy} onClick={removeLogo}>
                <Trash2 className="size-4" />
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Description</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this league about? (shown on the invite page)"
          className="min-h-[72px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Available leagues</Label>
        <div className="flex flex-wrap gap-2">
          {(sportsQ.data ?? []).map((s) => (
            <button key={s.id} type="button" onClick={() => setActiveSport(s.slug)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeSport === s.slug ? 'border-primary bg-primary/5 text-foreground' : 'border-input text-muted-foreground'}`}>
              {s.displayName || s.name}
            </button>
          ))}
        </div>
        {activeSport && (
          <div className="mt-1 flex flex-wrap gap-2">
            {leaguesQ.isLoading && <span className="text-sm text-muted-foreground">Loading leagues…</span>}
            {(leaguesQ.data ?? []).map((l) => {
              const label = l.abbreviation || l.name;
              const id = l.sport_league_id || l.id;
              const on = chosen.some((c) => c.id === id);
              return (
                <button key={l.id} type="button" onClick={() => toggleLeague(id, label)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-muted-foreground'}`}>
                  {l.logo && (
                    <img src={l.logo} alt="" className="size-4 object-contain" loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {chosen.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {chosen.map((c) => (
              <span key={c.id} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-foreground">
                {c.label}
                <button type="button" onClick={() => toggleLeague(c.id, c.label)}><X className="size-3" /></button>
              </span>
            ))}
          </div>
        )}
        <span className="text-xs text-muted-foreground">The only games members can bet on.</span>
      </div>

      <Button className="self-start" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving…' : 'Save details'}
      </Button>
    </Card>
  );
}

export function LeagueManage() {
  const lg = useLeague();
  const router = useRouter();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['league', lg.id] });
  const onErr = (e: Error) => toast.error(e.message);

  const isMoney = lg.league_type !== 'pickem';
  const isH2H = lg.league_type === 'head_to_head';
  const [minC, setMinC] = useState(lg.min_wager_cents ? String(lg.min_wager_cents / 100) : '');
  const [maxC, setMaxC] = useState(lg.max_wager_cents ? String(lg.max_wager_cents / 100) : '');
  const [whoCanPropose, setWhoCanPropose] = useState(
    ((lg.rules || {}) as Record<string, unknown>).who_can_propose === 'commissioner' ? 'commissioner' : 'any',
  );

  const save = useMutation({
    mutationFn: () => leaguesApi.update(lg.id, {
      min_wager_cents: minC ? Math.round(Number(minC) * 100) : null,
      max_wager_cents: maxC ? Math.round(Number(maxC) * 100) : null,
      rules: { ...(lg.rules || {}), who_can_propose: whoCanPropose },
    }),
    onSuccess: () => { toast.success('Rules saved'); refresh(); },
    onError: onErr,
  });
  const advance = useMutation({
    mutationFn: () => leaguesApi.advancePeriod(lg.id),
    onSuccess: () => { toast.success('Period advanced'); refresh(); },
    onError: onErr,
  });
  const archive = useMutation({
    mutationFn: () => leaguesApi.archive(lg.id),
    onSuccess: () => { toast.success('League archived'); qc.invalidateQueries({ queryKey: ['leagues'] }); router.push('/'); },
    onError: onErr,
  });

  if (lg.my_role !== 'commissioner') {
    return <CenterCard><Settings className="size-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">Only the commissioner can manage this league.</p></CenterCard>;
  }
  return (
    <div className="flex flex-col gap-4">
      <EditLeagueDetails lg={lg} />

      {/* Rules */}
      <Card className="gap-3 p-5">
        <div className="flex items-center gap-2"><Settings className="size-5 text-muted-foreground" /><h2 className="text-base font-semibold text-foreground">Rules</h2></div>
        {isMoney ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Min wager (credits)</Label>
                <Input type="number" min={0} value={minC} onChange={(e) => setMinC(e.target.value)} placeholder="none" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Max wager (credits)</Label>
                <Input type="number" min={0} value={maxC} onChange={(e) => setMaxC(e.target.value)} placeholder="none" />
              </div>
            </div>
            {isH2H && (
              <div className="flex flex-col gap-1.5">
                <Label>Who can propose bets</Label>
                <Combobox
                  className="w-full"
                  value={whoCanPropose}
                  onChange={setWhoCanPropose}
                  options={[
                    { value: 'any', label: 'Any member' },
                    { value: 'commissioner', label: 'Commissioner only' },
                  ]}
                />
              </div>
            )}
            <Button className="self-start" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save rules'}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Pick’em leagues have no wager rules.</p>
        )}
      </Card>

      {/* Period control */}
      {lg.status === 'active' && (
        <Card className="gap-2 p-5">
          <h2 className="text-base font-semibold text-foreground">Period</h2>
          <p className="text-sm text-muted-foreground">
            Current: {lg.current_period ? `${lg.current_period.label} (${lg.current_period.status})` : '—'}
          </p>
          <Button
            variant="outline" className="self-start" disabled={advance.isPending}
            onClick={() => { if (confirm('Close the current period now and open the next?')) advance.mutate(); }}
          >
            {advance.isPending ? 'Advancing…' : 'Advance period'}
          </Button>
        </Card>
      )}

      {/* Danger zone */}
      <Card className="gap-2 p-5">
        <h2 className="text-base font-semibold text-foreground">Danger zone</h2>
        <p className="text-sm text-muted-foreground">Archiving removes the league from everyone’s dashboard. Balances and history are preserved.</p>
        <Button
          variant="outline" className="self-start text-destructive" disabled={archive.isPending}
          onClick={() => { if (confirm(`Archive "${lg.name}"? It will disappear from dashboards.`)) archive.mutate(); }}
        >
          {archive.isPending ? 'Archiving…' : 'Archive league'}
        </Button>
      </Card>
    </div>
  );
}

