'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLeague } from './league-context';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { cancelLocked, groupWagers, opponentsLabel, wagerPick, wagersApi, type BetType, type Wager, type WagerGroup, type WagerSide } from '@/lib/wagers';
import { FILTERS, filterWagers, type BetFilter } from '@/app/(app)/bets/bets-common';
import { BetSortMenu, sortGroups, type SortKey } from '@/components/bet-sort-menu';
import { CounterButton } from '@/components/counter-dialog';
import {
  fetchUpcomingEvents, fetchPeriodEvents, fetchEventOdds, fetchEvent, fetchSports, fetchLeagues, type SportEvent,
} from '@/lib/ingestor';
import { fetchEspnDetail, fetchEspnList, isFieldSport } from '@/lib/espn';
import { fetchTransactions, formatCredits, type WalletTxn } from '@/lib/wallet';
import { useAuth } from '@/auth/AuthContext';
import { EventCard, ScheduleBoard, TeamLogo, formatStart } from '@/components/event-card';
import { Combobox } from '@/components/ui/combobox';
import { Card } from '@/components/ui/card';
import { CenterCard } from '@/components/ui/center-card';
import { UserAvatar } from '@/components/user-avatar';
import { useProfileDialog } from '@/components/profile-dialog-context';
import { UserMiniCard } from '@/components/user-mini-card';
import { ListSearch } from '@/components/list-search';
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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Trophy, Medal, CalendarDays, Wallet, Settings, X, UserPlus, UserCheck, UserMinus, Clock, EllipsisVertical, MessageCircle, Check, CircleCheckBig, ImagePlus, Trash2, Lock, ArrowUpRight, ArrowDownRight, RotateCcw, Flag, ChevronRight, Search, type LucideIcon } from 'lucide-react';
import { friendsApi } from '@/lib/friends';
import { messagingApi } from '@/lib/messaging';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Scheduled games restricted to a league's own sport-leagues (so an NBA league
// never shows college-football games). Pass the league's sport_league_ids.
//
// Fetch each sport-league's OWN soonest games and merge, rather than one
// combined call: a single call caps at 50 events total, so an in-season daily
// sport (MLB has a game every day) fills all 50 slots and crowds out sports
// whose next game is weeks away (NFL opens in August, NHL in September). That
// left their tabs empty even though the schedule was there. Per-sport fetches
// guarantee every configured sport gets its own upcoming list.
//
// Each sport-league is fetched deep (up to 400 upcoming games) because the
// Sports tab pages through them a week at a time (see LeagueSports): this cap is
// the furthest-out horizon a viewer can reach with the "Next week" button, not a
// one-screen limit. 400 ≈ ~4 college-football weeks (a single CFB week runs 60+
// games) while staying under the ingestor's 500 ceiling. The old flat 50-cap
// truncated a busy CFB weekend and dropped later games entirely.
function useScheduled(sportLeagueIds: string[]) {
  return useQuery({
    queryKey: ['schedule', [...sportLeagueIds].sort()],
    queryFn: async () => {
      const lists = await Promise.all(
        sportLeagueIds.map((id) => fetchUpcomingEvents(400, [id])),
      );
      return lists.flat();
    },
    enabled: sportLeagueIds.length > 0,
  });
}

