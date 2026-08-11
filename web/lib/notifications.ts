// Client for the Waygerz notifications service — the user-facing feed (cookie session).
import { useQuery } from '@tanstack/react-query';
import { API } from './api-paths';
import { apiJson } from './http';
import { useAuth } from '@/auth/AuthContext';

const NOTIFICATIONS_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export type NotificationRefType = 'wager' | 'league' | 'friend' | null;

export interface FeedNotification {
  id: string;
  category: string;
  // The specific event (wager_proposed, wager_settled_win, friend_request, …) —
  // drives the icon and which inline action to offer. Null on legacy rows.
  template_key: string | null;
  title: string;
  body: string;
  // Who it's from, when applicable — lets the sheet show their avatar.
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar_key: string | null;
  ref_type: NotificationRefType;
  ref_id: string | null;
  deep_link: string | null;
  read: boolean;
  created_at: string;
}

export type NotificationCategory =
  | 'wager_alert'
  | 'league_invite'
  | 'friend_request'
  | 'weekly_digest'
  | 'marketing';
export type NotificationChannel = 'sms' | 'inapp';

export type ChannelToggles = Record<NotificationChannel, boolean>;

export interface NotificationPreferences {
  opted_out: boolean; // global STOP — silences the in-app bell and SMS
  channels: Record<NotificationCategory, ChannelToggles>;
}

// A partial patch: set opted_out and/or any subset of category→channel toggles.
export interface NotificationPreferencesPatch {
  opted_out?: boolean;
  channels?: Partial<Record<NotificationCategory, Partial<ChannelToggles>>>;
}

function req<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
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
  getPreferences: () =>
    req<{ preferences: NotificationPreferences }>(`${API.notifications}/me/preferences`),
  updatePreferences: (patch: NotificationPreferencesPatch) =>
    req<{ preferences: NotificationPreferences }>(`${API.notifications}/me/preferences`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
};

// Unread-notification badge count for the shell nav. Uses the light
// /me/unread-count endpoint (not the full feed) since the feed is no longer
// always mounted. The /notifications page invalidates ['notifications-unread']
// on mark-read so the bell badge here decrements immediately.
export function useUnreadNotifications(): number {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => notificationsApi.unreadCount(),
    enabled: !!user,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  return q.data?.unread ?? 0;
}
