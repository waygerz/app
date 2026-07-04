// Client for the Waygerz contests service — parimutuel pools (JWT-authed).
import { API, API_BASE } from './api-paths';
import { apiJson } from './http';

const BASE = API_BASE;
const POOLS_API = `${API.contests}/pools`;

export interface Pool {
  id: string;
  league_id: string;
  event_id: string;
  event_name: string;
  home_team: string;
  away_team: string;
  status: 'open' | 'settled' | 'refunded' | 'cancelled';
  winner_side: 'home' | 'away' | null;
}

export interface PoolStake {
  id: string;
  pool_id: string;
  user_id: string;
  side: 'home' | 'away';
  amount_cents: number;
}

export interface PoolView {
  pool: Pool;
  totals: { home_cents: number; away_cents: number; total_cents: number; stake_count: number };
  my_stakes: PoolStake[];
}

function req<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, options);
}

export const poolsApi = {
  list: (leagueId: string) =>
    req<{ pools: PoolView[] }>(`${POOLS_API}?league_id=${leagueId}`).then((d) => d.pools ?? []),
  stake: (input: { league_id: string; event_id: string; side: 'home' | 'away'; amount_cents: number }) =>
    req(`${POOLS_API}/stake`, { method: 'POST', body: JSON.stringify(input) }),
};
