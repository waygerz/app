// Client for the Waygerz ingestor service (sports data).
// The browser talks to the ingestor, never to realtimesportsapi.com directly —
// the ingestor holds the API key and does the caching / quota guarding.
import { API } from './api-paths';

const INGESTOR_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const INGESTOR_API = `${INGESTOR_URL}${API.ingestor}`;

export interface Sport {
  id: string;
  name: string;
  slug: string;
  displayName: string;
}

export async function fetchSports(): Promise<Sport[]> {
  const res = await fetch(`${INGESTOR_API}/sports`);
  if (!res.ok) throw new Error(`Failed to load sports (${res.status})`);
  const data = await res.json();
  return (data.sports ?? []) as Sport[];
}

export interface League {
  id: string;
  sport_league_id?: string; // catalog id minted by the ingestor (use this to reference a league)
  name: string;
  slug: string;
  abbreviation?: string;
  shortName?: string;
  isTournament?: boolean;
  currentSeason?: number;
  logo?: string | null; // ESPN-sourced league logo (null when none available)
}

export async function fetchLeagues(sport: string): Promise<League[]> {
  const res = await fetch(`${INGESTOR_API}/sports/${sport}/leagues`);
  if (!res.ok) throw new Error(`Failed to load leagues (${res.status})`);
  const data = await res.json();
  return (data.leagues ?? []) as League[];
}

export interface SportEvent {
  id: number;
  external_id: string;
  sport: string;
  league: string;
  sport_league_id?: string | null;
  name: string;
  short_name?: string;
  home_team: string;
  home_abbr?: string;
  away_team: string;
  away_abbr?: string;
  start_time: string | null;
  status: 'scheduled' | 'live' | 'final' | 'cancelled';
  home_score: number | null;
  away_score: number | null;
  winner_side: 'home' | 'away' | 'draw' | null;
  home_logo?: string | null;
  away_logo?: string | null;
  // Last-known odds persisted by the ingestor; present on list responses so the
  // UI can render lines without a per-event API call.
  odds?: EventOdds | null;
}

export interface Team {
  id: number;
  external_id: string;
  sport: string;
  league: string;
  name: string;
  abbreviation?: string;
  slug?: string;
  location?: string;
  color?: string;
  alternate_color?: string;
  logo?: string | null;
}

export async function fetchTeams(sport: string, league: string): Promise<Team[]> {
  const res = await fetch(`${INGESTOR_API}/sports/${sport}/leagues/${league}/teams`);
  if (!res.ok) throw new Error(`Failed to load teams (${res.status})`);
  const data = await res.json();
  return (data.teams ?? []) as Team[];
}

export async function fetchLeagueEvents(
  sport: string,
  league: string,
): Promise<SportEvent[]> {
  const res = await fetch(`${INGESTOR_API}/sports/${sport}/leagues/${league}/events`);
  if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
  const data = await res.json();
  return (data.events ?? []) as SportEvent[];
}

export interface EventOdds {
  provider?: string;
  moneyline?: { home: number; away: number };
  spread?: { line: number; home: number; away: number };
  overUnder?: { total: number; over: number; under: number };
  updatedAt?: string;
}

// On-demand betting odds for one event. Cached short-TTL + quota-guarded by the
// ingestor, so this is only called when a user actually opens a game's odds.
export async function fetchEventOdds(
  sport: string,
  league: string,
  eventId: string,
): Promise<EventOdds> {
  const res = await fetch(
    `${INGESTOR_API}/sports/${sport}/leagues/${league}/events/${eventId}/odds`,
  );
  if (!res.ok) throw new Error(`Failed to load odds (${res.status})`);
  const data = await res.json();
  return (data.odds ?? {}) as EventOdds;
}

export async function fetchEvent(externalId: string): Promise<SportEvent | null> {
  const res = await fetch(`${INGESTOR_API}/events/${externalId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load event (${res.status})`);
  const data = await res.json();
  return data.event as SportEvent;
}

// Reads from our pgsql cache (no extra API quota) — events already synced.
// Pass sportLeagueIds to restrict to a league's catalog sport-leagues.
export async function fetchUpcomingEvents(
  limit = 12,
  sportLeagueIds?: string[],
): Promise<SportEvent[]> {
  const params = new URLSearchParams({ status: 'scheduled', limit: String(limit) });
  // Only games that haven't started. Belt-and-suspenders with the backend
  // reaper: an event whose score fetch was missed can sit in 'scheduled' past
  // its start until reaped, and it must never appear as "upcoming".
  params.set('starts_after', new Date().toISOString());
  if (sportLeagueIds && sportLeagueIds.length) {
    params.set('sport_league_id', sportLeagueIds.join(','));
  }
  const res = await fetch(`${INGESTOR_API}/events?${params}`);
  if (!res.ok) throw new Error(`Failed to load upcoming events (${res.status})`);
  const data = await res.json();
  return (data.events ?? []) as SportEvent[];
}

// Events for one league period's window (any status, so a finished week still
// shows its results). Scopes to the league's own sport-leagues.
export async function fetchPeriodEvents(
  sportLeagueIds: string[],
  startISO?: string | null,
  endISO?: string | null,
): Promise<SportEvent[]> {
  const params = new URLSearchParams({ limit: '250' });
  if (sportLeagueIds.length) params.set('sport_league_id', sportLeagueIds.join(','));
  if (startISO) params.set('starts_after', startISO);
  if (endISO) params.set('starts_before', endISO);
  const res = await fetch(`${INGESTOR_API}/events?${params}`);
  if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
  const data = await res.json();
  return (data.events ?? []) as SportEvent[];
}
