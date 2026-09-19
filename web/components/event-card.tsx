'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchEventOdds, type EventOdds, type SportEvent } from '@/lib/ingestor';
import { isFieldSport } from '@/lib/espn';
import { cn } from '@/lib/utils';
import { ChevronRight, Trophy } from 'lucide-react';

function StatusBadge({ status }: { status: SportEvent['status'] }) {
  if (status === 'live') return <Badge variant="destructive" size="sm">LIVE</Badge>;
  if (status === 'final') return <Badge variant="secondary" size="sm">Final</Badge>;
  if (status === 'cancelled')
    return <Badge variant="outline" size="sm">Cancelled</Badge>;
  return (
    <Badge variant="primary" size="sm" appearance="light">
      Scheduled
    </Badge>
  );
}

export function formatStart(iso: string | null) {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'TBD';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Standard team-logo sizes. Keep the set small: xs for dense inline chips,
// sm for dialog / compact rows, lg for the prominent matchup cards. `className`
// still overrides for the rare exception.
const LOGO_SIZE = {
  xs: { span: 'size-6 text-[9px]', img: 'size-6' },
  sm: { span: 'size-8 text-[11px]', img: 'size-8' },
  lg: { span: 'size-10 text-sm sm:size-14 sm:text-base', img: 'size-10 sm:size-14' },
} as const;

export type TeamLogoSize = keyof typeof LOGO_SIZE;

export function TeamLogo({
  src,
  name,
  className,
  framed,
  size = 'lg',
}: {
  src?: string | null;
  name: string;
  className?: string;
  /** Sit the logo on a light rounded chip so transparent/dark marks pop
   *  against a dark row (used in the compact My Bets rows). */
  framed?: boolean;
  /** One of the standard sizes: xs = 24px, sm = 32px, lg = 40→56 responsive. */
  size?: TeamLogoSize;
}) {
  const s = LOGO_SIZE[size];
  if (!src) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-muted font-bold text-foreground',
          s.span,
          className,
        )}
      >
        {name.slice(0, 3).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={cn(
        'shrink-0 object-contain',
        s.img,
        framed && 'rounded-full bg-white p-0.5 ring-1 ring-black/10',
        className,
      )}
      loading="lazy"
    />
  );
}

// One side of the matchup: a single horizontal row — logo, name, score.
function TeamRow({
  name,
  abbr,
  logo,
  score,
  isWinner,
}: {
  name: string;
  abbr?: string;
  logo?: string | null;
  score: number | null;
  isWinner: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamLogo src={logo} name={abbr || name} />
      <span
        className={`min-w-0 flex-1 truncate text-base text-foreground sm:text-xl ${
          isWinner ? 'font-bold' : 'font-medium'
        }`}
      >
        {name}
      </span>
      {score !== null && (
        <span className={`text-base tabular-nums sm:text-xl ${isWinner ? 'font-bold text-brand' : 'font-medium text-foreground'}`}>
          {score}
        </span>
      )}
    </div>
  );
}

// Signed number for American odds (+160 / -192) and spread lines (+5.5 / -5.5).
// Returns '—' for missing values.
function fmtSigned(n?: number) {
  if (n === undefined || n === null) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}

// One odds value: the line on top, its juice (vig) stacked beneath. Stacking
// keeps each cell from wrapping mid-value on narrow screens, and the text
// scales up on larger viewports.
function OddsCell({ main, sub }: { main: string; sub?: string }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-[11px] tabular-nums whitespace-nowrap text-foreground sm:text-xs">{main}</span>
      {sub && (
        <span className="text-[10px] tabular-nums whitespace-nowrap text-muted-foreground">{sub}</span>
      )}
    </span>
  );
}

// Odds as three stat columns (spread / money / total) with two rows — away on
// top, home below — matching the team order in the matchup above.
// Straight-up betting: show only the lines (spread / total). No money line, and
// no juice/price on the spread or total.
function OddsPanel({ odds }: { odds: EventOdds }) {
  const { spread, overUnder } = odds;
  if (!spread && !overUnder) {
    return <div className="text-center text-xs text-muted-foreground">No odds available.</div>;
  }
  const head = 'text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground';
  return (
    <div className="grid grid-cols-2 items-start gap-x-1 gap-y-1.5 rounded-md bg-muted/50 p-2 sm:gap-x-2">
      <span className={head}>Spread</span>
      <span className={head}>Total</span>

      <OddsCell main={spread ? fmtSigned(-spread.line) : '—'} />
      <OddsCell main={overUnder ? `O ${overUnder.total}` : '—'} />

      <OddsCell main={spread ? fmtSigned(spread.line) : '—'} />
      <OddsCell main={overUnder ? `U ${overUnder.total}` : '—'} />
    </div>
  );
}

