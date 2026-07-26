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
  proposer_side: WagerSide;
  acceptor_side: WagerSide;
  bet_type: BetType;
  line: number | null;
  amount_cents: number;
  status: WagerStatus;
  winner_user_id: string | null;
  confirmed: boolean;
  /** Set while one side is waiting on the other to approve calling the bet off. */
  cancel_requested_by: string | null;
  cancel_requested_at: string | null;
  proposer_name: string;
  acceptor_name: string;
  proposer_avatar_key?: string | null;
  acceptor_avatar_key?: string | null;
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

export type BetType = 'moneyline' | 'spread' | 'total';
export type WagerSide = 'home' | 'away' | 'over' | 'under';

/**
 * The pick as a short phrase from a given side's perspective:
 *   moneyline → "Atlanta Braves"
 *   spread    → "Atlanta Braves -1.5"
 *   total     → "Over 8.5"
 *
 * `line` is stored from the proposer's side, so for a spread it flips sign when
 * we're describing the acceptor's side. A total's line is the same for both.
 */
export function wagerPick(
  w: Pick<Wager, 'bet_type' | 'line' | 'home_team' | 'away_team' | 'proposer_side'>,
  side: WagerSide,
): string {
  if (w.bet_type === 'total') {
    const l = w.line ?? '';
    return `${side === 'over' ? 'Over' : 'Under'} ${l}`.trim();
  }
  const team = side === 'home' ? w.home_team : w.away_team;
  if (w.bet_type === 'spread' && w.line != null) {
    const ln = side === w.proposer_side ? w.line : -w.line;
    const s = ln > 0 ? `+${ln}` : `${ln}`;
    return `${team} ${s}`;
  }
  return team;
}

// ---------------------------------------------------------------------------
// Grouping. One member can offer the same bet (same game, pick, stake) to
// several friends at once — those land as separate wagers, but the My Bets
// cards fold the siblings into a single card ("vs Farrell, Johnny +3") whose
// Cancel / Confirm buttons act on the whole group.
// ---------------------------------------------------------------------------

export interface WagerGroup {
  key: string;
  /** Representative — every sibling shares game, pick, stake, status and action. */
  rep: Wager;
  /** All wagers folded into this card (length 1 when there's nothing to fold). */
  wagers: Wager[];
  /** The other party of each sibling, in list order. */
  opponents: { id: string; name: string; avatar_key?: string | null }[];
  /** True when the viewer proposed the bet (false when they were challenged). */
  iAmProposer: boolean;
  /** The side the viewer backs. */
  viewerSide: WagerSide;
}

/** The side the viewer is on (their pick), whoever proposed the bet. */
export function viewerSide(w: Wager, me: string): WagerSide {
  return w.proposer_id === me ? w.proposer_side : w.acceptor_side;
}

// Two siblings only merge when they'd render an identical card AND offer the
// identical action — so a batch button is always valid for every member. That
// means same game/pick/stake/status/role plus the same cancel and outcome
// sub-state (so a "you won" bet never merges with a "you lost" one).
function groupKey(w: Wager, me: string): string {
  const cancel =
    w.cancel_requested_by == null ? 'none' : w.cancel_requested_by === me ? 'mine' : 'theirs';
  const outcome =
    w.winner_user_id == null ? 'undecided' : w.winner_user_id === me ? 'won' : 'lost';
  return [
    w.event_id,
    viewerSide(w, me),
    w.bet_type,
    w.line ?? '',
    w.amount_cents,
    w.status,
    w.proposer_id === me ? 'P' : 'A',
    cancel,
    outcome,
  ].join('|');
}

/** Fold a flat wager list into cards, preserving first-seen order. */
export function groupWagers(wagers: Wager[], me: string): WagerGroup[] {
  const byKey = new Map<string, WagerGroup>();
  const order: string[] = [];
  for (const w of wagers) {
    const key = groupKey(w, me);
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        rep: w,
        wagers: [],
        opponents: [],
        iAmProposer: w.proposer_id === me,
        viewerSide: viewerSide(w, me),
      };
      byKey.set(key, g);
      order.push(key);
    }
    g.wagers.push(w);
    g.opponents.push(
      g.iAmProposer
        ? { id: w.acceptor_id, name: w.acceptor_name, avatar_key: w.acceptor_avatar_key }
        : { id: w.proposer_id, name: w.proposer_name, avatar_key: w.proposer_avatar_key },
    );
  }
  return order.map((k) => byKey.get(k)!);
}

/** "Farrell" · "Farrell, Johnny" · "Farrell, Johnny +3" (first two, then a count). */
export function opponentsLabel(names: string[]): string {
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

export interface ProposeInput {
  league_id: string;
  event_id: string;
  side: WagerSide;
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
  // Confirm a completed wager: only the score-decided winner may, which pays
  // them the pot. Nobody else has an action.
  confirm: (id: string) => req(`${WAGERS_API}/${id}/confirm`, { method: 'POST' }),
};
