// Client for the Waygerz leagues service (via the gateway at /api).
import { apiJson } from '@/lib/http';
import { API } from './api-paths';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const LEAGUES_API = API.leagues;

export type LeagueType = 'head_to_head' | 'pickem';

export interface LeaguePeriod {
  id: string;
  index: number;
  label: string;
  status: 'upcoming' | 'open' | 'closed' | 'final';
}

export interface LeagueCard {
  id: string;
  name: string;
  logo_url: string | null;
  league_type: LeagueType;
  status: 'draft' | 'active' | 'completed' | 'archived';
  member_count: number;
  my_balance_cents: number | null;
  current_period: LeaguePeriod | null;
  unread_feed_count?: number;
}

export interface LeagueMember {
  user_id: string;
  role: 'commissioner' | 'member';
  display_name: string;
  avatar_key?: string | null;
}

export interface LeagueDetail extends LeagueCard {
  commissioner_id: string;
  description: string | null;
  join_code: string;
  invite_token: string;
  period_type: 'weekly' | 'season';
  starting_balance_cents: number | null;
  min_wager_cents: number | null;
  max_wager_cents: number | null;
  rules: Record<string, unknown>;
  members: LeagueMember[];
  sports: LeagueSportRef[];
  my_role: 'commissioner' | 'member';
}

export interface LeagueSportRef {
  sport_league_id: string;
  name: string | null;
}

export interface LeaguePreview {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  league_type: LeagueType;
  status: string;
  period_type: 'weekly' | 'season';
  starting_balance_cents: number | null;
  min_wager_cents: number | null;
  max_wager_cents: number | null;
  rules: Record<string, unknown>;
  member_count: number;
  sports: LeagueSportRef[];
  commissioner_name: string | null;
  join_code: string;
  viewer_membership?: 'none' | 'member' | 'left' | null;
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
  created_at: string;
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

function req<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, options);
}

export const leaguesApi = {
  list: () => req<{ leagues: LeagueCard[] }>(`${LEAGUES_API}/`).then((d) => d.leagues ?? []),
  get: (id: string) => req<{ league: LeagueDetail }>(`${LEAGUES_API}/${id}`).then((d) => d.league),
  preview: (code: string) =>
    req<{ preview: LeaguePreview }>(`${LEAGUES_API}/preview?code=${encodeURIComponent(code)}`).then((d) => d.preview),
  create: (input: CreateLeagueInput) =>
    req<{ league: LeagueDetail }>(`${LEAGUES_API}/`, { method: 'POST', body: JSON.stringify(input) }).then((d) => d.league),
  join: (code: string) =>
    req<{ league: LeagueDetail }>(`${LEAGUES_API}/join`, { method: 'POST', body: JSON.stringify({ code }) }).then((d) => d.league),
  activate: (id: string) =>
    req<{ league: LeagueDetail }>(`${LEAGUES_API}/${id}/activate`, { method: 'POST' }).then((d) => d.league),
  update: (id: string, payload: Record<string, unknown>) =>
    req<{ league: LeagueDetail }>(`${LEAGUES_API}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then((d) => d.league),
  advancePeriod: (id: string) =>
    req<{ league: LeagueDetail }>(`${LEAGUES_API}/${id}/advance-period`, { method: 'POST' }).then((d) => d.league),
  leave: (id: string) => req(`${LEAGUES_API}/${id}/leave`, { method: 'POST' }),
  archive: (id: string) => req(`${LEAGUES_API}/${id}/archive`, { method: 'POST' }),
  removeMember: (id: string, uid: string) =>
    req(`${LEAGUES_API}/${id}/members/${uid}`, { method: 'DELETE' }),
  invites: () => req<{ invites: Invite[] }>(`${LEAGUES_API}/invites`).then((d) => d.invites ?? []),
  acceptInvite: (id: string) => req(`${LEAGUES_API}/${id}/join`, { method: 'POST' }),
  sendInvites: (id: string, invitee_ids: string[]) =>
    req(`${LEAGUES_API}/${id}/invites`, { method: 'POST', body: JSON.stringify({ invitee_ids }) }),
  feed: (id: string) => req<{ feed: FeedItem[] }>(`${LEAGUES_API}/${id}/feed`).then((d) => d.feed ?? []),
  postFeed: (id: string, payload: { title?: string; body?: string; link_url?: string; link_label?: string }) =>
    req(`${LEAGUES_API}/${id}/feed`, { method: 'POST', body: JSON.stringify(payload) }),
  standings: (id: string) =>
    req<{ standings: StandingRow[]; period_id: string | null }>(`${LEAGUES_API}/${id}/standings`),
  periods: (id: string) =>
    req<{ periods: LeaguePeriod[] }>(`${LEAGUES_API}/${id}/periods`).then((d) => d.periods ?? []),
  getPicks: (id: string, periodId: string) =>
    req<{ picks: PickRow[] }>(`${LEAGUES_API}/${id}/periods/${periodId}/picks`).then((d) => d.picks ?? []),
  submitPicks: (
    id: string,
    periodId: string,
    picks: { event_id: string; side: 'home' | 'away'; tiebreaker_total?: number }[],
  ) =>
    req(`${LEAGUES_API}/${id}/periods/${periodId}/picks`, { method: 'PUT', body: JSON.stringify({ picks }) }),
  periodResults: (id: string, periodId: string) =>
    req<PeriodResults>(`${LEAGUES_API}/${id}/periods/${periodId}/results`),
  memberPicks: (id: string, periodId: string, userId: string) =>
    req<{ picks: PickRow[] }>(`${LEAGUES_API}/${id}/periods/${periodId}/members/${userId}/picks`).then((d) => d.picks ?? []),
  confirmMember: (id: string, periodId: string, userId: string, confirmed: boolean) =>
    req(`${LEAGUES_API}/${id}/periods/${periodId}/members/${userId}/confirm`, {
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
