// Client for the Waygerz friends service (cookie session).
import { API } from './api-paths';
import { apiJson } from './http';

const FRIENDS_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface Friend {
  friendship_id: number;
  user_id: number;
  display_name: string;
  avatar_key?: string | null;
}

export interface FriendRequest {
  id: number;
  user_id: number;
  display_name: string;
  avatar_key?: string | null;
}


function req<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  return apiJson<T>(`${FRIENDS_URL}${path}`, options);
}

export const friendsApi = {
  list: () => req<{ friends: Friend[] }>(`${API.friends}/`).then((d) => d.friends ?? []),
  requests: () =>
    req<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>(`${API.friends}/requests`),
  addByUserId: (userId: string | number) =>
    req(`${API.friends}/requests`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  accept: (id: string | number) =>
    req(`${API.friends}/requests/${id}/accept`, { method: 'POST' }),
  decline: (id: string | number) =>
    req(`${API.friends}/requests/${id}/decline`, { method: 'POST' }),
  remove: (userId: string) =>
    req(`${API.friends}/users/${userId}`, { method: 'DELETE' }),
};