// Tournament-style events (golf, racing — any "field" sport, present or future)
// are only bettable once their competitor list is posted — the ESPN browse list
// reports field_size, populated only during tournament week. Returns a predicate:
// a field event is bettable only when its field is ready; a not-yet-posted or
// unknown one is not. Team/1v1 events (fixed matchups) are always bettable.
// Shares the ['espn-list', slug] cache with LeagueSportSchedule — no extra cost.
function useFieldReady(evs: SportEvent[]) {
  const slugs = Array.from(new Set(evs.filter((e) => isFieldSport(e.sport)).map((e) => e.sport)));
  const results = useQueries({
    queries: slugs.map((slug) => ({
      queryKey: ['espn-list', slug],
      queryFn: () => fetchEspnList(slug),
      staleTime: 5 * 60_000,
    })),
  });
  const ready = new Map<string, boolean>();
  for (const r of results) {
    for (const s of r.data ?? []) ready.set(s.external_id, (s.field_size ?? 0) > 0);
  }
  const loading = results.some((r) => r.isLoading);
  const isBettable = (ev: SportEvent) =>
    !isFieldSport(ev.sport) || ready.get(ev.external_id) === true;
  return { isBettable, loading };
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
                : `Picks lock ${formatStart(new Date(lockAt).toISOString())}.`}
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

      <div className="flex flex-col gap-4">
        {evs.map((ev) => {
          const g = graded.get(ev.external_id);
          const gradedLock = !!(g && g.correct !== null);
          const disabled = gradedLock || !canEdit;
          const cur = pick(ev.external_id);
          return (
            <div key={ev.external_id} className="flex flex-col gap-1.5">
              {/* caption: kickoff + graded result, matching the bet board */}
              <div className="flex items-center justify-between gap-2 px-0.5 text-xs">
                <span className="text-muted-foreground">{formatStart(ev.start_time)}</span>
                {gradedLock && (
                  <Badge size="sm" appearance="light" variant={g!.correct ? 'success' : 'destructive'}>
                    {g!.correct ? '✓ correct' : '✗ wrong'}
                  </Badge>
                )}
              </div>
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
              {ev.external_id === lastGameId && (
                <div className="mt-1 flex flex-wrap items-center gap-2 px-0.5">
                  <span className="text-sm font-bold text-foreground">Tie-breaker · total points</span>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    variant="lg"
                    value={tiebreaker}
                    onChange={(e) => setTiebreaker(e.target.value)}
                    disabled={disabled}
                    placeholder="e.g. 48"
                    className="h-11 w-24 text-base"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save bar pinned to the bottom of the page (open week only) */}
      {evs.length > 0 && editable && (
        <div className="fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-20 border-t border-border bg-background/95 backdrop-blur-sm lg:bottom-0">
          <div className="container flex items-center justify-between gap-3 py-3">
            <span className="text-xs text-muted-foreground">
              {picksLocked
                ? 'Picks are locked for this week.'
                : hasChanges
                  ? `${unsaved} unsaved pick${unsaved === 1 ? '' : 's'}${tbDirty ? ' + tie-breaker' : ''}`
                  : 'Tap a team to make a pick.'}
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

// Amount step: quick-pick stake chips. The first chip is the beer bet — no
// money, just pride and a round for the loser 🍺 — which the backend accepts as
// valid, skipping the wallet and the league min/max. Then dollar presets, and a
// "Custom" chip that reveals a free-type field for any other amount. Replaces
// the old always-on amount input.
const STAKE_PRESETS = [10, 20];
function StakeChips({ credits, onPick }: { credits: string; onPick: (v: string) => void }) {
  const val = Number(credits);
  const brag = credits.trim() !== '' && val === 0;
  const isPreset = STAKE_PRESETS.includes(val);
  const [customOpen, setCustomOpen] = useState(false);
  // Custom is active when the chip was tapped, or when the current stake is a
  // real amount that isn't the beer or a preset (e.g. reopening an edited bet).
  const custom = customOpen || (credits.trim() !== '' && !brag && !isPreset);
  const chip = (on: boolean) =>
    cn('inline-flex items-center justify-center rounded-full border font-semibold tabular-nums transition-colors',
      on ? STATE.selected : STATE.idle);
  const pick = (v: string) => { setCustomOpen(false); onPick(v); };
  return (
    <div className="flex flex-col gap-2">
      <Label>Amount</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={brag}
          aria-label="Beer — loser buys the round"
          title="Beer — loser buys the round"
          onClick={() => pick('0')}
          className={cn(chip(brag), 'gap-1.5 px-3 py-2 text-sm')}
        >
          <span aria-hidden className="text-base leading-none">🍺</span> Beer
        </button>
        {STAKE_PRESETS.map((amt) => {
          const on = !custom && val === amt;
          return (
            <button
              key={amt}
              type="button"
              aria-pressed={on}
              onClick={() => pick(String(amt))}
              className={cn(chip(on), 'px-4 py-2 text-sm')}
            >
              ${amt}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom}
          aria-label="Custom amount"
          onClick={() => { setCustomOpen(true); onPick(''); }}
          className={cn(chip(custom), 'px-4 py-2 text-sm')}
        >
          $
        </button>
        {/* Custom amount input appears inline, to the right of the $ chip. */}
        {custom && (
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            autoFocus
            placeholder="Amount"
            value={credits}
            onChange={(e) => onPick(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-full"
          />
        )}
      </div>
    </div>
  );
}

function wagerStatusBadge(w: Wager, me?: string) {
  // Labels are the wager status names, with the one exception the viewer cares
  // about: settled bets read "Won" / "Lost" rather than "Settled". Cancelled
  // shows nothing (it sits in its own group).
  switch (w.status) {
    case 'open':
      return <Badge size="sm" variant="secondary" appearance="light">Open</Badge>;
    case 'accepted':
      return <Badge size="sm" variant="secondary" appearance="light">Accepted</Badge>;
    case 'completed':
      return <Badge size="sm" variant="secondary" appearance="light">Completed</Badge>;
    case 'settled': {
      const won = w.winner_user_id === me;
      return (
        <Badge size="sm" variant={won ? 'success' : 'destructive'} appearance="light">
          {won ? 'Won' : 'Lost'}
        </Badge>
      );
    }
    case 'refunded':
      return <Badge size="sm" variant="secondary" appearance="light">Refunded</Badge>;
    case 'declined':
      return <Badge size="sm" variant="secondary" appearance="light">Declined</Badge>;
    default:
      return null;
  }
}

// A terse status indicator: a muted icon standing in for a text label (Locked,
// Cancelled). Hover / screen-reader text still carries the word.
export function StatusIcon({ icon: Icon, label }: { icon: typeof Lock; label: string }) {
  return (
    <span className="flex items-center justify-center text-muted-foreground" title={label} aria-label={label}>
      <Icon className="size-5" />
    </span>
  );
}

// A sportsbook-style bet card: the matchup and score on the left, the viewer's
// pick and its action on the right, the opponents (folded when a bet went to
// several friends) and stake across the top. Takes a WagerGroup so one card can
// stand for a batch — Cancel / Confirm then act on every sibling at once.
// A beer bet (no money, loser buys the round) renders as the beer glass in place
// of a dollar figure on the compact cards; real stakes render the signed amount.
function StakeText({ cents, sign }: { cents: number; sign?: string }) {
  if (cents === 0) {
    return <span role="img" aria-label="Beer — loser buys the round" className="inline-block align-[-0.1em] text-[2.2em] leading-none">🍺</span>;
  }
  return (
    <>
      {sign ?? ''}
      {formatCredits(cents)}
    </>
  );
}

// The full stake phrase for the bet-confirmation summary: a beer bet spells out
// "Beer (loser buys the round)"; a real stake is the play-money dollar amount.
function StakeSummary({ cents }: { cents: number }) {
  if (cents === 0) {
    return (
      <span className="inline-flex items-center gap-1">
        <span aria-hidden>🍺</span>
        Beer <span className="text-muted-foreground">(loser buys the round)</span>
      </span>
    );
  }
  return <>{formatCredits(cents)}</>;
}

// Read-only detail view of an existing wager — matchup + scores, the viewer's
// pick, stake, opponent and outcome. Opened from a ledger row's pick chip or
// settled result. No editing: bets are placed from the Schedule tab.
function BetDetailsDialog({
  group,
  me,
  ev,
  open,
  onOpenChange,
}: {
  group: WagerGroup;
  me?: string;
  ev?: SportEvent | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const w = group.rep;
  const side = group.viewerSide;
  const field = !!ev && isFieldSport(ev.sport);
  const isTotal = w.bet_type === 'total';
  const settled = w.status === 'settled';
  const decided = settled || w.status === 'completed';
  const iWon = decided && !!w.winner_user_id && w.winner_user_id === me;
  const iLost = decided && !!w.winner_user_id && w.winner_user_id !== me;
  const started = !!ev && ev.status !== 'scheduled' && ev.status !== 'cancelled';
  const final = ev?.status === 'final';
  const hs = ev?.home_score ?? null;
  const as = ev?.away_score ?? null;
  const awayLost = final && hs != null && as != null && hs > as;
  const homeLost = final && hs != null && as != null && as > hs;
  const betTypeLabel = w.bet_type === 'moneyline' ? 'Straight up' : w.bet_type === 'spread' ? 'Spread' : 'Total';
  const opp = group.opponents[0];
  const names = group.opponents.map((o) => o.name);

  // Board grid, same rules as WagerBetCard but at dialog size. (Kept inline
  // rather than shared — the card and the modal are separate surfaces.)
  const spreadLn = w.line != null ? (side === w.proposer_side ? w.line : -w.line) : null;
  const pickForRow = (rowKey: 'home' | 'away'): { label: string; mine: boolean } => {
    if (isTotal) {
      const mine = (rowKey === 'away' && side === 'over') || (rowKey === 'home' && side === 'under');
      return { label: `${rowKey === 'away' ? 'O' : 'U'} ${w.line ?? ''}`.trim(), mine };
    }
    if (w.bet_type === 'spread' && spreadLn != null) {
      const mine = rowKey === side;
      const ln = mine ? spreadLn : -spreadLn;
      return { label: `${ln > 0 ? '+' : ''}${ln}`, mine };
    }
    const mine = rowKey === side;
    return { label: mine ? 'ML' : '', mine };
  };
  const awayPk = pickForRow('away');
  const homePk = pickForRow('home');
  const voided = w.status === 'cancelled' || w.status === 'declined' || w.status === 'refunded';
  const toneBg = iWon ? 'bg-brand/20' : iLost ? 'bg-destructive/20'
    : decided || voided ? 'bg-muted/60' : 'bg-blue-500/20';
  const toneText = iWon ? 'text-brand' : iLost ? 'text-destructive'
    : decided || voided ? 'text-muted-foreground' : 'text-blue-500';
  const resultTone = iWon ? 'text-brand' : iLost ? 'text-destructive' : 'text-muted-foreground';
  const teamBacked = (rowKey: 'home' | 'away') => !isTotal && rowKey === side;
  const rows = [
    { name: ev?.away_team ?? w.away_team, logo: ev?.away_logo ?? null, abbr: ev?.away_abbr ?? w.away_team, score: as, lost: awayLost, pk: awayPk },
    { name: ev?.home_team ?? w.home_team, logo: ev?.home_logo ?? null, abbr: ev?.home_abbr ?? w.home_team, score: hs, lost: homeLost, pk: homePk },
  ];
  const cellBase = 'flex h-12 flex-col items-center justify-center rounded-md text-sm font-semibold leading-tight tabular-nums';
  const teamCls = (backed: boolean) => backed ? toneBg : 'bg-muted/60';
  const pickCls = (mine: boolean) => mine ? cn(toneBg, toneText) : 'bg-muted/60 text-muted-foreground';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="sr-only">{field ? (w.event_name || 'Matchup') : `${w.away_team} @ ${w.home_team}`}</DialogTitle>
        <DialogDescription className="sr-only">Bet details</DialogDescription>

        {/* opponent + outcome header */}
        <div className="flex items-center gap-3">
          {opp && (
            <UserAvatar userId={opp.id} name={opp.name} imageUrl={opp.avatar_key} className="size-11 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-foreground">{opponentsLabel(names)}</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.iAmProposer ? 'You challenged' : 'Challenged you'}
            </div>
          </div>
          <div className="ml-auto shrink-0">
            {decided ? (
              <Badge size="sm" appearance="light" variant={iWon ? 'success' : iLost ? 'destructive' : 'secondary'}>
                {iWon ? 'Won ' : iLost ? 'Lost ' : 'Push'}
                {(iWon || iLost) && <StakeText cents={w.amount_cents} sign={iWon ? '+' : '−'} />}
              </Badge>
            ) : (
              wagerStatusBadge(w, me)
            )}
          </div>
        </div>

        <DialogBody className="mt-4 flex flex-col">
          {field ? (
            <div className={cn('rounded-md bg-muted/60 px-3 py-3 text-center text-base font-semibold', iWon ? 'text-brand' : iLost ? 'text-destructive' : 'text-foreground')}>
              {wagerPick(w, side)}
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem] gap-1.5">
              <div className={cn('flex h-12 items-center gap-2.5 rounded-md px-2.5', teamCls(teamBacked('away')))}>
                <TeamLogo src={rows[0].logo} name={rows[0].abbr} size="sm" />
                <span className={cn('min-w-0 flex-1 truncate text-sm', rows[0].lost ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{rows[0].name}</span>
                {started && rows[0].score != null && <span className={cn('text-base font-bold tabular-nums', rows[0].lost ? 'text-muted-foreground' : 'text-foreground')}>{rows[0].score}</span>}
              </div>
              <div className={cn(cellBase, pickCls(awayPk.mine))}>{awayPk.label || '—'}</div>
              <div className="row-span-2 flex flex-col items-center justify-center gap-1 self-stretch rounded-md bg-muted/60 px-1">
                {decided ? (
                  <span className={cn('text-xl font-extrabold tabular-nums', resultTone)}><StakeText cents={w.amount_cents} sign={iWon ? '+' : iLost ? '−' : ''} /></span>
                ) : (
                  wagerStatusBadge(w, me)
                )}
              </div>
              <div className={cn('flex h-12 items-center gap-2.5 rounded-md px-2.5', teamCls(teamBacked('home')))}>
                <TeamLogo src={rows[1].logo} name={rows[1].abbr} size="sm" />
                <span className={cn('min-w-0 flex-1 truncate text-sm', rows[1].lost ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{rows[1].name}</span>
                {started && rows[1].score != null && <span className={cn('text-base font-bold tabular-nums', rows[1].lost ? 'text-muted-foreground' : 'text-foreground')}>{rows[1].score}</span>}
              </div>
              <div className={cn(cellBase, pickCls(homePk.mine))}>{homePk.label || '—'}</div>
            </div>
          )}
          <div className="mt-3 text-center text-xs text-muted-foreground">
            {betTypeLabel} · <StakeText cents={w.amount_cents} /> stake · {field && w.event_name ? w.event_name : `${w.away_team} @ ${w.home_team}`}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function WagerBetCard({
  group,
  me,
  ev,
  actions,
  leagueName,
}: {
  group: WagerGroup;
  me?: string;
  ev?: SportEvent | null;
  actions?: ReactNode;
  /** Shown on the cross-league /bets page so each card names its league. */
  leagueName?: string;
}) {
  const w = group.rep;
  const side = group.viewerSide;
  const profile = useProfileDialog();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const field = !!ev && isFieldSport(ev.sport);
  const isTotal = w.bet_type === 'total';

  // Opponents line + verb. Once settled the header narrates the outcome.
  const names = group.opponents.map((o) => o.name);
  const settled = w.status === 'settled';
  // The outcome is known once a bet is completed (game final) or settled, so the
  // pick chip + rail can show win/loss even before the payout is confirmed.
  const decided = settled || w.status === 'completed';
  const iWon = decided && !!w.winner_user_id && w.winner_user_id === me;
  const iLost = decided && !!w.winner_user_id && w.winner_user_id !== me;
  const verb = iWon ? 'beat' : iLost ? 'lost to' : 'vs';

  // Game score line. Winner (higher score) stays bright once final; the loser mutes.
  const homeAbbr = ev?.home_abbr ?? w.home_team;
  const awayAbbr = ev?.away_abbr ?? w.away_team;
  const started = !!ev && ev.status !== 'scheduled' && ev.status !== 'cancelled';
  const final = ev?.status === 'final';
  const hs = ev?.home_score ?? null;
  const as = ev?.away_score ?? null;
  const homeLost = final && hs != null && as != null && as > hs;
  const awayLost = final && hs != null && as != null && hs > as;
  const rows = [
    { key: 'away', name: ev?.away_team ?? w.away_team, logo: ev?.away_logo ?? null, abbr: awayAbbr, score: as, lost: awayLost },
    { key: 'home', name: ev?.home_team ?? w.home_team, logo: ev?.home_logo ?? null, abbr: homeAbbr, score: hs, lost: homeLost },
  ];

  // Per-side pick line for the board's "Pick" column: the viewer's side shows
  // their line, highlighted by outcome; the other side shows the opposing line,
  // muted. Totals follow the board convention (Over on away, Under on home).
  const spreadLn = w.line != null ? (side === w.proposer_side ? w.line : -w.line) : null;
  const pickForRow = (rowKey: 'home' | 'away'): { label: string; mine: boolean } => {
    if (isTotal) {
      const mine = (rowKey === 'away' && side === 'over') || (rowKey === 'home' && side === 'under');
      return { label: `${rowKey === 'away' ? 'O' : 'U'} ${w.line ?? ''}`.trim(), mine };
    }
    if (w.bet_type === 'spread' && spreadLn != null) {
      const mine = rowKey === side;
      const ln = mine ? spreadLn : -spreadLn;
      return { label: `${ln > 0 ? '+' : ''}${ln}`, mine };
    }
    const mine = rowKey === side; // moneyline — no number; the side is just marked
    return { label: mine ? 'ML' : '', mine };
  };
  const awayPk = pickForRow('away');
  const homePk = pickForRow('home');

  // One outcome colour, shown as a muted background tint on the backed team cell
  // and the pick cell: green win / red loss / blue in-flight (open, accepted,
  // live) / grey for a settled-neutral push or a voided bet.
  const voided = w.status === 'cancelled' || w.status === 'declined' || w.status === 'refunded';
  const toneBg = iWon ? 'bg-brand/20' : iLost ? 'bg-destructive/20'
    : decided || voided ? 'bg-muted/60' : 'bg-blue-500/20';
  const toneText = iWon ? 'text-brand' : iLost ? 'text-destructive'
    : decided || voided ? 'text-muted-foreground' : 'text-blue-500';
  const resultTone = iWon ? 'text-brand' : iLost ? 'text-destructive' : 'text-muted-foreground';
  const railTone = iWon ? 'bg-brand' : iLost ? 'bg-destructive'
    : decided || voided ? 'bg-muted-foreground/50' : 'bg-blue-500';
  const outcomeTone = toneText;

  // Highlight the team cell the viewer backed (spread / moneyline only).
  const teamBacked = (rowKey: 'home' | 'away') => !isTotal && rowKey === side;
  // Single opponent's name opens their profile; the card opens read-only details.
  const soloOpp = group.opponents.length === 1 ? group.opponents[0] : null;
  const when = ev?.start_time ? formatStart(ev.start_time) : null;
  const cellBase = 'flex h-11 flex-col items-center justify-center rounded-md text-xs font-semibold leading-tight tabular-nums';
  const teamCls = (backed: boolean) =>
    backed ? toneBg : 'bg-muted/60';
  const pickCls = (mine: boolean) =>
    mine ? cn(toneBg, toneText) : 'bg-muted/60 text-muted-foreground';

  // What sits in the tall Result cell: interactive buttons when present, else the
  // net payout once decided, else a live/pending status badge.
  const resultInner = actions ? (
    <div className="flex w-full flex-col items-stretch gap-1" onClick={(e) => e.stopPropagation()}>{actions}</div>
  ) : settled || decided ? (
    <span className={cn('text-base font-extrabold tabular-nums', resultTone)}>
      <StakeText cents={w.amount_cents} sign={iWon ? '+' : iLost ? '−' : ''} />
    </span>
  ) : (
    wagerStatusBadge(w, me)
  );

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetailsOpen(true)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault();
            setDetailsOpen(true);
          }
        }}
        className="cursor-pointer border-b border-border px-3 py-3 last:border-b-0 hover:bg-muted/20"
      >
        {/* caption: state dot + kickoff on the left, opponent + outcome on the right */}
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5 text-xs">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('size-2 shrink-0 rounded-full', railTone)} />
            <span className="truncate text-muted-foreground">
              {leagueName && <span className="font-medium text-foreground/80">{leagueName} · </span>}
              {when ?? (field && w.event_name ? w.event_name : 'Bet')}
            </span>
          </span>
          <span className={cn('flex shrink-0 items-center gap-1 font-medium', outcomeTone)}>
            {verb}{' '}
            {soloOpp && profile ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  profile.openProfile({ userId: soloOpp.id, name: soloOpp.name, avatarKey: soloOpp.avatar_key });
                }}
                className="underline-offset-2 hover:underline"
              >
                {soloOpp.name}
              </button>
            ) : (
              <span>{opponentsLabel(names)}</span>
            )}
          </span>
        </div>

        {field ? (
          // Field sports (golf, racing) have no home/away matchup — pick is the headline.
          <div className="grid grid-cols-[minmax(0,1fr)_5.25rem] gap-1.5">
            <div className={cn('flex h-11 items-center rounded-md bg-muted/60 px-2.5 text-sm font-semibold', iWon ? 'text-brand' : iLost ? 'text-destructive' : 'text-foreground')}>
              <span className="min-w-0 truncate">{wagerPick(w, side)}</span>
            </div>
            <div className="flex h-11 flex-col items-center justify-center gap-1 rounded-md bg-muted/60 px-1">
              {resultInner}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_5.25rem] gap-1.5">
            {/* away team */}
            <div className={cn('flex h-11 items-center gap-2 rounded-md px-2.5', teamCls(teamBacked('away')))}>
              <TeamLogo src={rows[0].logo} name={rows[0].abbr} size="sm" />
              <span className={cn('min-w-0 flex-1 truncate text-sm', rows[0].lost ? 'text-muted-foreground' : 'font-medium text-foreground')}>{rows[0].name}</span>
              {started && rows[0].score != null && <span className={cn('text-sm font-bold tabular-nums', rows[0].lost ? 'text-muted-foreground' : 'text-foreground')}>{rows[0].score}</span>}
            </div>
            {/* away pick */}
            <div className={cn(cellBase, pickCls(awayPk.mine))}>{awayPk.label || '—'}</div>
            {/* result — spans both rows */}
            <div className="row-span-2 flex flex-col items-center justify-center gap-1 self-stretch rounded-md bg-muted/60 px-1">
              {resultInner}
            </div>
            {/* home team */}
            <div className={cn('flex h-11 items-center gap-2 rounded-md px-2.5', teamCls(teamBacked('home')))}>
              <TeamLogo src={rows[1].logo} name={rows[1].abbr} size="sm" />
              <span className={cn('min-w-0 flex-1 truncate text-sm', rows[1].lost ? 'text-muted-foreground' : 'font-medium text-foreground')}>{rows[1].name}</span>
              {started && rows[1].score != null && <span className={cn('text-sm font-bold tabular-nums', rows[1].lost ? 'text-muted-foreground' : 'text-foreground')}>{rows[1].score}</span>}
            </div>
            {/* home pick */}
            <div className={cn(cellBase, pickCls(homePk.mine))}>{homePk.label || '—'}</div>
          </div>
        )}
      </div>

      <BetDetailsDialog group={group} me={me} ev={ev} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </>
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
          <Button size="sm" variant="outline" className="w-full" disabled={reqCancelM.isPending} onClick={() => reqCancelM.mutate(ids)}>Cancel</Button>
        );
      }
      if (w.cancel_requested_by === me) {
        return <span className="text-center text-[11px] text-muted-foreground">Requested</span>;
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

// The next N games across every sport, or one sport's board — as tabs, with
// "Upcoming" (soonest games league-wide) as the landing tab.
const UPCOMING_LIMIT = 10;

export function LeagueSports() {
  const lg = useLeague();
  const { user } = useAuth();
  const me = user?.id;
  const canBet = lg.status === 'active';
  const [tab, setTab] = useState<string>('upcoming'); // 'upcoming' | sport_league_id
  const [selected, setSelected] = useState<SportEvent | null>(null);
  // How many weeks of a sport's schedule to reveal (per-sport tabs only). The
  // "Show next week" button bumps this; switching tabs restarts at one week.
  const [weeksShown, setWeeksShown] = useState(1);
  useEffect(() => { setWeeksShown(1); }, [tab]);
  const [query, setQuery] = useState('');

  const events = useScheduled(lg.sports.map((s) => s.sport_league_id));
  const evs = events.data ?? [];
  // Tournament-style events (golf, racing) aren't tappable until their field is posted.
  const { isBettable } = useFieldReady(evs);

  // Sports as tabs, alphabetical.
  const sortedSports = [...lg.sports].sort((a, b) =>
    (a.name || a.sport_league_id).localeCompare(b.name || b.sport_league_id),
  );

  const byStart = (a: SportEvent, b: SportEvent) =>
    (a.start_time ?? '').localeCompare(b.start_time ?? '');
  const ms = (e: SportEvent) => new Date(e.start_time ?? 0).getTime();

  // Team-name filter. While active it searches the tab's full set (all fetched
  // weeks) and suspends week paging, so a searched team's later games surface no
  // matter how far out they are.
  const q = query.trim().toLowerCase();
  const matchesQuery = (e: SportEvent) =>
    [e.home_team, e.away_team, e.home_abbr, e.away_abbr, e.name, e.short_name].some(
      (v) => (v ?? '').toLowerCase().includes(q),
    );

  // Per-sport tabs page a week at a time: show every game up to `weeksShown`
  // weeks past that sport's FIRST upcoming game. Anchoring to the first game
  // (not "now") means a sport whose next game is weeks out still fills week one
  // instead of showing an empty screen. `hasMoreWeeks` drives the button below.
  const sportSorted =
    tab === 'upcoming' ? [] : evs.filter((e) => e.sport_league_id === tab).sort(byStart);
  const windowEnd = sportSorted.length
    ? ms(sportSorted[0]) + weeksShown * 7 * 24 * 60 * 60 * 1000
    : 0;
  const hasMoreWeeks = !q && tab !== 'upcoming' && sportSorted.some((e) => ms(e) > windowEnd);
  const base = tab === 'upcoming' ? [...evs].sort(byStart) : sportSorted;
  const shown = q
    ? base.filter(matchesQuery)
    : tab === 'upcoming'
      ? base.slice(0, UPCOMING_LIMIT)
      : base.filter((e) => ms(e) <= windowEnd);
  const teamEvs = shown.filter((e) => !isFieldSport(e.sport));
  const fieldEvs = shown.filter((e) => isFieldSport(e.sport));

  if (lg.sports.length === 0) {
    return (
      <CenterCard>
        <Trophy className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No sports set for this league yet.</p>
        {lg.my_role === 'commissioner' && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/leagues/${lg.id}/manage`}>Add sports</Link>
          </Button>
        )}
      </CenterCard>
    );
  }

  const pill = (active: boolean) =>
    cn(
      'shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-colors',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-input text-muted-foreground hover:bg-muted hover:text-foreground',
    );

  return (
    <div className="flex flex-col gap-4">
      <ListSearch value={query} onChange={setQuery} placeholder="Search teams" />
      {/* Scrollable pill tabs: Upcoming + each sport. */}
      <div className="w-full min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-full gap-2">
          <button type="button" onClick={() => setTab('upcoming')} className={pill(tab === 'upcoming')}>
            Upcoming
          </button>
          {sortedSports.map((s) => (
            <button
              key={s.sport_league_id}
              type="button"
              onClick={() => setTab(s.sport_league_id)}
              className={pill(tab === s.sport_league_id)}
            >
              {s.name || s.sport_league_id}
            </button>
          ))}
        </div>
      </div>

      {tab === 'upcoming' && !q && (
        <p className="text-xs text-muted-foreground">
          The next {UPCOMING_LIMIT} games across all your sports{canBet ? ' · tap a game to bet' : ''}.
        </p>
      )}

      {events.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : shown.length === 0 ? (
        <CenterCard>
          <CalendarDays className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {q ? `No games match “${query.trim()}”.` : 'No upcoming games right now.'}
          </p>
        </CenterCard>
      ) : (
        <div className="flex flex-col gap-4">
          {teamEvs.length > 0 && (
            <ScheduleBoard
              events={teamEvs}
              onSelect={canBet ? (ev) => setSelected(ev) : undefined}
            />
          )}
          {fieldEvs.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              {fieldEvs.map((ev) => (
                <EventCard
                  key={ev.external_id}
                  event={ev}
                  onSelect={canBet && isBettable(ev) ? () => setSelected(ev) : undefined}
                />
              ))}
            </div>
          )}
          {hasMoreWeeks && (
            <Button
              variant="outline"
              className="h-12 w-full"
              onClick={() => setWeeksShown((w) => w + 1)}
            >
              Show next week
            </Button>
          )}
        </div>
      )}

      {canBet && (
        <>
          <ScheduleBetDialog
            lg={lg}
            me={me}
            event={selected && !isFieldSport(selected.sport) ? selected : null}
            open={!!selected && !isFieldSport(selected.sport)}
            onOpenChange={(o) => { if (!o) setSelected(null); }}
          />
          <MatchupBetDialog
            lg={lg}
            me={me}
            event={selected && isFieldSport(selected.sport) ? selected : null}
            open={!!selected && isFieldSport(selected.sport)}
            onOpenChange={(o) => { if (!o) setSelected(null); }}
          />
        </>
      )}
    </div>
  );
}

// The Upcoming tab (own page): the next N games across the league's sports as
// tap-to-bet cards, reusing the same EventCard + wager dialogs as the Sports
// hub. Rendered on all breakpoints — it's a standalone page now, split out from
// the Feed tab.
export function LeagueUpcomingGames() {
  const lg = useLeague();
  const { user } = useAuth();
  const me = user?.id;
  const canBet = lg.status === 'active';
  const [selected, setSelected] = useState<SportEvent | null>(null);

  const events = useScheduled(lg.sports.map((s) => s.sport_league_id));
  const shown = [...(events.data ?? [])]
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    .slice(0, UPCOMING_LIMIT);
  const teamEvs = shown.filter((e) => !isFieldSport(e.sport));
  const fieldEvs = shown.filter((e) => isFieldSport(e.sport));
  // Tournament-style events (golf, racing) aren't tappable until their field is posted.
  const { isBettable } = useFieldReady(shown);

  // Pick'em leagues don't place head-to-head bets, so the tap-to-bet board is
  // hidden there entirely.
  if (lg.league_type === 'pickem') return null;
  if (lg.sports.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {events.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming games.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {teamEvs.length > 0 && (
            // Sportsbook table (Spread/Total/Winner). overflow-x-auto guards the
            // narrow 1/3 aside from breaking layout if the columns don't fit.
            <div className="overflow-x-auto">
              <ScheduleBoard events={teamEvs} onSelect={canBet ? (ev) => setSelected(ev) : undefined} />
            </div>
          )}
          {fieldEvs.map((ev) => (
            <EventCard
              key={ev.external_id}
              event={ev}
              onSelect={canBet && isBettable(ev) ? () => setSelected(ev) : undefined}
            />
          ))}
        </div>
      )}
      {canBet && (
        <>
          <ScheduleBetDialog
            lg={lg}
            me={me}
            event={selected && !isFieldSport(selected.sport) ? selected : null}
            open={!!selected && !isFieldSport(selected.sport)}
            onOpenChange={(o) => { if (!o) setSelected(null); }}
          />
          <MatchupBetDialog
            lg={lg}
            me={me}
            event={selected && isFieldSport(selected.sport) ? selected : null}
            open={!!selected && isFieldSport(selected.sport)}
            onOpenChange={(o) => { if (!o) setSelected(null); }}
          />
        </>
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

  // Field sports (golf, racing): a tournament is only bettable once its field is
  // published (tournament week) — the browse list reports field_size, populated
  // only then. Split the scheduled tournaments into bettable now vs. still
  // upcoming so the schedule shows what you can actually act on. Team sports are
  // always bettable, so this is a no-op for them.
  const fieldSport = evs.length > 0 && isFieldSport(evs[0].sport);
  const sportSlug = evs[0]?.sport;
  const espnListQ = useQuery({
    queryKey: ['espn-list', sportSlug],
    queryFn: () => fetchEspnList(sportSlug!),
    enabled: fieldSport && !!sportSlug,
    staleTime: 5 * 60_000,
  });
  const fieldReady = new Map((espnListQ.data ?? []).map((s) => [s.external_id, (s.field_size ?? 0) > 0]));
  const ready = fieldSport ? evs.filter((e) => fieldReady.get(e.external_id) === true) : evs;
  const upcoming = fieldSport ? evs.filter((e) => fieldReady.get(e.external_id) !== true) : [];
  const fieldLoading = fieldSport && espnListQ.isLoading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/leagues/${lg.id}/sports`}>Sports</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{label}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-2.5">
          <SportIcon logo={metaFor(sportLeagueId).logo} emoji={metaFor(sportLeagueId).emoji} label={label} px={36} />
          <h2 className="text-lg font-semibold text-foreground">{label}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {fieldSport
            ? (canBet ? 'Pick a matchup once a tournament’s field is posted' : 'Tournaments')
            : `Upcoming games${canBet ? ' · tap a game to challenge a friend' : ''}`}
        </p>
      </div>

      {!sport && (
        <CenterCard>
          <p className="text-sm text-muted-foreground">That sport isn’t part of this league.</p>
        </CenterCard>
      )}
      {sport && (events.isLoading || fieldLoading) && (
        <div className="grid grid-cols-1 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      )}
      {sport && !events.isLoading && !fieldLoading && evs.length === 0 && (
        <CenterCard>
          <CalendarDays className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No upcoming {label} {fieldSport ? 'tournaments' : 'games'} right now.
          </p>
        </CenterCard>
      )}
      {sport && !events.isLoading && !fieldLoading && evs.length > 0 && (
        <>
          {ready.length > 0 && (
            fieldSport ? (
              // Golf/racing tournaments have no two-team odds — keep the cards.
              <div className="grid grid-cols-1 gap-4">
                {ready.map((ev: SportEvent) => (
                  <EventCard key={ev.external_id} event={ev} onSelect={canBet ? () => setSelected(ev) : undefined} />
                ))}
              </div>
            ) : (
              // Team sports: the sportsbook-style Spread / Total / Winner board.
              <ScheduleBoard events={ready} onSelect={canBet ? (ev) => setSelected(ev) : undefined} />
            )
          )}
          {fieldSport && ready.length === 0 && (
            <CenterCard>
              <CalendarDays className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No tournaments are open for betting yet — the field is posted a few days before each event.
              </p>
            </CenterCard>
          )}
          {upcoming.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Upcoming · field opens tournament week
              </h3>
              <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
                {upcoming.map((ev: SportEvent) => (
                  <div key={ev.external_id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{ev.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatStart(ev.start_time)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {canBet && (
        <>
          <ScheduleBetDialog
            lg={lg}
            me={me}
            event={selected && !isFieldSport(selected.sport) ? selected : null}
            open={!!selected && !isFieldSport(selected.sport)}
            onOpenChange={(o) => { if (!o) setSelected(null); }}
          />
          <MatchupBetDialog
            lg={lg}
            me={me}
            event={selected && isFieldSport(selected.sport) ? selected : null}
            open={!!selected && isFieldSport(selected.sport)}
            onOpenChange={(o) => { if (!o) setSelected(null); }}
          />
        </>
      )}
    </div>
  );
}

// ===================== STANDINGS =====================
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
  const roleById = new Map(lg.members.map((m) => [String(m.user_id), m.role]));

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground sm:text-lg">Standings ({rows.length})</h2>
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const rank = i + 1;
          const isMe = String(r.user_id) === me;
          return (
            <Card
              key={r.user_id}
              className="flex-row items-center gap-2 p-3"
            >
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
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
                  {memberRoleLabel(roleById.get(String(r.user_id)) ?? 'member')}
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
// Read/write the ?week=<period index> query param so a specific week's results
// are linkable, savable and shareable. The URL is the source of truth for the
// selected week; changing the picker rewrites it in place (no navigation). Needs
// a Suspense boundary above it (the results route provides one) for useSearchParams.
function useWeekParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const week = params.get('week');
  const setWeek = (index: number) => {
    const next = new URLSearchParams(params.toString());
    next.set('week', String(index));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return { week, setWeek };
}

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

// "Week ending MM/DD" from the period's end date; falls back to the period's own
// label ("Week 3" / "Other") when there's no end date to format.
function weekEndingLabel(p: LeaguePeriod): string {
  if (p.ends_at) {
    const d = new Date(p.ends_at);
    if (!Number.isNaN(d.getTime())) {
      return `Week ending ${d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}`;
    }
  }
  return p.label;
}

type OppRecon = { name: string; netCents: number; netBeers: number; wins: number; losses: number };
type Recon = { wins: number; losses: number; netCents: number; netBeers: number; perOpp: Map<string, OppRecon> };

// Net out a week's decided bets from the viewer's perspective: dollars and beers
// tracked separately (they're different currencies), overall and per opponent.
// Pushes and refunds carry no result, so they don't move the tally.
function reconcile(wagers: Wager[], me: string): Recon {
  const perOpp = new Map<string, OppRecon>();
  let wins = 0, losses = 0, netCents = 0, netBeers = 0;
  for (const w of wagers) {
    if (w.status !== 'settled' || w.winner_user_id == null) continue;
    const iWon = w.winner_user_id === me;
    const oppId = w.proposer_id === me ? w.acceptor_id : w.proposer_id;
    const oppName = w.proposer_id === me ? w.acceptor_name : w.proposer_name;
    const beer = w.amount_cents === 0;
    const o = perOpp.get(oppId) ?? { name: oppName, netCents: 0, netBeers: 0, wins: 0, losses: 0 };
    if (iWon) {
      wins++; o.wins++;
      if (beer) { netBeers++; o.netBeers++; } else { netCents += w.amount_cents; o.netCents += w.amount_cents; }
    } else {
      losses++; o.losses++;
      if (beer) { netBeers--; o.netBeers--; } else { netCents -= w.amount_cents; o.netCents -= w.amount_cents; }
    }
    perOpp.set(oppId, o);
  }
  return { wins, losses, netCents, netBeers, perOpp };
}

// Signed play-money delta: +$30 (up/green) or −$25 (down/red).
function MoneyDelta({ cents }: { cents: number }) {
  const up = cents > 0;
  return (
    <span className={cn('font-semibold tabular-nums', up ? 'text-brand' : 'text-destructive')}>
      {up ? '+' : '−'}{formatCredits(Math.abs(cents))}
    </span>
  );
}

// Signed beer delta: +1 🍺 (up/green) or −2 🍺 (down/red).
function BeerDelta({ count }: { count: number }) {
  const up = count > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-semibold tabular-nums', up ? 'text-brand' : 'text-destructive')}>
      {up ? '+' : '−'}{Math.abs(count)}
      <span aria-hidden>🍺</span>
    </span>
  );
}

// One opponent's net for the week: a friendly "you won / you owe" verb when it's
// a single currency, or just the two signed deltas when it's a mix of both.
function ReconAmount({ o }: { o: OppRecon }) {
  const parts: ReactNode[] = [];
  if (o.netCents !== 0) parts.push(<MoneyDelta key="m" cents={o.netCents} />);
  if (o.netBeers !== 0) parts.push(<BeerDelta key="b" count={o.netBeers} />);
  if (parts.length === 0) return <span className="text-sm text-muted-foreground">even</span>;
  const verb = parts.length === 1 ? ((o.netCents || o.netBeers) > 0 ? 'you won' : 'you owe') : '';
  return (
    <span className="flex items-center gap-1.5 text-sm">
      {verb && <span className="text-muted-foreground">{verb}</span>}
      {parts}
    </span>
  );
}

// Settled head-to-head bets for one week: a date picker, a reconciliation summary
// (net dollars + beers, overall and per opponent), then that week's bet cards.
function HeadToHeadResults({ lg }: { lg: LeagueDetail }) {
  const { user } = useAuth();
  const me = user?.id ?? '';
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

  const { week, setWeek } = useWeekParam();

  if (betsQ.isLoading || periodsQ.isLoading) return <Skeleton className="h-40 rounded-xl" />;

  // Bucket settled bets by week; only weeks that actually have results become
  // options, newest first, with any period-less bets under "Other".
  const byPeriod = new Map<string, Wager[]>();
  for (const w of settled) {
    const key = w.period_id ?? '_none';
    const arr = byPeriod.get(key);
    if (arr) arr.push(w);
    else byPeriod.set(key, [w]);
  }
  const periodsDesc = [...(periodsQ.data ?? [])].sort((a, b) => b.index - a.index);
  const options = periodsDesc
    .filter((p) => (byPeriod.get(p.id)?.length ?? 0) > 0)
    .map((p) => ({ value: p.id, label: weekEndingLabel(p) }));
  if ((byPeriod.get('_none')?.length ?? 0) > 0) options.push({ value: '_none', label: 'Other' });

  if (options.length === 0) return <NoResults text="No results yet — settled bets show up here by week." />;

  const fromParam = week != null ? periodsDesc.find((p) => String(p.index) === week) : undefined;
  const paramValue = fromParam && options.some((o) => o.value === fromParam.id) ? fromParam.id : '';
  const selectedId = paramValue || options[0].value;
  const weekWagers = byPeriod.get(selectedId) ?? [];
  const recon = reconcile(weekWagers, me);
  const decided = recon.wins + recon.losses;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground sm:text-lg">Results</h2>
      <Combobox
        ariaLabel="Select week"
        className="w-full max-w-[220px]"
        value={selectedId}
        onChange={(id) => {
          const p = periodsDesc.find((x) => x.id === id);
          if (p) setWeek(p.index);
        }}
        options={options}
        searchPlaceholder="Search week…"
      />

      {/* Weekly reconciliation — net dollars + beers, overall then per opponent. */}
      {decided > 0 && (
        <Card className="gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-foreground">This week</span>
            <span className="flex items-center gap-2.5 text-base">
              <span className="text-sm font-medium text-muted-foreground">
                {recon.wins}–{recon.losses}
              </span>
              {recon.netCents === 0 && recon.netBeers === 0 ? (
                <span className="text-sm text-muted-foreground">even</span>
              ) : (
                <>
                  {recon.netCents !== 0 && <MoneyDelta cents={recon.netCents} />}
                  {recon.netBeers !== 0 && <BeerDelta count={recon.netBeers} />}
                </>
              )}
            </span>
          </div>
          <div className="flex flex-col divide-y divide-border border-t border-border">
            {Array.from(recon.perOpp.entries()).map(([id, o]) => (
              <div key={id} className="flex items-center justify-between gap-2 pt-2">
                <span className="min-w-0 truncate text-sm text-foreground">{o.name}</span>
                <ReconAmount o={o} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div>
        {groupWagers(weekWagers, me).map((g) => (
          <WagerBetCard key={g.key} group={g} me={me} ev={eventMap[g.rep.event_id]} />
        ))}
      </div>
    </div>
  );
}

// Graded pick'em picks, one section per week.
// The week's winner(s), pulled out above the standings so first place reads at a
// glance. Driven by every rank-1 row (co-leaders share rank 1). A tie means the
// tie-breaker didn't separate them, so it reads "tied" and drops the tie-breaker
// line — the same logic the winner feed post uses.
function WeekWinnerCard({
  winners, weekLabel, actualTotal, onPick,
}: {
  winners: WeeklyResultRow[];
  weekLabel: string;
  actualTotal: number | null;
  /** Show a winner's picks. Solo taps through directly; a tie routes here from the chooser. */
  onPick: (winner: WeeklyResultRow) => void;
}) {
  const [chooserOpen, setChooserOpen] = useState(false);
  if (winners.length === 0) return null;
  const solo = winners.length === 1;
  const top = winners[0];
  const correct = `${top.correct}/${top.graded || top.total}`;
  const names = winners.map((w) => w.display_name);
  const nameLine = solo
    ? names[0]
    : names.length === 2
      ? `${names[0]} & ${names[1]}`
      : names.length === 3
        ? `${names[0]}, ${names[1]} & ${names[2]}`
        : `${names[0]}, ${names[1]} & ${names.length - 2} more`;
  const shown = winners.slice(0, 3);
  const extra = winners.length - shown.length;

  return (
    <Card className="relative overflow-hidden border-t-2 border-t-amber-400 p-0">
      <div className="pointer-events-none absolute -end-9 top-3 z-10 rotate-45 bg-amber-400 px-10 py-1 text-center text-[10px] font-extrabold uppercase tracking-wider text-amber-950 shadow-md">
        {solo ? '1st' : 'Tie'}
      </div>

      <button
        type="button"
        onClick={() => (solo ? onPick(top) : setChooserOpen(true))}
        aria-label={solo ? `View ${top.display_name}'s picks` : 'View co-winners and their picks'}
        className="flex w-full flex-row items-center gap-4 p-4 text-left transition hover:bg-muted/40"
      >
        <div className="relative shrink-0">
          {solo ? (
            <>
              <UserAvatar
                userId={top.user_id}
                name={top.display_name}
                imageUrl={top.avatar_key}
                className="size-16 rounded-full ring-2 ring-amber-400 ring-offset-2 ring-offset-card"
                clickable={false}
              />
              <span className="absolute -bottom-1 -end-1 grid place-items-center rounded-full bg-card p-0.5 text-amber-400">
                <Medal className="size-5" />
              </span>
            </>
          ) : (
            <div className="flex items-center">
              {shown.map((w, i) => (
                <UserAvatar
                  key={w.user_id}
                  userId={w.user_id}
                  name={w.display_name}
                  imageUrl={w.avatar_key}
                  className={cn('size-14 rounded-full ring-2 ring-amber-400/70 ring-offset-2 ring-offset-card', i > 0 && '-ms-4')}
                  clickable={false}
                />
              ))}
              {extra > 0 && (
                <span className="-ms-4 grid size-14 place-items-center rounded-full bg-muted text-sm font-bold text-muted-foreground ring-2 ring-card">
                  +{extra}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-400">
            <Trophy className="size-3.5" />
            {solo ? 'Champion' : `Co-Winners${winners.length > 2 ? ` · ${winners.length}-Way` : ''}`}
          </span>
          <p className="mt-0.5 truncate text-base font-extrabold text-foreground">{nameLine}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {solo ? `Won ${weekLabel}` : weekLabel}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              <b className="font-bold tabular-nums text-brand">{correct}</b> correct{solo ? '' : ' · tied'}
            </span>
            {solo && top.tiebreaker_total != null && (
              <span>
                <b className="font-bold tabular-nums text-foreground">{top.tiebreaker_total}/{actualTotal ?? '—'}</b> tiebreaker
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="size-5 shrink-0 self-center text-muted-foreground" />
      </button>

      {!solo && (
        <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Co-winners{weekLabel ? ` — ${weekLabel}` : ''}</DialogTitle>
              <DialogDescription>Tap a winner to see their picks for the week.</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-1 py-2">
              {winners.map((w) => (
                <button
                  key={w.user_id}
                  type="button"
                  onClick={() => { setChooserOpen(false); onPick(w); }}
                  className="flex items-center gap-3 rounded-lg p-2 text-left transition hover:bg-muted"
                >
                  <UserAvatar
                    userId={w.user_id}
                    name={w.display_name}
                    imageUrl={w.avatar_key}
                    className="size-11 shrink-0"
                    clickable={false}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{w.display_name}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {w.correct}
                    <span className="text-xs font-normal text-muted-foreground">/{w.graded || w.total}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function PickemResults({ lg }: { lg: LeagueDetail }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const canModerate = lg.my_role === 'commissioner' || lg.my_role === 'moderator';
  const periodsQ = useQuery({ queryKey: ['periods', lg.id], queryFn: () => leaguesApi.periods(lg.id) });
  // Chronological order + default to the current (open) week, matching PickemPlay.
  const periods: LeaguePeriod[] = [...(periodsQ.data ?? [])].sort((a, b) => a.index - b.index);
  const openPeriod = periods.find((p) => p.status === 'open') ?? null;

  const { week, setWeek } = useWeekParam();
  const fromParam = week != null ? periods.find((p) => String(p.index) === week) : undefined;
  const selectedId = fromParam?.id || openPeriod?.id || periods[periods.length - 1]?.id || '';
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
  const roleById = new Map(lg.members.map((m) => [String(m.user_id), m.role]));
  const rankCounts = rows.reduce<Record<number, number>>((acc, r) => {
    acc[r.rank] = (acc[r.rank] ?? 0) + 1;
    return acc;
  }, {});
  const last = res?.last_game;
  // Once the week is final, the winner(s) are pulled into the WeekWinnerCard, so
  // drop them from the list below — they shouldn't appear twice.
  const winners = weekFinal ? rows.filter((r) => r.rank === 1 && r.graded > 0) : [];
  const winnerIds = new Set(winners.map((w) => w.user_id));
  const listRows = rows.filter((r) => !winnerIds.has(r.user_id));

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground sm:text-lg">Results</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Combobox
          ariaLabel="Select week"
          className="w-full max-w-[220px]"
          value={selectedId}
          onChange={(id) => {
            const p = periods.find((x) => x.id === id);
            if (p) setWeek(p.index);
          }}
          options={periods.map((p) => ({ value: p.id, label: p.label }))}
          searchPlaceholder="Search week…"
        />
      </div>

      {resultsQ.isLoading && <Skeleton className="h-40 rounded-xl" />}
      {!resultsQ.isLoading && rows.length === 0 && <NoResults text="No picks for this week yet." />}

      {winners.length > 0 && (
        <WeekWinnerCard
          winners={winners}
          weekLabel={periods.find((p) => p.id === selectedId)?.label ?? ''}
          actualTotal={last?.actual_total ?? null}
          onPick={setOpenMember}
        />
      )}

      <div className="flex flex-col gap-2">
        {listRows.map((r) => {
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
                <UserAvatar userId={r.user_id} name={r.display_name} imageUrl={r.avatar_key} className="size-14 shrink-0" clickable={false} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {r.display_name}
                    {isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {memberRoleLabel(roleById.get(String(r.user_id)) ?? 'member')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {r.correct}
                    <span className="text-xs font-normal text-muted-foreground">/{r.graded || r.total}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">correct</p>
                  {r.tiebreaker_total != null && (
                    <p className="mt-1 text-xs font-semibold tabular-nums text-foreground">
                      {r.tiebreaker_total}
                      <span className="text-[10px] font-normal text-muted-foreground">/{last?.actual_total ?? '—'}</span>
                    </p>
                  )}
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

  // PickEventInfo carries no kickoff time, so pull it from the ingestor per game
  // (the same source the Picks list uses) and caption each matchup with it.
  const eventIds = Array.from(new Set(picks.map((p) => p.event_id).filter(Boolean)));
  const startsQ = useQuery({
    queryKey: ['member-pick-starts', lg.id, periodId, [...eventIds].sort().join(',')],
    queryFn: async () => {
      const m: Record<string, string> = {};
      await Promise.all(
        eventIds.map(async (id) => {
          const ev = await fetchEvent(id);
          if (ev?.start_time) m[id] = ev.start_time;
        }),
      );
      return m;
    },
    enabled: open && eventIds.length > 0,
    staleTime: 5 * 60_000,
  });
  const starts = startsQ.data ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh]">
        <DialogHeader>
          <DialogTitle>{member?.display_name}&rsquo;s picks</DialogTitle>
          <DialogDescription>{periodLabel || 'Selected week'}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex min-h-0 flex-col gap-4 overflow-y-auto py-2">
          {q.isLoading && <Skeleton className="h-24 rounded-xl" />}
          {q.isError && (
            <p className="text-sm text-muted-foreground">Picks are hidden until an hour before the first game.</p>
          )}
          {!q.isLoading && !q.isError && picks.length === 0 && (
            <p className="text-sm text-muted-foreground">No picks for this week.</p>
          )}
          {picks.map((p) => {
            const ev = p.event;
            // Picked side tinted by result: blue while ungraded, green correct,
            // red wrong — matching the bet board and Pick'em play list.
            const tone = p.correct === null ? 'bg-blue-500/20'
              : p.correct ? 'bg-brand/20' : 'bg-destructive/20';
            return (
              <div key={p.id ?? p.event_id} className="flex flex-col gap-1.5">
                {starts[p.event_id] && (
                  <span className="px-0.5 text-xs text-muted-foreground">{formatStart(starts[p.event_id])}</span>
                )}
                <PickTeam
                  logo={ev?.away_logo}
                  label={ev?.away_abbr || ev?.away_team || '?'}
                  score={ev?.away_score}
                  picked={p.pick_side === 'away'}
                  tone={tone}
                />
                <PickTeam
                  logo={ev?.home_logo}
                  label={ev?.home_abbr || ev?.home_team || '?'}
                  score={ev?.home_score}
                  picked={p.pick_side === 'home'}
                  tone={tone}
                />
              </div>
            );
          })}

          {/* Tie-breaker: their total-points guess for the week's last game,
              plus how far off once it's final. */}
          {!q.isError && member?.tiebreaker_total != null && (
            <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-medium uppercase tracking-wide text-foreground">Tie-breaker · total points</span>
                {member.tiebreaker_diff != null && (
                  <span className="text-xs text-muted-foreground">off by {member.tiebreaker_diff}</span>
                )}
              </div>
              <span className="text-lg font-bold tabular-nums text-foreground">{member.tiebreaker_total}</span>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// One team side inside a member's pick row: logo + abbreviation + score, with
// the member's picked side wrapped in a highlighted (primary) box.
function PickTeam({
  logo, label, score, picked, tone,
}: {
  logo?: string | null;
  label: string;
  score?: number | null;
  picked: boolean;
  /** Highlight classes for the picked side (live / correct / wrong). */
  tone: string;
}) {
  return (
    <div
      className={cn(
        'flex h-11 items-center gap-2.5 rounded-md px-2.5',
        picked ? tone : 'bg-muted/60',
      )}
    >
      <TeamLogo src={logo} name={label} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{label}</span>
      {score !== null && score !== undefined && (
        <span className="text-sm font-bold tabular-nums text-foreground">{score}</span>
      )}
    </div>
  );
}

// Two-step bet flow opened from a Schedule game card. Step 1 configures the bet
// (team, straight-up vs ATS + spread, amount); step 2 checks off which members
// to challenge. Each checked member gets a head-to-head request via propose.
// Shared opponent picker for the bet dialogs: the "Challenge members" list with
// a search box once the league grows past eight members (matching the roster
// convention). Each dialog owns its own selection; this renders + filters only.
function MemberPicker({
  opponents,
  selected,
  onToggle,
}: {
  opponents: LeagueDetail['members'];
  selected: string[];
  onToggle: (uid: string) => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? opponents.filter((m) => m.display_name.toLowerCase().includes(needle))
    : opponents;
  const selectedMembers = opponents.filter((m) => selected.includes(m.user_id));
  return (
    <div className="flex flex-col gap-2">
      <Label>
        Challenge members
        {selectedMembers.length > 0 && (
          <span className="font-normal text-muted-foreground"> · {selectedMembers.length} selected</span>
        )}
      </Label>
      {opponents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other members to challenge yet.</p>
      ) : (
        <>
          {/* Selected members stay visible as removable chips, so they aren't lost
              when the list scrolls or a search filters them out. */}
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedMembers.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => onToggle(m.user_id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 py-1 pl-1 pr-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
                  aria-label={`Remove ${m.display_name}`}
                >
                  <UserAvatar userId={m.user_id} name={m.display_name} imageUrl={m.avatar_key} className="size-5" />
                  <span className="max-w-[9rem] truncate">{m.display_name}</span>
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}
          {opponents.length > 8 && (
            <ListSearch value={q} onChange={setQ} placeholder="Search members" />
          )}
          <div className="flex flex-col gap-2">
            {shown.map((m) => {
              const on = selected.includes(m.user_id);
              return (
                <button
                  key={m.user_id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(m.user_id)}
                  className={cn('flex items-center gap-3 px-3 py-2.5 text-left', pickBtn(on))}
                >
                  <UserAvatar
                    userId={m.user_id}
                    name={m.display_name}
                    imageUrl={m.avatar_key}
                    className="size-10 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.display_name}</span>
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                    )}
                    aria-hidden
                  >
                    {on && <Check className="size-3.5" />}
                  </span>
                </button>
              );
            })}
            {needle && shown.length === 0 && (
              <p className="text-sm text-muted-foreground">No members match “{q.trim()}”.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

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
  const [side, setSide] = useState<WagerSide>('away');
  const [betType, setBetType] = useState<BetType>('moneyline');
  const [line, setLine] = useState<number | null>(null);
  const [picked, setPicked] = useState(false); // no cell selected until the user taps one
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
  const total = oddsQ.data?.overUnder;

  // Reset the flow whenever a new game is opened.
  useEffect(() => {
    if (open) {
      setStep('config'); setSide('away'); setBetType('moneyline'); setLine(null);
      setPicked(false); setCredits('10'); setSelected([]);
    }
  }, [open, event?.external_id]);

  // Tapping a cell fixes the side, market and (for spread/total) the line.
  const pickCell = (s: WagerSide, bt: BetType, ln: number | null) => {
    setSide(s);
    setBetType(bt);
    setLine(bt === 'moneyline' ? null : ln);
    setPicked(true);
  };

  const opponents = lg.members.filter((m) => m.user_id !== me);
  const toggle = (uid: string) =>
    setSelected((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));

  const propose = useMutation({
    mutationFn: () => wagersApi.propose({
      league_id: lg.id, event_id: event!.external_id, side,
      amount_cents: Math.round(Number(credits) * 100), acceptor_ids: selected,
      bet_type: betType, line: betType === 'moneyline' ? null : line,
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
  const configReady = picked && credits.trim() !== '' && Number(credits) >= 0;
  const canSubmit = selected.length > 0 && configReady;
  const sign = (n?: number) => (n === undefined || n === null ? undefined : n > 0 ? `+${n}` : `${n}`);
  const isSel = (s: WagerSide, bt: BetType) => picked && side === s && betType === bt;
  // A one-line description of the current pick, for the Next button.
  const pickLabel = () => {
    if (!picked) return 'Next';
    if (betType === 'total') return `Next · ${side === 'over' ? 'Over' : 'Under'} ${line}`;
    const t = teamName(side as 'home' | 'away');
    return `Next · ${t}${betType === 'spread' ? ` ${sign(line ?? undefined)}` : ''}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          {/* Title is screen-reader-only: the team names already show in the
              selection rows below (away on top, home on the bottom), so the
              visible title is redundant. Kept for dialog accessibility. */}
          <DialogTitle className="sr-only">{event.away_team} @ {event.home_team}</DialogTitle>
          <DialogDescription className="sr-only">
            Configure and send a head-to-head bet to league members. Tap the market and side you want to
            back.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 py-2">
          {step === 'config' ? (
            <>
              {/* Sportsbook-style selectable rows: Spread | Total | Winner. Total
                  is over on the away row, under on the home row. */}
              <div>
                <div className="flex items-center gap-1.5 pb-1.5">
                  <span className="min-w-0 flex-1 pl-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Winner</span>
                  {(['Spread', 'Total'] as const).map((h) => (
                    <span key={h} className="w-[3.75rem] shrink-0 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:w-[4.75rem]">{h}</span>
                  ))}
                </div>
                {(['away', 'home'] as const).map((s) => {
                  const spMain = spread ? sign(s === 'away' ? -spread.line : spread.line) : undefined;
                  // Total: away row = Over, home row = Under.
                  const ouSide: WagerSide = s === 'away' ? 'over' : 'under';
                  const ouMain = total ? `${s === 'away' ? 'O' : 'U'} ${total.total}` : undefined;
                  const cellCls = (on: boolean, disabled?: boolean) =>
                    cn(
                      'flex h-12 w-[3.75rem] shrink-0 flex-col items-center justify-center gap-0 rounded-md border tabular-nums leading-tight transition-colors sm:w-[4.75rem]',
                      disabled ? 'cursor-not-allowed opacity-40 border-input' : on ? STATE.selected : STATE.idle,
                    );
                  return (
                    <div key={s} className="flex items-center gap-1.5 border-b border-border py-2 last:border-0">
                      {/* The team name IS the straight-up (Winner) pick. */}
                      <button
                        type="button"
                        onClick={() => pickCell(s, 'moneyline', null)}
                        className={cn(
                          'flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-md border px-2.5 transition-colors',
                          isSel(s, 'moneyline') ? STATE.selected : STATE.idle,
                        )}
                      >
                        <TeamLogo src={teamLogo(s)} name={teamAbbr(s) || teamName(s)} size="sm" />
                        <span className="truncate text-sm font-medium text-foreground">{teamName(s)}</span>
                      </button>
                      {/* Spread */}
                      <button type="button" disabled={!spread} onClick={() => pickCell(s, 'spread', s === 'away' ? -spread!.line : spread!.line)} className={cellCls(isSel(s, 'spread'), !spread)}>
                        {spread ? (
                          <span className="text-xs font-medium text-foreground">{spMain}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </button>
                      {/* Total (O/U) */}
                      <button type="button" disabled={!total} onClick={() => pickCell(ouSide, 'total', total!.total)} className={cellCls(isSel(ouSide, 'total'), !total)}>
                        {total ? (
                          <span className="text-xs font-medium text-foreground">{ouMain}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </button>
                    </div>
                  );
                })}
              </div>

              <StakeChips credits={credits} onPick={setCredits} />

              <Button className="w-full" disabled={!configReady} onClick={() => setStep('members')}>
                {pickLabel()}
              </Button>
            </>
          ) : (
            <>
              {/* Compact bet summary: pick + stake on one line, matchup + kickoff
                  beneath (indent aligns under the pick, past the logo). */}
              <div>
                <div className="flex items-center gap-2.5">
                  {betType !== 'total' && (
                    <TeamLogo
                      src={teamLogo(side as 'home' | 'away')}
                      name={teamAbbr(side as 'home' | 'away') || teamName(side as 'home' | 'away')}
                      size="sm"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {betType === 'total'
                      ? <>{side === 'over' ? 'Over' : 'Under'} {line}</>
                      : <>{teamName(side as 'home' | 'away')}{betType === 'spread' ? ` ${sign(line ?? undefined)}` : ''}</>}
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                    {betType === 'moneyline' ? 'Straight up' : betType === 'spread' ? 'Spread' : 'Total'}
                    {' · '}<StakeSummary cents={Math.round(Number(credits) * 100)} />
                  </span>
                </div>
                <div className={cn('mt-1 truncate text-xs text-muted-foreground', betType !== 'total' && 'pl-[2.625rem]')}>
                  {event.short_name || `${event.away_team} at ${event.home_team}`}
                  {event.start_time ? ` · ${formatStart(event.start_time)}` : ''}
                </div>
              </div>
              <MemberPicker opponents={opponents} selected={selected} onToggle={toggle} />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep('config')}>Back</Button>
                <Button className="w-full sm:w-auto" disabled={!canSubmit || propose.isPending} onClick={() => propose.mutate()}>
                  {propose.isPending
                    ? 'Sending…'
                    : `Bet${selected.length > 1 ? ` (${selected.length})` : ''}`}
                </Button>
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// A field-sport (golf, racing) bet: the tournament has a whole field, so instead
// of backing a fixed side the proposer picks two competitors (theirs + the
// opponent's) and challenges members — the higher finish wins, peer-confirmed
// like any other head-to-head bet.
function MatchupBetDialog({
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
  const [myPick, setMyPick] = useState('');
  const [theirPick, setTheirPick] = useState('');
  const [credits, setCredits] = useState('10');
  const [selected, setSelected] = useState<string[]>([]);

  const fieldQ = useQuery({
    queryKey: ['espn-field', event?.sport, event?.external_id],
    queryFn: () => fetchEspnDetail(event!.sport, event!.external_id),
    enabled: open && !!event,
    staleTime: 5 * 60_000,
  });
  const options = (fieldQ.data?.field ?? [])
    .filter((c) => c.name)
    .map((c) => ({ value: c.name, label: c.name }));

  useEffect(() => {
    if (open) { setStep('config'); setMyPick(''); setTheirPick(''); setCredits('10'); setSelected([]); }
  }, [open, event?.external_id]);

  const opponents = lg.members.filter((m) => m.user_id !== me);
  const toggle = (uid: string) =>
    setSelected((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));

  const propose = useMutation({
    mutationFn: () => wagersApi.propose({
      league_id: lg.id, event_id: event!.external_id, side: 'home',
      home_team: myPick, away_team: theirPick,
      amount_cents: Math.round(Number(credits) * 100), acceptor_ids: selected,
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
  const noun = event.sport === 'racing' ? 'driver' : 'golfer';
  const distinct =
    myPick.trim() !== '' && theirPick.trim() !== '' &&
    myPick.trim().toLowerCase() !== theirPick.trim().toLowerCase();
  const configReady = distinct && credits.trim() !== '' && Number(credits) >= 0;
  const canSubmit = selected.length > 0 && configReady;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Pick a matchup and challenge league members.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 py-2">
          {step === 'config' ? (
            <>
              <p className="text-sm text-muted-foreground">
                Pick your {noun} and your opponent’s — whoever finishes higher wins.
              </p>
              {fieldQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading the field…</p>
              ) : options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The field for this event isn’t posted yet — check back closer to the start.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Your {noun}</Label>
                    <Combobox
                      options={options.filter((o) => o.value !== theirPick)}
                      value={myPick} onChange={setMyPick}
                      placeholder={`Pick your ${noun}`} ariaLabel={`Your ${noun}`}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Their {noun}</Label>
                    <Combobox
                      options={options.filter((o) => o.value !== myPick)}
                      value={theirPick} onChange={setTheirPick}
                      placeholder={`Pick their ${noun}`} ariaLabel={`Their ${noun}`}
                    />
                  </div>
                </>
              )}
              <StakeChips credits={credits} onPick={setCredits} />
              <Button className="w-full self-stretch sm:w-auto sm:self-end" disabled={!configReady} onClick={() => setStep('members')}>Next</Button>
            </>
          ) : (
            <>
              <div className="text-sm text-foreground">
                <span className="font-semibold">{myPick}</span> vs <span className="font-semibold">{theirPick}</span>
                {' · '}<StakeSummary cents={Math.round(Number(credits) * 100)} />
              </div>
              <MemberPicker opponents={opponents} selected={selected} onToggle={toggle} />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep('config')}>Back</Button>
                <Button className="w-full sm:w-auto" disabled={!canSubmit || propose.isPending} onClick={() => propose.mutate()}>
                  {propose.isPending
                    ? 'Sending…'
                    : `Bet${selected.length > 1 ? ` (${selected.length})` : ''}`}
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

// Icon + tint per transaction type. The chip colour reads the *meaning* of the
// entry (money in = brand green, money out = red, refund = sky, grant = amber),
// not the raw sign — so an unusual or zero entry still looks right.
const TXN_STYLE: Record<string, { Icon: LucideIcon; chip: string }> = {
  wager_payout: { Icon: ArrowUpRight, chip: 'bg-brand/12 text-brand' },
  wager_hold: { Icon: ArrowDownRight, chip: 'bg-destructive/12 text-destructive' },
  wager_refund: { Icon: RotateCcw, chip: 'bg-sky-500/12 text-sky-500' },
  league_grant: { Icon: Flag, chip: 'bg-amber-500/12 text-amber-500' },
};

// "+$40" / "−$25" with a real minus glyph; formatCredits renders the $ + digits.
function signedCredits(cents: number): string {
  return `${cents >= 0 ? '+' : '−'}${formatCredits(Math.abs(cents))}`;
}

function txnDayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Bucket the (newest-first) transactions into calendar days, preserving order
// and tracking each day's net.
function groupTxnsByDay(txns: WalletTxn[]) {
  const groups: { key: string; label: string; net: number; items: WalletTxn[] }[] = [];
  for (const t of txns) {
    const d = new Date(t.created_at);
    const key = d.toDateString();
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: txnDayLabel(d), net: 0, items: [] };
      groups.push(g);
    }
    g.items.push(t);
    g.net += t.amount_cents;
  }
  return groups;
}

// Tiny running-balance sparkline: up to the 12 most recent balances, oldest to
// newest. Heights are normalised to the visible min/max with a 20% floor so a
// flat stretch still reads as bars.
function BalanceSpark({ txns }: { txns: WalletTxn[] }) {
  const pts = txns.slice(0, 12).map((t) => t.balance_after_cents).reverse();
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  return (
    <div className="flex h-12 items-end gap-[3px]" aria-hidden>
      {pts.map((v, i) => (
        <span
          key={i}
          className="w-1.5 rounded-sm bg-primary/70"
          style={{ height: `${20 + ((v - min) / span) * 80}%` }}
        />
      ))}
    </div>
  );
}

function TxnRow({ t }: { t: WalletTxn }) {
  const style = TXN_STYLE[t.type] ?? { Icon: Wallet, chip: 'bg-muted text-muted-foreground' };
  const Icon = style.Icon;
  const up = t.amount_cents >= 0;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', style.chip)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{TXN_LABEL[t.type] ?? t.type}</div>
        <div className="text-xs text-muted-foreground">
          {new Date(t.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
      <div className="text-right">
        <div className={cn('text-sm font-bold tabular-nums', up ? 'text-brand' : 'text-destructive')}>
          {signedCredits(t.amount_cents)}
        </div>
        <div className="text-[11px] tabular-nums text-muted-foreground">{formatCredits(t.balance_after_cents)}</div>
      </div>
    </li>
  );
}

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

  // txns are newest-first, so [0] holds the current balance.
  const balance = txns[0].balance_after_cents;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekNet = txns
    .filter((t) => new Date(t.created_at).getTime() >= weekAgo)
    .reduce((s, t) => s + t.amount_cents, 0);
  const groups = groupTxnsByDay(txns);

  return (
    <Card className="min-w-0 gap-0 overflow-hidden p-0">
      {/* Balance hero — the answer to "what's my balance, am I up or down?"
          before the line-by-line detail below. */}
      <div className="flex items-start gap-4 border-b border-border p-4 sm:p-5">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">League balance</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-foreground">{formatCredits(balance)}</div>
          {weekNet !== 0 && (
            <div className={cn('mt-1.5 inline-flex items-center gap-1 text-xs font-semibold', weekNet >= 0 ? 'text-brand' : 'text-destructive')}>
              {weekNet >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {signedCredits(weekNet)} this week
            </div>
          )}
        </div>
        <div className="ml-auto shrink-0">
          <BalanceSpark txns={txns} />
        </div>
      </div>

      {/* Day-grouped timeline with a per-day net. */}
      {groups.map((g) => (
        <div key={g.key}>
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</span>
            <span className={cn('text-xs font-bold tabular-nums', g.net >= 0 ? 'text-brand' : 'text-destructive')}>{signedCredits(g.net)}</span>
          </div>
          <ul className="divide-y divide-border">
            {g.items.map((t) => <TxnRow key={t.id} t={t} />)}
          </ul>
        </div>
      ))}
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
  member, isCommish, canModerate, isFriend, busy, onSetRole, onTransfer, onRemove, onUnfriend,
}: {
  member: LeagueMember;
  isCommish: boolean;
  canModerate: boolean;
  isFriend: boolean;
  busy: boolean;
  onSetRole: (role: 'moderator' | 'member') => void;
  onTransfer: () => void;
  onRemove: () => void;
  onUnfriend: () => void;
}) {
  const [confirming, setConfirming] = useState<'transfer' | 'remove' | 'unfriend' | null>(null);

  const isCommishRow = member.role === 'commissioner';
  const canRemove = isCommish ? !isCommishRow : canModerate && member.role === 'member';
  const showRoleActions = isCommish ? !isCommishRow : canRemove;
  const showMenu = showRoleActions || isFriend;
  if (!showMenu) return null;

  return (
    <>
      {/* modal={false}: without it, the dropdown leaves pointer-events:none on
          <body> when it closes to open the AlertDialog, freezing the page. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="outline" className="size-10 shrink-0" aria-label="Member actions">
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
          {isFriend && (
            <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => setConfirming('unfriend')}>
              <UserMinus className="size-4" /> Unfriend
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
              {confirming === 'transfer' ? 'Transfer commissioner?' : confirming === 'unfriend' ? 'Unfriend?' : 'Remove member?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === 'transfer'
                ? `${member.display_name} will become the league commissioner and you'll become a moderator. You can only get it back if they transfer it to you.`
                : confirming === 'unfriend'
                  ? `Remove ${member.display_name} from your friends?`
                  : `Remove ${member.display_name} from this league? They'll lose access to it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming === 'transfer') onTransfer();
                else if (confirming === 'unfriend') onUnfriend();
                else onRemove();
                setConfirming(null);
              }}
            >
              {confirming === 'transfer' ? 'Transfer' : confirming === 'unfriend' ? 'Unfriend' : 'Remove'}
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
  const router = useRouter();
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
      qc.invalidateQueries({ queryKey: ['conversations'] });
      router.push('/messages/' + conv.id);
    },
    onError: onErr,
  });
  const removeFriend = useMutation({
    mutationFn: (uid: string) => friendsApi.remove(uid),
    onSuccess: () => { toast.success('Friend removed'); qc.invalidateQueries({ queryKey: ['friends'] }); },
    onError: onErr,
  });

  // Filter is client-side — the full roster already ships in the league payload.
  // Only surface the box once the list is long enough to be worth scanning.
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const members = query
    ? lg.members.filter((m) => m.display_name.toLowerCase().includes(query))
    : lg.members;
  const showSearch = lg.members.length > 8;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">Members ({lg.members.length})</h2>
      {showSearch && <ListSearch value={q} onChange={setQ} placeholder="Search members" />}
      {members.length === 0 ? (
        <CenterCard>
          <Search className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No members match “{q.trim()}”.</p>
        </CenterCard>
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {members.map((m) => {
          const uid = String(m.user_id);
          const isMe = uid === me;
          return (
            <UserMiniCard
              key={m.user_id}
              userId={m.user_id}
              name={m.display_name}
              imageUrl={m.avatar_key}
              badge={isMe ? <Badge size="sm" appearance="light">You</Badge> : null}
              subtitle={memberRoleLabel(m.role)}
              actions={
                !isMe && (
                  <>
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
                      <Button size="sm" variant="outline" className="text-brand" disabled>
                        <UserCheck className="size-4" />
                        <span className="hidden sm:inline">Friends</span>
                      </Button>
                    ) : pendingIds.has(uid) ? (
                      <Button size="sm" variant="outline" className="text-muted-foreground" disabled>
                        <Clock className="size-4" />
                        <span className="hidden sm:inline">Pending</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-primary"
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
                      isFriend={friendIds.has(uid)}
                      busy={remove.isPending || setRole.isPending || transfer.isPending || removeFriend.isPending}
                      onSetRole={(role) => setRole.mutate({ uid, role })}
                      onTransfer={() => transfer.mutate(uid)}
                      onRemove={() => remove.mutate(uid)}
                      onUnfriend={() => removeFriend.mutate(uid)}
                    />
                  </>
                )
              }
            />
          );
        })}
      </div>
      )}
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
    <Card className="gap-5 p-6">
      <h2 className="text-base font-semibold text-foreground sm:text-lg">League details</h2>

      <div className="flex flex-col gap-2">
        <Label>Logo</Label>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
        <div className="flex items-center gap-4">
          <LeagueAvatar name={name} logoUrl={lg.logo_url} id={lg.id} size={128} />
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

// The tab is only shown to the commissioner, but the route isn't guarded — a
// non-commissioner who deep-links here would otherwise see a control panel where
// every action 403s. Bounce them with a clear message. (Enforcement is still on
// the backend; this is UX.)
export function LeagueManage() {
  const lg = useLeague();
  const router = useRouter();
  if (lg.my_role !== 'commissioner') {
    return (
      <CenterCard>
        <Lock className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Only the commissioner can manage this league.</p>
        <Button variant="outline" size="sm" onClick={() => router.push(`/leagues/${lg.id}`)}>
          Back to Feed
        </Button>
      </CenterCard>
    );
  }
  return <LeagueManageInner />;
}

// Canonical form pattern: react-hook-form + zod validation + the shared Form
// primitives, wired to the existing TanStack mutation. Blank min/max = "no
// limit"; zod enforces non-negative numbers and max >= min before submit.
// Curated zones for the picker; the backend accepts any valid IANA name.
const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Vancouver', label: 'Vancouver' },
  { value: 'Europe/London', label: 'London' },
];

const rulesSchema = z
  .object({
    min: z.string().trim(),
    max: z.string().trim(),
    whoCanPropose: z.enum(['any', 'commissioner']),
    timezone: z.string().min(1),
  })
  .refine((v) => v.min === '' || Number(v.min) >= 0, { path: ['min'], message: 'Enter a number ≥ 0, or leave blank.' })
  .refine((v) => v.max === '' || Number(v.max) >= 0, { path: ['max'], message: 'Enter a number ≥ 0, or leave blank.' })
  .refine((v) => v.min === '' || v.max === '' || Number(v.max) >= Number(v.min), {
    path: ['max'],
    message: 'Max must be at least the minimum.',
  });

type RulesValues = z.infer<typeof rulesSchema>;

function RulesForm({ lg }: { lg: LeagueDetail }) {
  const qc = useQueryClient();
  const isH2H = lg.league_type === 'head_to_head';

  const form = useForm<RulesValues>({
    resolver: zodResolver(rulesSchema),
    defaultValues: {
      min: lg.min_wager_cents ? String(lg.min_wager_cents / 100) : '',
      max: lg.max_wager_cents ? String(lg.max_wager_cents / 100) : '',
      whoCanPropose:
        ((lg.rules || {}) as Record<string, unknown>).who_can_propose === 'commissioner' ? 'commissioner' : 'any',
      timezone: lg.timezone || 'America/New_York',
    },
  });

  const save = useMutation({
    mutationFn: (v: RulesValues) =>
      leaguesApi.update(lg.id, {
        min_wager_cents: v.min ? Math.round(Number(v.min) * 100) : null,
        max_wager_cents: v.max ? Math.round(Number(v.max) * 100) : null,
        rules: { ...(lg.rules || {}), who_can_propose: v.whoCanPropose },
        timezone: v.timezone,
      }),
    onSuccess: (_d, v) => {
      toast.success('Rules saved');
      qc.invalidateQueries({ queryKey: ['league', lg.id] });
      form.reset(v);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="gap-5 p-6">
      <div className="flex items-center gap-2">
        <Settings className="size-5 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground sm:text-lg">Rules</h2>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-5">
            <FormField
              control={form.control}
              name="min"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Min wager ($)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="max"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max wager ($)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {isH2H && (
            <FormField
              control={form.control}
              name="whoCanPropose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Who can propose bets</FormLabel>
                  <FormControl>
                    <Combobox
                      className="w-full"
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: 'any', label: 'Any member' },
                        { value: 'commissioner', label: 'Commissioner only' },
                      ]}
                    />
                  </FormControl>
                  <FormDescription>Limit who can start head-to-head bets.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>League timezone</FormLabel>
                <FormControl>
                  <Combobox className="w-full" value={field.value} onChange={field.onChange} options={TIMEZONE_OPTIONS} />
                </FormControl>
                <FormDescription>
                  Weeks roll over at 4:00 AM in this timezone, so late night games finish before a period closes.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="self-start" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save rules'}
          </Button>
        </form>
      </Form>
    </Card>
  );
}

function LeagueManageInner() {
  const lg = useLeague();
  const router = useRouter();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['league', lg.id] });
  const onErr = (e: Error) => toast.error(e.message);

  const isMoney = lg.league_type !== 'pickem';

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

  return (
    <div className="flex flex-col gap-6">
        <div id="manage-details" className="scroll-mt-6">
          <EditLeagueDetails lg={lg} />
        </div>

        <div id="manage-rules" className="scroll-mt-6">
          {isMoney ? (
            <RulesForm lg={lg} />
          ) : (
            <Card className="gap-5 p-6">
              <div className="flex items-center gap-2"><Settings className="size-5 text-muted-foreground" /><h2 className="text-base font-semibold text-foreground sm:text-lg">Rules</h2></div>
              <p className="text-sm text-muted-foreground">Pick’em leagues have no wager rules.</p>
            </Card>
          )}
        </div>

        {/* Period control — only weekly leagues advance periods (opens the next
            week). Season/H2H leagues bet all season, so advancing just closed
            betting with nothing to reopen; hide it for them. */}
        {lg.status === 'active' && lg.period_type === 'weekly' && (
          <div id="manage-period" className="scroll-mt-6">
            <Card className="gap-3 p-6">
              <h2 className="text-base font-semibold text-foreground sm:text-lg">Period</h2>
              <p className="text-sm text-muted-foreground">
                Current: {lg.current_period ? `${lg.current_period.label} (${lg.current_period.status})` : '—'}
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="mt-1 self-start" disabled={advance.isPending}>
                    {advance.isPending ? 'Advancing…' : 'Advance period'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Advance to the next period?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This closes the current week now and opens the next one. Open bets settle as usual.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={advance.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled={advance.isPending} onClick={() => advance.mutate()}>
                      Advance period
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          </div>
        )}

        {/* Danger zone */}
        <div id="manage-danger" className="scroll-mt-6">
          <Card className="gap-3 p-6">
            <h2 className="text-base font-semibold text-foreground sm:text-lg">Danger zone</h2>
            <p className="text-sm text-muted-foreground">Archiving removes the league from everyone’s dashboard. Balances and history are preserved.</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="mt-1 self-start text-destructive" disabled={archive.isPending}>
                  {archive.isPending ? 'Archiving…' : 'Archive league'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive “{lg.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It disappears from everyone’s dashboard. Balances and history are preserved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={archive.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={archive.isPending}
                    onClick={() => archive.mutate()}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Archive league
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
        </div>
    </div>
  );
}

