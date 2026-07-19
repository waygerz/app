'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchEventOdds, type EventOdds, type SportEvent } from '@/lib/ingestor';
import { isFieldSport } from '@/lib/espn';
import { cn } from '@/lib/utils';
import { Trophy } from 'lucide-react';

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

export function TeamLogo({
  src,
  name,
  className,
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  if (!src) {
    return (
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground sm:size-14 sm:text-base',
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
      className={cn('size-10 shrink-0 object-contain sm:size-14', className)}
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
function OddsPanel({ odds }: { odds: EventOdds }) {
  const { moneyline, spread, overUnder } = odds;
  if (!moneyline && !spread && !overUnder) {
    return <div className="text-center text-xs text-muted-foreground">No odds available.</div>;
  }
  const head = 'text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground';
  return (
    <div className="grid grid-cols-3 items-start gap-x-1 gap-y-1.5 rounded-md bg-muted/50 p-2 sm:gap-x-2">
      <span className={head}>Spread</span>
      <span className={head}>Money</span>
      <span className={head}>Total</span>

      <OddsCell main={spread ? fmtSigned(-spread.line) : '—'} sub={spread ? `(${fmtSigned(spread.away)})` : undefined} />
      <OddsCell main={fmtSigned(moneyline?.away)} />
      <OddsCell main={overUnder ? `O ${overUnder.total}` : '—'} sub={overUnder ? `(${fmtSigned(overUnder.over)})` : undefined} />

      <OddsCell main={spread ? fmtSigned(spread.line) : '—'} sub={spread ? `(${fmtSigned(spread.home)})` : undefined} />
      <OddsCell main={fmtSigned(moneyline?.home)} />
      <OddsCell main={overUnder ? `U ${overUnder.total}` : '—'} sub={overUnder ? `(${fmtSigned(overUnder.under)})` : undefined} />
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
