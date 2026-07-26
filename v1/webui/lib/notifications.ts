// Client for the Waygerz notifications service — the user-facing feed (cookie session).
import { API } from './api-paths';
import { apiJson } from './http';

const NOTIFICATIONS_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export type NotificationRefType = 'wager' | 'league' | 'friend' | null;

export interface FeedNotification {
  id: string;
  category: string;
  title: string;
  body: string;
  ref_type: NotificationRefType;
  ref_id: string | null;
  deep_link: string | null;
  read: boolean;
  created_at: string;
}

function req<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  return apiJson<T>(`${NOTIFICATIONS_URL}${path}`, options);
}

export const notificationsApi = {
  list: (limit = 50) =>
    req<{ notifications: FeedNotification[]; unread: number }>(`${API.notifications}/me?limit=${limit}`),
  unreadCount: () => req<{ unread: number }>(`${API.notifications}/me/unread-count`),
  // Mark the given ids read, or all when omitted.
  markRead: (ids?: string[]) =>
    req<{ updated: number }>(`${API.notifications}/me/read`, {
      method: 'POST',
      body: JSON.stringify({ ids: ids ?? null }),
    }),
};