// Field sports (golf, racing) are a tournament + a whole field, not a two-team
// game — so the card shows the tournament and invites picking a matchup rather
// than rendering home vs away (whose columns hold a placeholder here).
function TournamentCard({ event: ev, onSelect }: { event: SportEvent; onSelect?: () => void }) {
  const bettable = ev.status === 'scheduled' || ev.status === 'live';
  return (
    <Card
      onClick={onSelect}
      className={cn(
        'min-w-0 gap-3 p-4',
        onSelect ? 'cursor-pointer transition-colors hover:border-primary/60' : '',
      )}
    >
      <div className="flex items-center justify-between">
        <StatusBadge status={ev.status} />
        <span className="text-xs text-muted-foreground">
          {ev.status === 'scheduled' ? formatStart(ev.start_time) : ev.league.toUpperCase()}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:size-14">
          <Trophy className="size-5 sm:size-7" />
        </span>
        <span className="min-w-0 flex-1 text-base font-semibold text-foreground sm:text-xl">
          {ev.name}
        </span>
      </div>
      {bettable && onSelect && (
        <div className="border-t border-border pt-2 text-center text-xs font-medium text-primary">
          Tap to pick a matchup
        </div>
      )}
    </Card>
  );
}

export function EventCard({ event: ev, onSelect }: { event: SportEvent; onSelect?: () => void }) {
  const field = isFieldSport(ev.sport);
  const bettable = ev.status === 'scheduled' || ev.status === 'live';
  const showScore = ev.status === 'live' || ev.status === 'final';

  // Prefer the odds already persisted on the event (served from SQL with the
  // list) — that renders instantly and costs no API quota. Only hit the network
  // when the event has no stored odds yet. Field sports have no two-team odds.
  const oddsQ = useQuery({
    queryKey: ['odds', ev.external_id],
    queryFn: () => fetchEventOdds(ev.sport, ev.league, ev.external_id),
    enabled: bettable && !field && !ev.odds,
    initialData: ev.odds ?? undefined,
    staleTime: 5 * 60_000,
  });

  if (field) return <TournamentCard event={ev} onSelect={onSelect} />;

  return (
    <Card
      onClick={onSelect}
      className={`min-w-0 gap-3 p-4 ${
        onSelect ? 'cursor-pointer transition-colors hover:border-primary/60' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <StatusBadge status={ev.status} />
        <span className="text-xs text-muted-foreground">
          {ev.status === 'scheduled' ? formatStart(ev.start_time) : ev.league.toUpperCase()}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <TeamRow
          name={ev.away_team}
          abbr={ev.away_abbr}
          logo={ev.away_logo}
          score={showScore ? ev.away_score : null}
          isWinner={ev.winner_side === 'away'}
        />
        <TeamRow
          name={ev.home_team}
          abbr={ev.home_abbr}
          logo={ev.home_logo}
          score={showScore ? ev.home_score : null}
          isWinner={ev.winner_side === 'home'}
        />
      </div>

      {bettable && (
        <div className="overflow-x-auto border-t border-border pt-2">
          {oddsQ.isLoading && (
            <div className="text-center text-xs text-muted-foreground">Loading odds…</div>
          )}
          {oddsQ.isError && (
            <div className="text-center text-xs text-muted-foreground">Odds unavailable.</div>
          )}
          {oddsQ.data && <OddsPanel odds={oddsQ.data} />}
        </div>
      )}
    </Card>
  );
}

// ---- Schedule board: one matchup card per game ------------------------------
// The whole card is the button (it opens the bet sheet, where you pick a side),
// so the lines are plain muted text — not boxes that look like separate picks.
// Team sports only; field sports keep EventCard.

function GameTeamLine({ name, abbr, logo, line }: { name: string; abbr?: string; logo?: string | null; line?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <TeamLogo src={logo} name={abbr || name} size="xs" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{name}</span>
      {line && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{line}</span>}
    </span>
  );
}

function GameCard({ ev, onSelect }: { ev: SportEvent; onSelect?: () => void }) {
  const sp = ev.odds?.spread;
  const ou = ev.odds?.overUnder;
  const Wrapper = onSelect ? 'button' : 'div';
  return (
    <Wrapper
      type={onSelect ? 'button' : undefined}
      onClick={onSelect}
      aria-label={onSelect ? `Bet on ${ev.away_team} at ${ev.home_team}` : undefined}
      className={cn(
        'flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left',
        onSelect &&
          'cursor-pointer transition-colors hover:border-primary/60 active:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      )}
    >
      <span className="text-xs text-muted-foreground">{formatStart(ev.start_time)}</span>
      <GameTeamLine name={ev.away_team} abbr={ev.away_abbr} logo={ev.away_logo} line={sp ? fmtSigned(-sp.line) : undefined} />
      <GameTeamLine name={ev.home_team} abbr={ev.home_abbr} logo={ev.home_logo} line={sp ? fmtSigned(sp.line) : undefined} />
      <span className="mt-0.5 flex items-center justify-between border-t border-border pt-2">
        <span className="text-xs tabular-nums text-muted-foreground">
          {ou ? `O/U ${ou.total}` : sp ? '' : 'Lines not posted'}
        </span>
        {onSelect && (
          <span className="flex items-center gap-0.5 text-sm font-semibold text-primary">
            Bet <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </span>
    </Wrapper>
  );
}

export function ScheduleBoard({
  events,
  onSelect,
}: {
  events: SportEvent[];
  onSelect?: (ev: SportEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {events.map((ev) => (
        <GameCard key={ev.external_id} ev={ev} onSelect={onSelect ? () => onSelect(ev) : undefined} />
      ))}
    </div>
  );
}
