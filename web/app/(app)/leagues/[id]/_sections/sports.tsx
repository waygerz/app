'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLeague } from '../league-context';
import { useQuery } from '@tanstack/react-query';
import { fetchLeagues, type SportEvent } from '@/lib/ingestor';
import { fetchEspnList, isFieldSport } from '@/lib/espn';
import { useAuth } from '@/auth/AuthContext';
import { EventCard, ScheduleBoard, formatStart } from '@/components/event-card';
import { CenterCard } from '@/components/ui/center-card';
import { ListSearch } from '@/components/list-search';
import { emojiFor } from '@/lib/sport-emoji';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Trophy, CalendarDays } from 'lucide-react';
import { useScheduled, useFieldReady, upcomingInRange } from './schedule-data';
import { ScheduleBetDialog, MatchupBetDialog } from './bet-dialogs';

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
  const { user } = useAuth();
  const me = user?.id;
  const canBet = lg.status === 'active';
  const [tab, setTab] = useState<string>('upcoming'); // 'upcoming' | sport_league_id
  const [selected, setSelected] = useState<SportEvent | null>(null);
  // How many weeks of a sport's schedule to reveal (per-sport tabs only). The
  // "Show next week" button bumps this; switching tabs restarts at one week.
  const [weeksShown, setWeeksShown] = useState(1);
  const selectTab = (next: string) => {
    if (next !== tab) setWeeksShown(1);
    setTab(next);
  };
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
  const base = tab === 'upcoming' ? upcomingInRange(evs, lg.timezone, 'today') : sportSorted;
  const shown = q
    ? base.filter(matchesQuery)
    : tab === 'upcoming'
      ? base
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
          <button type="button" onClick={() => selectTab('upcoming')} className={pill(tab === 'upcoming')}>
            Upcoming
          </button>
          {sortedSports.map((s) => (
            <button
              key={s.sport_league_id}
              type="button"
              onClick={() => selectTab(s.sport_league_id)}
              className={pill(tab === s.sport_league_id)}
            >
              {s.name || s.sport_league_id}
            </button>
          ))}
        </div>
      </div>

      {tab === 'upcoming' && !q && (
        <p className="text-xs text-muted-foreground">
          Today’s games across all your sports{canBet ? ' · tap a game to bet' : ''}.
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
            {q
              ? `No games today match “${query.trim()}”.`
              : tab === 'upcoming'
                ? 'No more games today. Pick a sport tab for its full schedule.'
                : 'No upcoming games right now.'}
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
