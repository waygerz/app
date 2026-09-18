// Client for the Waygerz friends service (cookie session).
import { API } from './api-paths';
import { apiRequest } from './http';

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

export const friendsApi = {
  list: () => apiRequest<{ friends: Friend[] }>(`${API.friends}/`).then((d) => d.friends ?? []),
  requests: () =>
    apiRequest<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>(`${API.friends}/requests`),
  addByUserId: (userId: string | number) =>
    apiRequest(`${API.friends}/requests`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  accept: (id: string | number) =>
    apiRequest(`${API.friends}/requests/${id}/accept`, { method: 'POST' }),
  decline: (id: string | number) =>
    apiRequest(`${API.friends}/requests/${id}/decline`, { method: 'POST' }),
  remove: (userId: string) =>
    apiRequest(`${API.friends}/users/${userId}`, { method: 'DELETE' }),
};
