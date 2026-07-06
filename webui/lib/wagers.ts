// Client for the Waygerz contests service — head-to-head wagers (cookie session).
import { API } from './api-paths';
import { apiJson } from './http';

const WAGERS_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const WAGERS_API = `${API.contests}/wagers`;

export type WagerStatus =
  | 'open'
  | 'accepted'
  | 'settled'
  | 'declined'
  | 'cancelled'
  | 'refunded';

export interface Wager {
  id: string;
  league_id: string;
  event_id: string;
  event_name: string;
  league: string;
  home_team: string;
  away_team: string;
  start_time: string | null;
  proposer_id: string;
  acceptor_id: string;
  proposer_side: 'home' | 'away';
  acceptor_side: 'home' | 'away';
  amount_cents: number;
  status: WagerStatus;
  winner_user_id: string | null;
  proposer_name: string;
  acceptor_name: string;
  winner_name: string | null;
  created_at: string;
  settled_at: string | null;
}

function req<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  return apiJson<T>(`${WAGERS_URL}${path}`, options);
}

export type BetType = 'straight_up' | 'ats';

export interface ProposeInput {
  league_id: string;
  event_id: string;
  side: 'home' | 'away';
  amount_cents: number;
  acceptor_ids: string[];
  bet_type?: BetType;
  line?: number | null;
}

export interface ProposeResult {
  created: Wager[];
  errors: { acceptor_id: string; error: string }[];
}

export const wagersApi = {
  mine: (leagueId: string, status?: WagerStatus) => {
    const q = new URLSearchParams({ league_id: leagueId });
    if (status) q.set('status', status);
    return req<{ wagers: Wager[] }>(`${WAGERS_API}?${q}`).then((d) => d.wagers ?? []);
  },
  // All of the current user's wagers across every league (league_id is optional
  // on the backend) — used by the notifications sheet.
  all: (status?: WagerStatus) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    const qs = q.toString();
    return req<{ wagers: Wager[] }>(`${WAGERS_API}${qs ? `?${qs}` : ''}`).then((d) => d.wagers ?? []);
  },
  propose: (input: ProposeInput) =>
    req<ProposeResult>(WAGERS_API, { method: 'POST', body: JSON.stringify(input) }),
  accept: (id: string) => req(`${WAGERS_API}/${id}/accept`, { method: 'POST' }),
  decline: (id: string) => req(`${WAGERS_API}/${id}/decline`, { method: 'POST' }),
  cancel: (id: string) => req(`${WAGERS_API}/${id}/cancel`, { method: 'POST' }),
};
