// Client for the Waygerz users (profile) service: display name, avatar, and
// favorite teams. Split out of auth — the credentials/session still live on
// authApi; this is the profile half of the signed-in user.
import { API } from './api-paths';
import { apiJson } from './http';

const USERS_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

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

export const usersApi = {
  /** The signed-in user's own profile (display name, avatar, favorites). */
  getMyProfile: () => apiJson<{ profile: UserProfile }>(`${USERS_URL}${API.users}/profile`),

  updateProfile: (patch: { display_name?: string }) =>
    apiJson<{ profile: UserProfile }>(`${USERS_URL}${API.users}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  setAvatar: (avatar_key: string | null) =>
    apiJson<{ profile: UserProfile }>(`${USERS_URL}${API.users}/profile/avatar`, {
      method: 'PATCH',
      body: JSON.stringify({ avatar_key }),
    }),
};
