// Client for the ingestor's ESPN-sourced sports (golf, racing, mma, cricket) —
// the ones RealTimeSportsAPI can't do. Redis-only, on-demand; different shapes
// than the two-team SportEvent, so they get their own client + views.
import { API } from './api-paths';

const INGESTOR_API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}${API.ingestor}`;

export type EspnShape = 'field' | '1v1' | 'team';

/** Sports served by the ESPN ingester, and their shape. */
export const ESPN_SPORTS: Record<string, EspnShape> = {
  golf: 'field',
  racing: 'field',
  mma: '1v1',
  cricket: 'team',
};

export function isEspnSport(sport: string): boolean {
  return sport in ESPN_SPORTS;
}

/** Field sports (golf, racing): a tournament with a whole field, bet as a
 *  player/driver head-to-head matchup rather than a fixed two-team game. */
export function isFieldSport(sport: string): boolean {
  return ESPN_SPORTS[sport] === 'field';
}

export type EspnStatus = 'scheduled' | 'in_progress' | 'final' | 'cancelled';

export interface EspnCompetitor {
  id?: string | null;
  name: string;
  short_name?: string | null;
  order?: number | null;
  score?: string | null;
  winner?: boolean;
  position_display?: string | null;
  status?: string;
  logo?: string | null;
}

export interface EspnFight {
  id: string | null;
  status: EspnStatus;
  a: EspnCompetitor;
  b: EspnCompetitor;
  winner_id: string | null;
  weight_class?: string | null;
}

/** One item's summary — a tournament / race / fight card / match. */
export interface EspnSummary {
  external_id: string;
  sport: string;
  league: string;
  league_name?: string | null;
  name: string;
  short_name?: string | null;
  start_date: string | null;
  end_date?: string | null;
  status: EspnStatus;
  // field (golf, racing)
  field_size?: number;
  winner_id?: string | null;
  // 1v1 (mma)
  fight_count?: number;
  // team (cricket)
  home?: EspnCompetitor | null;
  away?: EspnCompetitor | null;
}

export interface EspnDetail {
  summary: EspnSummary;
  field?: EspnCompetitor[]; // field sports
  fights?: EspnFight[]; // mma
  sides?: EspnCompetitor[]; // cricket
}

// per-sport endpoint + response-key metadata
const PATH: Record<string, string> = {
  golf: '/golf/tournaments',
  racing: '/racing/events',
  mma: '/mma/cards',
  cricket: '/cricket/matches',
};
const LIST_KEY: Record<string, string> = {
  golf: 'tournaments',
  racing: 'races',
  mma: 'cards',
  cricket: 'matches',
};
const ITEM_KEY: Record<string, string> = {
  golf: 'tournament',
  racing: 'race',
  mma: 'card',
  cricket: 'match',
};

/** The noun each sport uses for its items (for headings/empty states). */
export const ITEM_NOUN: Record<string, { one: string; many: string }> = {
  golf: { one: 'tournament', many: 'Tournaments' },
  racing: { one: 'race', many: 'Races' },
  mma: { one: 'card', many: 'Fight cards' },
  cricket: { one: 'match', many: 'Matches' },
};

export async function fetchEspnList(sport: string, league?: string): Promise<EspnSummary[]> {
  const qs = league ? `?league=${encodeURIComponent(league)}` : '';
  const res = await fetch(`${INGESTOR_API}${PATH[sport]}${qs}`);
  if (!res.ok) throw new Error(`Failed to load ${sport} (${res.status})`);
  const data = await res.json();
  return (data[LIST_KEY[sport]] ?? []) as EspnSummary[];
}

export async function fetchEspnDetail(sport: string, externalId: string): Promise<EspnDetail | null> {
  const res = await fetch(`${INGESTOR_API}${PATH[sport]}/${encodeURIComponent(externalId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load ${sport} item (${res.status})`);
  const data = await res.json();
  return {
    summary: data[ITEM_KEY[sport]] as EspnSummary,
    field: data.field,
    fights: data.fights,
    sides: data.sides,
  };
}
