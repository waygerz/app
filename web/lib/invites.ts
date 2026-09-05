// Unified invite-code client for the /c/<code> route. The code's leading
// letter picks the owning service (L -> leagues, F -> friends); both return the
// same shared contract shape (see INVITE_CODES_DESIGN.md).
import { API } from './api-paths';
import { apiFetch, apiJson } from './http';
import type { LeagueType } from './leagues';
import type { Wager } from './wagers';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export type InviteType = 'league' | 'friend' | 'bet';
export type CodeState = 'ok' | 'invalid' | 'expired' | 'consumed';
export type InviteAction = 'join' | 'add' | 'accept' | 'decline';

export interface LeagueCodePreview {
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
  sports: { sport_league_id: string; name: string | null }[];
  commissioner_name: string | null;
}

export interface FriendCodePreview {
  user: { id: string; display_name: string; avatar_key: string | null };
}

export interface BetCodePreview {
  wager: Wager;
}

export interface ResolvedCode {
  type: InviteType;
  code: string;
  target_id: string | null;
  state: CodeState;
  single_use: boolean;
  viewer: {
    authenticated: boolean;
    relationship: string;
    request_id?: string | null;
    /** For a bet code: is it this viewer's turn to Accept/Decline (drives the CTA
     * after a counter, when it may be the proposer's turn — not just the acceptor). */
    my_turn?: boolean;
  };
  preview: LeagueCodePreview | FriendCodePreview | BetCodePreview | null;
  actions: InviteAction[];
}

export interface ActResult {
  type: InviteType;
  target_id: string;
}

/** Strip display grouping dashes and normalize casing. */
export function normalizeCode(raw: string): string {
  return (raw || '').replace(/-/g, '').trim().toUpperCase();
}

function serviceFor(code: string): string {
  if (code.startsWith('F')) return API.friends;
  if (code.startsWith('B')) return API.contests;
  return API.leagues;
}

/** Resolve a code to its preview + allowed actions. Reads the body even on a
 * 404 so invalid/expired/consumed states still render. */
export async function resolveCode(code: string): Promise<ResolvedCode> {
  const c = normalizeCode(code);
  const res = await apiFetch(`${BASE}${serviceFor(c)}/c/${encodeURIComponent(c)}`);
  const data = await res.json().catch(() => null);
  if (data && typeof data === 'object' && 'type' in data) {
    return data as ResolvedCode;
  }
  return {
    type: c.startsWith('F') ? 'friend' : c.startsWith('B') ? 'bet' : 'league',
    code: c,
    target_id: null,
    state: 'invalid',
    single_use: false,
    viewer: { authenticated: false, relationship: 'none' },
    preview: null,
    actions: [],
  };
}

/** Perform an action on a code; returns where the client should navigate. */
export function actOnCode(code: string, action: InviteAction): Promise<ActResult> {
  const c = normalizeCode(code);
  return apiJson<ActResult>(`${BASE}${serviceFor(c)}/c/${encodeURIComponent(c)}/act`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

/** Get-or-create the caller's reusable personal friend link code. */
export function myFriendCode(): Promise<{ code: string }> {
  return apiJson<{ code: string }>(`${BASE}${API.friends}/my-code`);
}

/** Build the shareable deep link for a code. Client-only (uses window). */
export function inviteUrl(code: string): string {
  return `${window.location.origin}/c/${normalizeCode(code)}`;
}
