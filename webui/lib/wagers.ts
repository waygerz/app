// Client for the Waygerz contests service — head-to-head wagers (cookie session).
import { API } from './api-paths';
import { apiJson } from './http';

const WAGERS_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const WAGERS_API = `${API.contests}/wagers`;

export type WagerStatus =
  | 'open'
  | 'accepted'
  | 'completed'
  | 'settled'
  | 'declined'
  | 'cancelled'
  | 'refunded';

// Result a member reports when confirming a completed head-to-head wager. Only
// the losing side settles: 'lost' concedes (pays the opponent) or 'draw'
// refunds both. There is no 'won' — nobody can claim their own win.
export type WagerResult = 'lost' | 'draw';

export interface Wager {
  id: string;
  league_id: string;
  period_id: string | null;
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
  confirmed_by_id: string | null;
  proposer_name: string;
  acceptor_name: string;
  winner_name: string | null;
  created_at: string;
  completed_at: string | null;
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
  // Peer-confirm a completed wager: 'lost' concedes to the opponent (paying
  // them), 'draw' refunds both. The winner is paid when the loser concedes.
  confirm: (id: string, result: WagerResult) =>
    req(`${WAGERS_API}/${id}/confirm`, { method: 'POST', body: JSON.stringify({ result }) }),
};
