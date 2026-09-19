// Client for the Waygerz leagues service (via the gateway at /api).
import { apiRequest } from '@/lib/http';
import { API } from './api-paths';

const LEAGUES_API = API.leagues;

export type LeagueType = 'head_to_head' | 'pickem';

export interface LeaguePeriod {
  id: string;
  index: number;
  label: string;
  starts_at?: string | null;
  ends_at?: string | null;
  status: 'upcoming' | 'open' | 'closed' | 'final';
}

export interface LeagueCard {
  id: string;
  name: string;
  logo_url: string | null;
  league_type: LeagueType;
  status: 'draft' | 'active' | 'completed' | 'archived';
  member_count: number;
  top_members?: { user_id: string; display_name: string; avatar_key?: string | null }[];
  my_balance_cents: number | null;
  current_period: LeaguePeriod | null;
  unread_feed_count?: number;
  /** Pick'em only (null for money and draft leagues): my season rank. */
  my_rank?: number | null;
}

export type LeagueRole = 'commissioner' | 'moderator' | 'member';

export interface LeagueMember {
  user_id: string;
  role: LeagueRole;
  display_name: string;
  avatar_key?: string | null;
}

export interface LeagueDetail extends LeagueCard {
  commissioner_id: string;
  description: string | null;
  // Reusable share code for the /c/<code> deep link. Null only mid-migration.
  invite_code: string | null;
  period_type: 'weekly' | 'season';
  starting_balance_cents: number | null;
  min_wager_cents: number | null;
  max_wager_cents: number | null;
  rules: Record<string, unknown>;
  timezone: string;
  members: LeagueMember[];
  sports: LeagueSportRef[];
  my_role: LeagueRole;
}

export interface LeagueSportRef {
  sport_league_id: string;
  name: string | null;
}

export interface FeedItem {
  id: string;
  kind: 'announcement' | 'activity';
  event_type: string | null;
  author_id: string | null;
  author_name: string | null;
  title: string | null;
  body: string | null;
  link_url: string | null;
  link_label: string | null;
  /** Structured extras. Bet-result posts carry the matchup + final score + stake. */
  meta: FeedMeta | null;
  created_at: string;
}

export interface FeedMeta {
  amount_cents?: number;
  treat?: 'beer' | 'shot';
  away?: string;
  home?: string;
  away_score?: number | null;
  home_score?: number | null;
  [k: string]: unknown;
}

export interface Invite {
  invite_id: string;
  league_id: string;
  league_name: string;
  league_logo: string | null;
  league_type: LeagueType;
  inviter_name: string | null;
}

export interface CreateLeagueInput {
  name: string;
  logo_url?: string | null;
  description?: string | null;
  league_type: LeagueType;
  period_type: 'weekly' | 'season';
  starting_balance_cents?: number | null;
  min_wager_cents?: number | null;
  max_wager_cents?: number | null;
  sports: { sport_league_id: string; name: string }[];
  rules?: Record<string, unknown>;
}

