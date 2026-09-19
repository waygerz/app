'use client';

import { useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLeague } from '../league-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  groupByKickoff,
  leaguesApi,
  shortPeriodLabel,
  type LeagueDetail,
  type LeaguePeriod,
  type PeriodResults,
  type WeeklyResultRow,
} from '@/lib/leagues';
import { groupWagers, wagersApi, type Wager } from '@/lib/wagers';
import { fetchEvent, fetchPeriodEvents, type SportEvent } from '@/lib/ingestor';
import { formatCredits } from '@/lib/wallet';
import { useAuth } from '@/auth/AuthContext';
import { TeamLogo } from '@/components/event-card';
import { WeekChips, type WeekChip } from '@/components/week-chips';
import { SeasonTable } from './season-table';
import { SectionTitle } from '@/components/section-title';
import { Card } from '@/components/ui/card';
import { CenterCard } from '@/components/ui/center-card';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { AppSheet } from '@/components/ui/app-sheet';
import { Badge } from '@/components/ui/badge';
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
import { Trophy, Medal, CircleCheckBig, ChevronRight, Check, X } from 'lucide-react';
import { STATE, memberRoleLabel } from './shared';
import { WagerBetCard } from './wager-card';

// ===================== STANDINGS (weeks + Overall) =====================
// One tab for "how am I doing": a chip per week (that week's results) plus an
// Overall chip (the season table). See .docs/pending/STANDINGS_MERGE.md.

/** The chip value that selects the season table. */
const OVERALL = 'overall';
/** Head-to-head bets with no week. */
const OTHER = '_none';

// Read/write the ?week= query param so a week is linkable, savable and
// shareable: a period index, `overall`, or `other`. The URL is the source of
// truth; changing the chip rewrites it in place (no navigation). Needs a
// Suspense boundary above it (the standings route provides one).
function useWeekParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const week = params.get('week');
  const setWeek = (value: number | 'overall' | 'other') => {
    const next = new URLSearchParams(params.toString());
    next.set('week', String(value));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return { week, setWeek };
}

export function LeagueStandings() {
  const lg = useLeague();
  if (lg.league_type === 'pickem') return <PickemStandings lg={lg} />;
  return <HeadToHeadStandings lg={lg} />;
}

/** The Overall chip, last in the row and styled apart from the weeks. */
const OVERALL_CHIP: WeekChip = { value: OVERALL, label: 'Overall', title: 'Overall season standings', overall: true };

