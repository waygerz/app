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
  /** Set while one side is waiting on the other to approve calling the bet off. */
  cancel_requested_by: string | null;
  cancel_requested_at: string | null;
  proposer_name: string;
  acceptor_name: string;
  winner_name: string | null;
  created_at: string;
  completed_at: string | null;
  settled_at: string | null;
}

/**
 * Cancelling shuts this long before kickoff. Mirrors CANCEL_LOCK_SECONDS in the
 * contests service, which is what actually enforces it — this only keeps the UI
 * from offering a button the server would reject.
 */
export const CANCEL_LOCK_MS = 10 * 60_000;

/** True once a wager is inside the pre-game window where nobody may cancel. */
export function cancelLocked(w: Wager): boolean {
  if (!w.start_time) return false; // unknown start doesn't lock, same as the backend
  const t = new Date(w.start_time).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() >= t - CANCEL_LOCK_MS;
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
  // Field-sport (golf, racing) matchup: the proposer's two competitor picks.
  // home_team is the side the proposer backs; ignored for team/1v1 events.
  home_team?: string;
  away_team?: string;
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
  // Accepted wagers hold both stakes, so calling one off takes both sides:
  // one requests, the other approves (or rejects, leaving the bet standing).
  requestCancel: (id: string) => req(`${WAGERS_API}/${id}/cancel/request`, { method: 'POST' }),
  approveCancel: (id: string) => req(`${WAGERS_API}/${id}/cancel/approve`, { method: 'POST' }),
  rejectCancel: (id: string) => req(`${WAGERS_API}/${id}/cancel/reject`, { method: 'POST' }),
  // Peer-confirm a completed wager: 'lost' concedes to the opponent (paying
  // them), 'draw' refunds both. The winner is paid when the loser concedes.
  confirm: (id: string, result: WagerResult) =>
    req(`${WAGERS_API}/${id}/confirm`, { method: 'POST', body: JSON.stringify({ result }) }),
};
