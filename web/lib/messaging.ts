import { useQuery } from '@tanstack/react-query';
import { API } from './api-paths';
import { apiJson } from './http';
import { useAuth } from '@/auth/AuthContext';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const MESSAGING_API = API.messaging;

export type ConversationUser = {
  id: string;
  display_name: string;
  avatar_key?: string | null;
};

export type Conversation = {
  id: string;
  type: 'direct' | 'league';
  league_id: string | null;
  created_at: string;
  unread_count: number;
  last_message?: ChatMessage;
  other_user?: ConversationUser;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  author_id: string;
  author_name?: string;
  body: string;
  // 'text' (default). Generic message kind + payload; no non-text kinds render today.
  kind?: string;
  meta?: Record<string, unknown> | null;
  created_at: string;
  read_at?: string | null;
  edited_at?: string | null;
  deleted?: boolean;
};

function req<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, options);
}

export const messagingApi = {
  listConversations: () =>
    req<{ conversations: Conversation[] }>(`${MESSAGING_API}/conversations`).then(
      (d) => d.conversations ?? [],
    ),

  unreadCount: () =>
    req<{ total: number; by_conv: Record<string, number> }>(
      `${MESSAGING_API}/conversations/unread-count`,
    ),

  markRead: (conversationId: string) =>
    req<{ ok: boolean }>(`${MESSAGING_API}/conversations/${conversationId}/read`, {
      method: 'POST',
    }),

  sendTyping: (conversationId: string, typing: boolean) =>
    req<{ ok: boolean }>(`${MESSAGING_API}/conversations/${conversationId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ typing }),
    }),

  openDirect: (userId: string) =>
    req<{ conversation: Conversation }>(`${MESSAGING_API}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ type: 'direct', user_id: userId }),
    }).then((d) => d.conversation),

  openLeague: (leagueId: string) =>
    req<{ conversation: Conversation }>(`${MESSAGING_API}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ type: 'league', league_id: leagueId }),
    }).then((d) => d.conversation),

  listMessages: (conversationId: string, limit = 50) =>
    req<{ messages: ChatMessage[] }>(
      `${MESSAGING_API}/conversations/${conversationId}/messages?limit=${limit}`,
    ).then((d) => d.messages ?? []),

  send: (conversationId: string, body: string) =>
    req<{ message: ChatMessage }>(`${MESSAGING_API}/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }).then((d) => d.message),

  /** SSE stream URL — same-origin cookies authenticate EventSource. */
  streamUrl(conversationId: string): string {
    return `${BASE}${MESSAGING_API}/conversations/${conversationId}/stream`;
  },
};

// Unread-message badge count for the shell nav. Polls on its own (30s) since the
// inbox is no longer always mounted to keep this fresh. Shares the
// ['conversations-unread'] cache with the inbox/thread pages, so reading a
// conversation there decrements the badge here immediately.
export function useUnreadMessages(): number {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['conversations-unread'],
    queryFn: () => messagingApi.unreadCount(),
    enabled: !!user,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  return q.data?.total ?? 0;
}