/** The Overall view: the season table under its title. */
function OverallView({ lg }: { lg: LeagueDetail }) {
  const members = lg.members.length;
  const after = lg.current_period?.label;
  return (
    <>
      <SectionTitle
        title="Standings · Overall"
        subtitle={`${members} member${members === 1 ? '' : 's'}${after ? ` · after ${after}` : ''}`}
      />
      <SeasonTable />
    </>
  );
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

type OppRecon = { name: string; netCents: number; netBeers: number; netShots: number; wins: number; losses: number };

type Recon = { wins: number; losses: number; netCents: number; netBeers: number; netShots: number; perOpp: Map<string, OppRecon> };

// Net out a week's decided bets from the viewer's perspective: dollars, beers and
// shots tracked separately (different currencies), overall and per opponent.
// Pushes and refunds carry no result, so they don't move the tally.
function reconcile(wagers: Wager[], me: string): Recon {
  const perOpp = new Map<string, OppRecon>();
  let wins = 0, losses = 0, netCents = 0, netBeers = 0, netShots = 0;
  for (const w of wagers) {
    if (w.status !== 'settled' || w.winner_user_id == null) continue;
    const iWon = w.winner_user_id === me;
    const oppId = w.proposer_id === me ? w.acceptor_id : w.proposer_id;
    const oppName = w.proposer_id === me ? w.acceptor_name : w.proposer_name;
    const bragging = w.amount_cents === 0;
    const shot = bragging && w.treat === 'shot';
    const o = perOpp.get(oppId) ?? { name: oppName, netCents: 0, netBeers: 0, netShots: 0, wins: 0, losses: 0 };
    const d = iWon ? 1 : -1;
    if (iWon) { wins++; o.wins++; } else { losses++; o.losses++; }
    if (shot) { netShots += d; o.netShots += d; }
    else if (bragging) { netBeers += d; o.netBeers += d; }
    else { netCents += d * w.amount_cents; o.netCents += d * w.amount_cents; }
    perOpp.set(oppId, o);
  }
  return { wins, losses, netCents, netBeers, netShots, perOpp };
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

// Signed treat delta: +1 🍺 / −2 🥃 (up = green, down = red).
function TreatDelta({ count, emoji }: { count: number; emoji: string }) {
  const up = count > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-semibold tabular-nums', up ? 'text-brand' : 'text-destructive')}>
      {up ? '+' : '−'}{Math.abs(count)}
      <span aria-hidden>{emoji}</span>
    </span>
  );
}

// One opponent's net for the week: a friendly "you won / you owe" verb when it's
// a single currency, or just the two signed deltas when it's a mix of both.
function ReconAmount({ o }: { o: OppRecon }) {
  const parts: ReactNode[] = [];
  if (o.netCents !== 0) parts.push(<MoneyDelta key="m" cents={o.netCents} />);
  if (o.netBeers !== 0) parts.push(<TreatDelta key="b" count={o.netBeers} emoji="🍺" />);
  if (o.netShots !== 0) parts.push(<TreatDelta key="s" count={o.netShots} emoji="🥃" />);
  if (parts.length === 0) return <span className="text-sm text-muted-foreground">even</span>;
  const verb = parts.length === 1 ? ((o.netCents || o.netBeers || o.netShots) > 0 ? 'you won' : 'you owe') : '';
  return (
    <span className="flex items-center gap-1.5 text-sm">
      {verb && <span className="text-muted-foreground">{verb}</span>}
      {parts}
    </span>
  );
}

// Settled head-to-head bets for one week: a date picker, a reconciliation summary
// (net dollars + beers, overall and per opponent), then that week's bet cards.
function HeadToHeadStandings({ lg }: { lg: LeagueDetail }) {
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
    .map((p) => ({ value: p.id, label: shortPeriodLabel(p.label), title: weekEndingLabel(p) }));
  if ((byPeriod.get(OTHER)?.length ?? 0) > 0) options.push({ value: OTHER, label: 'Other', title: 'Other' });

  // ?week= wins; else the current week if it has results; else the newest week
  // with results; else Overall.
  const fromParam = week != null ? periodsDesc.find((p) => String(p.index) === week) : undefined;
  const current = lg.current_period?.id;
  const selectedId =
    week === OVERALL ? OVERALL
      : week === 'other' && options.some((o) => o.value === OTHER) ? OTHER
        : fromParam && options.some((o) => o.value === fromParam.id) ? fromParam.id
          : current && options.some((o) => o.value === current) ? current
            : options[0]?.value ?? OVERALL;
  const chips = (
    // Weeks oldest → newest (like My Picks), then Overall.
    <WeekChips
      weeks={[...[...options].reverse(), OVERALL_CHIP]}
      value={selectedId}
      onChange={(id) => {
        if (id === OVERALL) return setWeek('overall');
        if (id === OTHER) return setWeek('other');
        const p = periodsDesc.find((x) => x.id === id);
        if (p) setWeek(p.index);
      }}
    />
  );
  if (selectedId === OVERALL) {
    return (
      <div className="flex flex-col gap-4">
        {chips}
        <OverallView lg={lg} />
        {options.length === 0 && (
          <p className="text-xs text-muted-foreground">Weekly results show up here once bets settle.</p>
        )}
      </div>
    );
  }
  const weekWagers = byPeriod.get(selectedId) ?? [];
  const recon = reconcile(weekWagers, me);
  const decided = recon.wins + recon.losses;
  const selected = options.find((o) => o.value === selectedId);

  return (
    <div className="flex flex-col gap-4">
      {chips}
      <SectionTitle
        title={`Standings · ${selected?.title ?? ''}`}
        subtitle={`${weekWagers.length} settled bet${weekWagers.length === 1 ? '' : 's'}`}
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
              {recon.netCents === 0 && recon.netBeers === 0 && recon.netShots === 0 ? (
                <span className="text-sm text-muted-foreground">even</span>
              ) : (
                <>
                  {recon.netCents !== 0 && <MoneyDelta cents={recon.netCents} />}
                  {recon.netBeers !== 0 && <TreatDelta count={recon.netBeers} emoji="🍺" />}
                  {recon.netShots !== 0 && <TreatDelta count={recon.netShots} emoji="🥃" />}
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
        <AppSheet
          open={chooserOpen}
          onOpenChange={setChooserOpen}
          title={`Co-winners${weekLabel ? ` — ${weekLabel}` : ''}`}
          description="Tap a winner to see their picks for the week."
        >
          <div className="flex flex-col gap-1">
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
          </div>
        </AppSheet>
      )}
    </Card>
  );
}

function PickemStandings({ lg }: { lg: LeagueDetail }) {
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
  // ?week= wins; else the open week, else the latest; Overall when asked for
  // (or when there are no weeks yet). '' = Overall.
  const selectedId =
    week === OVERALL ? '' : fromParam?.id || openPeriod?.id || periods[periods.length - 1]?.id || '';
  const [openMember, setOpenMember] = useState<WeeklyResultRow | null>(null);
  // Only crown a winner once the week is final — never mid-week.
  const weekFinal = periods.find((p) => p.id === selectedId)?.status === 'final';

  const selectedPeriod = periods.find((p) => p.id === selectedId) ?? null;
  // The week's games, for the "finished / left" line (same query as My Picks).
  const sportLeagueIds = lg.sports.map((s) => s.sport_league_id);
  const gamesQ = useQuery({
    queryKey: ['period-events', lg.id, selectedId],
    queryFn: () => fetchPeriodEvents(sportLeagueIds, selectedPeriod?.starts_at, selectedPeriod?.ends_at),
    enabled: !!selectedPeriod && sportLeagueIds.length > 0,
  });
  const games = (gamesQ.data ?? []).filter((e) => e.status !== 'cancelled');
  const finished = games.filter((e) => e.status === 'final').length;

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

  const chips = (
    <WeekChips
      weeks={[
        ...periods.map((p) => ({ value: p.id, label: shortPeriodLabel(p.label), title: p.label })),
        OVERALL_CHIP,
      ]}
      value={selectedId || OVERALL}
      onChange={(id) => {
        if (id === OVERALL) return setWeek('overall');
        const p = periods.find((x) => x.id === id);
        if (p) setWeek(p.index);
      }}
    />
  );
  if (!selectedId) {
    return (
      <div className="flex flex-col gap-4">
        {chips}
        <OverallView lg={lg} />
      </div>
    );
  }

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
      {chips}
      <SectionTitle
        title={`Standings · ${selectedPeriod?.label ?? ''}`}
        subtitle={
          gamesQ.isLoading
            ? undefined
            : games.length === 0
              ? 'No games this week.'
              : finished === games.length
                ? `All ${games.length} games final.`
                : `${finished} of ${games.length} games final · ${games.length - finished} left`
        }
      />

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

  // Their record so far: graded right / wrong, games on now, games to play.
  const right = picks.filter((p) => p.correct === true).length;
  const wrong = picks.filter((p) => p.correct === false).length;
  const live = picks.filter((p) => p.correct == null && p.event?.status === 'live').length;
  const toPlay = picks.length - right - wrong - live;

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      tall
      title={<>{member?.display_name}&rsquo;s picks</>}
      description={periodLabel || 'Selected week'}
      bodyClassName="flex flex-col gap-3"
    >
      {q.isLoading && <Skeleton className="h-24 rounded-xl" />}
      {q.isError && (
        <p className="text-sm text-muted-foreground">Picks are hidden until an hour before the first game.</p>
      )}
      {!q.isLoading && !q.isError && picks.length === 0 && (
        <p className="text-sm text-muted-foreground">No picks for this week.</p>
      )}

      {picks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Badge size="sm" variant="success" appearance="light">✓ {right} right</Badge>
          <Badge size="sm" variant="destructive" appearance="light">✗ {wrong} wrong</Badge>
          {(live > 0 || toPlay > 0) && (
            <Badge size="sm" variant="secondary">
              {[live > 0 && `${live} live`, toPlay > 0 && `${toPlay} to play`].filter(Boolean).join(' · ')}
            </Badge>
          )}
        </div>
      )}

      {/* Games under kickoff headers, two team rows each — like the pick sheet. */}
      {groupByKickoff(picks, (p) => starts[p.event_id]).map((grp) => (
        <section key={grp.key} className="flex flex-col gap-3">
          <h3 className="flex items-baseline justify-between px-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{grp.day}</span>
            <span className="normal-case tracking-normal">{grp.time}</span>
          </h3>
          {grp.items.map((p) => {
            const ev = p.event;
            // Scores only once the game is on — unplayed games report 0–0.
            const started = ev?.status === 'live' || ev?.status === 'final';
            const isLive = ev?.status === 'live';
            // Picked side tinted by result: blue while ungraded, green correct,
            // red wrong — matching the bet board and the pick sheet.
            const tone = p.correct === null ? 'bg-blue-500/20'
              : p.correct ? 'bg-brand/20' : 'bg-destructive/20';
            const mark = p.correct === false ? 'wrong' : 'right';
            return (
              <div key={p.id ?? p.event_id} className="flex flex-col gap-1.5">
                {(['away', 'home'] as const).map((side) => (
                  <PickTeam
                    key={side}
                    logo={side === 'away' ? ev?.away_logo : ev?.home_logo}
                    label={(side === 'away' ? ev?.away_abbr || ev?.away_team : ev?.home_abbr || ev?.home_team) || '?'}
                    score={started ? (side === 'away' ? ev?.away_score : ev?.home_score) : null}
                    picked={p.pick_side === side}
                    mark={mark}
                    live={isLive}
                    tone={tone}
                  />
                ))}
              </div>
            );
          })}
        </section>
      ))}

      {/* Tie-breaker: their total-points guess for the week's last game, and
          how far off once it's final — the same row as on the pick sheet. */}
      {!q.isError && member?.tiebreaker_total != null && (
        <div className="flex h-13 items-center gap-2.5 rounded-md bg-muted/60 px-2.5">
          <span className="text-base" aria-hidden>🎯</span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-sm font-semibold text-foreground">Tie-breaker</span>
            <span className="text-xs text-muted-foreground">
              Total points{member.tiebreaker_diff != null ? ` · off by ${member.tiebreaker_diff}` : ''}
            </span>
          </span>
          <span className="text-lg font-bold tabular-nums text-foreground">{member.tiebreaker_total}</span>
        </div>
      )}
    </AppSheet>
  );
}

// One team side inside a member's pick row: logo + abbreviation, then on the
// picked side its mark (✓ / ✗, LIVE while on) left of the score. Scores only
// show once the game has started.
function PickTeam({
  logo, label, score, picked, mark, live, tone,
}: {
  logo?: string | null;
  label: string;
  score?: number | null;
  picked: boolean;
  /** ✓ for a pick that's right or not graded yet, ✗ for a wrong one. */
  mark: 'right' | 'wrong';
  live: boolean;
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
      {picked && live && <span className="text-[10px] font-extrabold tracking-wider text-destructive">LIVE</span>}
      {picked && (mark === 'wrong'
        ? <X className="size-4 shrink-0 text-destructive" aria-label="Wrong pick" />
        : <Check className="size-4 shrink-0 text-foreground/70" aria-label="Their pick" />)}
      {score != null && (
        <span className="w-6 text-right text-sm font-bold tabular-nums text-foreground">{score}</span>
      )}
    </div>
  );
}
