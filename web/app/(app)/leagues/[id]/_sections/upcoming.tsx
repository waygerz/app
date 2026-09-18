'use client';

import { useState } from 'react';
import { useLeague } from '../league-context';
import { type SportEvent } from '@/lib/ingestor';
import { isFieldSport } from '@/lib/espn';
import { useAuth } from '@/auth/AuthContext';
import { EventCard, ScheduleBoard } from '@/components/event-card';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useScheduled, useFieldReady, type UpcomingRange, upcomingInRange } from './schedule-data';
import { ScheduleBetDialog, MatchupBetDialog } from './bet-dialogs';

// The Upcoming tab (own page): TODAY's games across the league's sports as
// tap-to-bet cards, with All + per-sport filter pills (only for sports actually
// playing today). Reuses the same board + wager dialogs as the Sports hub.
export function LeagueUpcomingGames() {
  const lg = useLeague();
  const { user } = useAuth();
  const me = user?.id;
  const canBet = lg.status === 'active';
  const [selected, setSelected] = useState<SportEvent | null>(null);
  const [tab, setTab] = useState<string>('all'); // 'all' | sport_league_id
  const [range, setRange] = useState<UpcomingRange>('today'); // today | this week

  const events = useScheduled(lg.sports.map((s) => s.sport_league_id));
  const rangeEvs = upcomingInRange(events.data ?? [], lg.timezone, range);

  // Filter pills: All + one per sport that has a game in the range, ordered by
  // that sport's soonest game (rangeEvs is already start-sorted). A range/day
  // change can leave `tab` pointing at a sport with no games left — fall to All.
  const nameOf = new Map(lg.sports.map((s) => [s.sport_league_id, s.name || s.sport_league_id]));
  const sportsInRange: { id: string; label: string }[] = [];
  const seenSport = new Set<string>();
  for (const e of rangeEvs) {
    const id = e.sport_league_id ?? '';
    if (id && !seenSport.has(id)) {
      seenSport.add(id);
      sportsInRange.push({ id, label: nameOf.get(id) ?? id });
    }
  }
  const activeTab = tab !== 'all' && seenSport.has(tab) ? tab : 'all';

  const shown = activeTab === 'all' ? rangeEvs : rangeEvs.filter((e) => e.sport_league_id === activeTab);
  const teamEvs = shown.filter((e) => !isFieldSport(e.sport));
  const fieldEvs = shown.filter((e) => isFieldSport(e.sport));
  // Tournament-style events (golf, racing) aren't tappable until their field is posted.
  const { isBettable } = useFieldReady(shown);

  // Pick'em leagues don't place head-to-head bets, so the tap-to-bet board is
  // hidden there entirely.
  if (lg.league_type === 'pickem') return null;
  if (lg.sports.length === 0) return null;

  const pill = (on: boolean) =>
    cn(
      'shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-colors',
      on
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-input text-muted-foreground hover:bg-muted hover:text-foreground',
    );

  return (
    <div className="flex flex-col gap-3">
      {/* Date range: Today vs a rolling 7 days. */}
      <div className="inline-flex w-fit rounded-full border border-input p-0.5">
        {(['today', 'week'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r === 'today' ? 'Today' : 'This week'}
          </button>
        ))}
      </div>

      {/* Sport filter pills — only when more than one sport plays in the range
          (otherwise "All" and the lone sport are the same list). */}
      {sportsInRange.length > 1 && (
        <div className="w-full min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max min-w-full gap-2">
            <button type="button" onClick={() => setTab('all')} className={pill(activeTab === 'all')}>
              All
            </button>
            {sportsInRange.map((s) => (
              <button key={s.id} type="button" onClick={() => setTab(s.id)} className={pill(activeTab === s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {events.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {range === 'today'
            ? 'No more games today. Try “This week”, or the Sports tab for the full schedule.'
            : 'No games in the next 7 days. Check the Sports tab for the full schedule.'}
        </p>
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