export const leaguesApi = {
  list: () => apiRequest<{ leagues: LeagueCard[] }>(`${LEAGUES_API}/`).then((d) => d.leagues ?? []),
  get: (id: string) => apiRequest<{ league: LeagueDetail }>(`${LEAGUES_API}/${id}`).then((d) => d.league),
  create: (input: CreateLeagueInput) =>
    apiRequest<{ league: LeagueDetail }>(`${LEAGUES_API}/`, { method: 'POST', body: JSON.stringify(input) }).then((d) => d.league),
  activate: (id: string) =>
    apiRequest<{ league: LeagueDetail }>(`${LEAGUES_API}/${id}/activate`, { method: 'POST' }).then((d) => d.league),
  // Commissioner: manually (re)send the pick'em week notification to all members.
  notifyWeek: (id: string) =>
    apiRequest<{ sent: boolean; members: number; finalized: string; opened: string | null; winner_line: string }>(
      `${LEAGUES_API}/${id}/notify-week`, { method: 'POST' },
    ),
  update: (id: string, payload: Record<string, unknown>) =>
    apiRequest<{ league: LeagueDetail }>(`${LEAGUES_API}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then((d) => d.league),
  advancePeriod: (id: string) =>
    apiRequest<{ league: LeagueDetail }>(`${LEAGUES_API}/${id}/advance-period`, { method: 'POST' }).then((d) => d.league),
  leave: (id: string) => apiRequest(`${LEAGUES_API}/${id}/leave`, { method: 'POST' }),
  archive: (id: string) => apiRequest(`${LEAGUES_API}/${id}/archive`, { method: 'POST' }),
  removeMember: (id: string, uid: string) =>
    apiRequest(`${LEAGUES_API}/${id}/members/${uid}`, { method: 'DELETE' }),
  setMemberRole: (id: string, uid: string, role: 'moderator' | 'member') =>
    apiRequest(`${LEAGUES_API}/${id}/members/${uid}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  transferCommissioner: (id: string, uid: string) =>
    apiRequest(`${LEAGUES_API}/${id}/members/${uid}/transfer`, { method: 'POST' }),
  invites: () => apiRequest<{ invites: Invite[] }>(`${LEAGUES_API}/invites`).then((d) => d.invites ?? []),
  acceptInvite: (id: string) => apiRequest(`${LEAGUES_API}/${id}/join`, { method: 'POST' }),
  sendInvites: (id: string, invitee_ids: string[]) =>
    apiRequest(`${LEAGUES_API}/${id}/invites`, { method: 'POST', body: JSON.stringify({ invitee_ids }) }),
  feed: (id: string) => apiRequest<{ feed: FeedItem[] }>(`${LEAGUES_API}/${id}/feed`).then((d) => d.feed ?? []),
  postFeed: (id: string, payload: { title?: string; body?: string; link_url?: string; link_label?: string }) =>
    apiRequest(`${LEAGUES_API}/${id}/feed`, { method: 'POST', body: JSON.stringify(payload) }),
  standings: (id: string) =>
    apiRequest<{ standings: StandingRow[]; period_id: string | null }>(`${LEAGUES_API}/${id}/standings`),
  periods: (id: string) =>
    apiRequest<{ periods: LeaguePeriod[] }>(`${LEAGUES_API}/${id}/periods`).then((d) => d.periods ?? []),
  regeneratePeriods: (id: string) =>
    apiRequest<{ periods: LeaguePeriod[] }>(`${LEAGUES_API}/${id}/periods/regenerate`, { method: 'POST' }).then((d) => d.periods ?? []),
  getPicks: (id: string, periodId: string) =>
    apiRequest<{ picks: PickRow[] }>(`${LEAGUES_API}/${id}/periods/${periodId}/picks`).then((d) => d.picks ?? []),
  submitPicks: (
    id: string,
    periodId: string,
    picks: { event_id: string; side: 'home' | 'away'; tiebreaker_total?: number }[],
  ) =>
    apiRequest(`${LEAGUES_API}/${id}/periods/${periodId}/picks`, { method: 'PUT', body: JSON.stringify({ picks }) }),
  periodResults: (id: string, periodId: string) =>
    apiRequest<PeriodResults>(`${LEAGUES_API}/${id}/periods/${periodId}/results`),
  memberPicks: (id: string, periodId: string, userId: string) =>
    apiRequest<{ picks: PickRow[] }>(`${LEAGUES_API}/${id}/periods/${periodId}/members/${userId}/picks`).then((d) => d.picks ?? []),
  confirmMember: (id: string, periodId: string, userId: string, confirmed: boolean) =>
    apiRequest(`${LEAGUES_API}/${id}/periods/${periodId}/members/${userId}/confirm`, {
      method: 'PUT',
      body: JSON.stringify({ confirmed }),
    }),
};

export interface WeeklyResultRow {
  user_id: string;
  display_name: string;
  avatar_key?: string | null;
  correct: number;
  graded: number;
  total: number;
  tiebreaker_total: number | null;
  tiebreaker_diff: number | null;
  // Competition rank; tied members (same correct + tie-breaker) share a rank.
  rank: number;
  // Commissioner's per-week confirmation flag.
  confirmed: boolean;
}

export interface PeriodResults {
  period: LeaguePeriod;
  last_game: {
    event_id: string;
    name?: string | null;
    home_team?: string | null;
    away_team?: string | null;
    final: boolean;
    actual_total: number | null;
  } | null;
  rows: WeeklyResultRow[];
}

export interface StandingRow {
  user_id: string;
  display_name: string;
  avatar_key?: string | null;
  balance_cents?: number;
  net_cents?: number;
  wins: number;
  losses: number;
  pushes?: number;
  /** Competition rank from the server; tied members share it ("1, 2, 2, 4"). */
  rank: number;
}

export interface PickEventInfo {
  name?: string;
  home_team?: string;
  away_team?: string;
  home_abbr?: string;
  away_abbr?: string;
  home_logo?: string | null;
  away_logo?: string | null;
  status?: string;
  winner_side?: 'home' | 'away' | 'draw' | null;
  home_score?: number | null;
  away_score?: number | null;
}

export interface PickRow {
  id?: string;
  event_id: string;
  pick_side: 'home' | 'away';
  correct: boolean | null;
  tiebreaker_total?: number | null;
  event?: PickEventInfo | null;
}

const TYPE_LABELS: Record<LeagueType, string> = {
  head_to_head: 'Head-to-head',
  pickem: "Pick'em",
};
export const leagueTypeLabel = (t: LeagueType) => TYPE_LABELS[t] ?? t;

/**
 * A week's short chip label, from its full label: "Hall of Fame Weekend" → HF,
 * "Preseason Week 2" → P2, "Week 3" → W3, playoff rounds → WC / DIV / CONF /
 * PB / SB, "Week of Sep 14" → 9/14, "Season 2026" → 2026. Mirrored by the
 * app's `shortPeriodLabel` (mobile/lib/format.dart) — change both together.
 */
export function shortPeriodLabel(label: string): string {
  const l = label.trim();
  const low = l.toLowerCase();
  if (low.startsWith('hall of fame')) return 'HF';
  let m = low.match(/^preseason(?: week)? (\d+)/);
  if (m) return `P${m[1]}`;
  m = low.match(/^week (\d+)$/);
  if (m) return `W${m[1]}`;
  if (low.startsWith('wild card')) return 'WC';
  if (low.startsWith('divisional')) return 'DIV';
  if (low.startsWith('conference')) return 'CONF';
  if (low.startsWith('pro bowl')) return 'PB';
  if (low.startsWith('super bowl')) return 'SB';
  m = low.match(/^week of ([a-z]{3}) (\d{1,2})$/);
  if (m) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1]) + 1;
    if (month > 0) return `${month}/${Number(m[2])}`;
  }
  m = low.match(/^season (\d{4})$/);
  if (m) return m[1];
  // Anything else: initials, at most 3.
  const initials = l.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join('');
  return initials.slice(0, 3) || l.slice(0, 3);
}

// Deterministic avatar background color from the league id (fallback when no logo).
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];
export function leagueColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}
export function leagueInitials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". Mirrors the app's
 * `ordinal` (mobile/lib/format.dart) — change both together. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** The invite code from what someone typed or pasted: a bare code ("L7K2PQX")
 * or a share link (".../c/L7K2PQX"). Uppercased; "" if nothing usable. Mirrors
 * the app's `inviteCodeFrom` (mobile/lib/format.dart) — change both together. */
export function inviteCodeFrom(input: string): string {
  const text = input.trim();
  const fromLink = text.match(/\/c\/([A-Za-z0-9-]+)/);
  const code = fromLink ? fromLink[1] : text;
  return /^[A-Za-z0-9-]+$/.test(code) ? code.toUpperCase() : '';
}
