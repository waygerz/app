'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchUpcomingEvents, type SportEvent } from '@/lib/ingestor';
import { fetchEspnList, isFieldSport } from '@/lib/espn';

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
export function useScheduled(sportLeagueIds: string[]) {
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
export function useFieldReady(evs: SportEvent[]) {
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

// One sport's board (week-paged) or, on the landing "Upcoming" tab, TODAY's
// games across every sport — see upcomingInRange.

// The calendar day (YYYY-MM-DD) an instant falls on in a given IANA zone. Used
// to decide "today" from the LEAGUE's timezone, so every member sees the same
// slate regardless of where they are. Falls back to the device zone if `tz` is
// invalid.
function localDay(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso));
  }
}

export type UpcomingRange = 'today' | 'week';

// "Upcoming" = not-yet-started games across all the league's sports, chronological.
//   today → the league's calendar day (tz above).
//   week  → a rolling 7 days from now.
// No cap: the window is naturally bounded, and the per-sport pills narrow it.
export function upcomingInRange(events: SportEvent[], tz: string, range: UpcomingRange): SportEvent[] {
  const now = Date.now();
  const today = localDay(new Date(now).toISOString(), tz);
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
  return events
    .filter((e) => {
      if (!e.start_time) return false;
      const t = new Date(e.start_time).getTime();
      if (t <= now) return false; // already started
      return range === 'today' ? localDay(e.start_time, tz) === today : t <= weekEnd;
    })
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
}
