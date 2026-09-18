// Client for the Waygerz users (profile) service: display name, avatar, and
// favorite teams. Split out of auth — the credentials/session still live on
// authApi; this is the profile half of the signed-in user.
import { API } from './api-paths';
import { apiRequest } from './http';

export interface FavoriteTeam {
  sport: string;
  league: string;
  external_id: string;
  name: string;
  abbreviation: string;
  logo: string | null;
  color: string | null;
  position: number;
}

export interface UserProfile {
  user_id: string;
  display_name: string;
  avatar_key: string | null;
  favorite_teams: FavoriteTeam[];
}

/** A team snapshot to save (no position — order in the array is the order). */
export type FavoriteTeamInput = Omit<FavoriteTeam, 'position'>;

/** Max favorite teams per user — keep in sync with users FAVORITE_TEAMS_MAX. */
export const MAX_FAVORITE_TEAMS = 6;

/** A pinned sports league (private to the user; not on the public profile). */
export interface FavoriteLeague {
  sport: string;
  league: string;
  name: string;
  abbreviation: string | null;
  logo: string | null;
  position: number;
}

/** A league to pin (no position — order in the array is the order). */
export type FavoriteLeagueInput = Omit<FavoriteLeague, 'position'>;

/** Max pinned leagues per user — keep in sync with users FAVORITE_LEAGUES_MAX. */
export const MAX_FAVORITE_LEAGUES = 20;

export const usersApi = {
  /** The signed-in user's own profile (display name, avatar, favorites). */
  getMyProfile: () => apiRequest<{ profile: UserProfile }>(`${API.users}/profile`),

  updateProfile: (patch: { display_name?: string }) =>
    apiRequest<{ profile: UserProfile }>(`${API.users}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  setAvatar: (avatar_key: string | null) =>
    apiRequest<{ profile: UserProfile }>(`${API.users}/profile/avatar`, {
      method: 'PATCH',
      body: JSON.stringify({ avatar_key }),
    }),

  /** Replace the whole ordered favorites list (first = primary, max 6). */
  saveFavorites: (teams: FavoriteTeamInput[]) =>
    apiRequest<{ favorite_teams: FavoriteTeam[] }>(`${API.users}/favorites/teams`, {
      method: 'PUT',
      body: JSON.stringify({ teams }),
    }),

  /** The signed-in user's pinned leagues, in pin order. */
  getFavoriteLeagues: () =>
    apiRequest<{ favorite_leagues: FavoriteLeague[] }>(`${API.users}/favorites/leagues`),

  /** Replace the whole ordered pinned-leagues list. */
  saveFavoriteLeagues: (leagues: FavoriteLeagueInput[]) =>
    apiRequest<{ favorite_leagues: FavoriteLeague[] }>(`${API.users}/favorites/leagues`, {
      method: 'PUT',
      body: JSON.stringify({ leagues }),
    }),

  /** Another user's public profile (name, avatar, favorite teams). */
  getUserProfile: (userId: string) =>
    apiRequest<{ profile: UserProfile }>(`${API.users}/users/${encodeURIComponent(userId)}/profile`),
};
