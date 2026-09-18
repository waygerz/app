import { useQuery } from '@tanstack/react-query';
import { API, API_BASE } from './api-paths';
import { apiRequest, refreshSession } from './http';
import { useAuth } from '@/auth/AuthContext';

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

export const messagingApi = {
  listConversations: () =>
    apiRequest<{ conversations: Conversation[] }>(`${MESSAGING_API}/conversations`).then(
      (d) => d.conversations ?? [],
    ),

  unreadCount: () =>
    apiRequest<{ total: number; by_conv: Record<string, number> }>(
      `${MESSAGING_API}/conversations/unread-count`,
    ),

  markRead: (conversationId: string) =>
    apiRequest<{ ok: boolean }>(`${MESSAGING_API}/conversations/${conversationId}/read`, {
      method: 'POST',
    }),

  sendTyping: (conversationId: string, typing: boolean) =>
    apiRequest<{ ok: boolean }>(`${MESSAGING_API}/conversations/${conversationId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ typing }),
    }),

  openDirect: (userId: string) =>
    apiRequest<{ conversation: Conversation }>(`${MESSAGING_API}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ type: 'direct', user_id: userId }),
    }).then((d) => d.conversation),

  openLeague: (leagueId: string) =>
    apiRequest<{ conversation: Conversation }>(`${MESSAGING_API}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ type: 'league', league_id: leagueId }),
    }).then((d) => d.conversation),

  listMessages: (conversationId: string, limit = 50) =>
    apiRequest<{ messages: ChatMessage[] }>(
      `${MESSAGING_API}/conversations/${conversationId}/messages?limit=${limit}`,
    ).then((d) => d.messages ?? []),

  send: (conversationId: string, body: string) =>
    apiRequest<{ message: ChatMessage }>(`${MESSAGING_API}/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }).then((d) => d.message),

  /** SSE stream URL — same-origin cookies authenticate EventSource. */
  streamUrl(conversationId: string): string {
    return `${API_BASE}${MESSAGING_API}/conversations/${conversationId}/stream`;
  },
};

export type ThreadStreamEvent = {
  event?: string;
  message?: ChatMessage;
  user_id?: string;
  display_name?: string;
  typing?: boolean;
  message_ids?: string[];
  read_at?: string;
};

/**
 * Open a conversation's live stream and keep it open. Returns a cleanup fn.
 *
 * The browser retries a dropped stream by itself, but gives up for good on any
 * non-200 — which is what an expired access cookie (401, every 15 min) or a
 * full server (503) produce. Then we refresh the session (single-flight, via
 * `refreshSession`) and reopen with backoff. The server also ends every stream
 * after 10 min so auth is re-checked. `onReconnect` fires when a reopened
 * stream is live, so the caller can refetch anything missed while it was down.
 */
export function openThreadStream(
  conversationId: string,
  onEvent: (data: ThreadStreamEvent) => void,
  onReconnect: () => void,
): () => void {
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let everConnected = false;
  let delay = 1000;

  const connect = () => {
    if (stopped) return;
    es = new EventSource(messagingApi.streamUrl(conversationId));
    es.onmessage = (ev) => {
      let data: ThreadStreamEvent;
      try {
        data = JSON.parse(ev.data) as ThreadStreamEvent;
      } catch {
        return; // ignore malformed payloads
      }
      if (data.event === 'connected') {
        delay = 1000;
        if (everConnected) onReconnect();
        everConnected = true;
        return;
      }
      onEvent(data);
    };
    es.onerror = () => {
      // CONNECTING: the browser is already retrying. CLOSED: it gave up.
      if (!es || es.readyState !== EventSource.CLOSED) return;
      es.close();
      timer = setTimeout(async () => {
        if (stopped) return;
        const ok = await refreshSession().catch(() => false);
        if (!ok || stopped) return; // signed out: the next API call routes to login
        connect();
      }, delay);
      delay = Math.min(delay * 2, 30_000);
    };
  };

  connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    es?.close();
  };
}

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