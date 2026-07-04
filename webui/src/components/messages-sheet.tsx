import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/user-avatar';
import { LeagueAvatar } from '@/pages/home/page';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { messagingApi, type ChatMessage, type Conversation } from '@/lib/messaging';
import { leaguesApi } from '@/lib/leagues';
import { OPEN_CHAT_EVENT } from '@/lib/open-chat';
import { useAuth } from '@/auth/AuthContext';

function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function conversationTitle(
  conv: Conversation,
  leagueNames: Record<string, string>,
): string {
  if (conv.type === 'league' && conv.league_id) {
    return leagueNames[conv.league_id] ?? 'League chat';
  }
  if (conv.other_user?.display_name) {
    return conv.other_user.display_name;
  }
  const author = conv.last_message?.author_name;
  return author ? `Chat with ${author}` : 'Direct message';
}

function conversationPreview(conv: Conversation): string {
  const body = conv.last_message?.body?.trim();
  if (!body) return 'No messages yet';
  const who = conv.last_message?.author_name;
  return who ? `${who}: ${body}` : body;
}

export function MessagesSheet() {
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const qc = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSendRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const convsQ = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagingApi.listConversations(),
    enabled: !!user && sheetOpen,
    staleTime: 15_000,
  });
  const leaguesQ = useQuery({
    queryKey: ['leagues'],
    queryFn: () => leaguesApi.list(),
    enabled: !!user && sheetOpen,
    staleTime: 60_000,
  });
  const msgsQ = useQuery({
    queryKey: ['messages', activeId],
    queryFn: () => messagingApi.listMessages(activeId!),
    enabled: !!activeId,
  });

  const leagueNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const lg of leaguesQ.data ?? []) m[lg.id] = lg.name;
    return m;
  }, [leaguesQ.data]);

  const conversations = convsQ.data ?? [];
  const unreadQ = useQuery({
    queryKey: ['conversations-unread'],
    queryFn: () => messagingApi.unreadCount(),
    enabled: !!user,
    staleTime: 10_000,
    refetchInterval: sheetOpen ? false : 30_000,
  });
  const unreadCount = unreadQ.data?.total ?? conversations.reduce((n, c) => n + (c.unread_count ?? 0), 0);

  const lists = useMemo(
    () => ({
      all: conversations,
      direct: conversations.filter((c) => c.type === 'direct'),
      leagues: conversations.filter((c) => c.type === 'league'),
    }),
    [conversations],
  );

  const activeConv = conversations.find((c) => c.id === activeId);

  useEffect(() => {
    const handler = (ev: Event) => {
      const id = (ev as CustomEvent<{ conversationId: string }>).detail?.conversationId;
      if (!id) return;
      setSheetOpen(true);
      setActiveId(id);
      qc.invalidateQueries({ queryKey: ['conversations'] });
    };
    window.addEventListener(OPEN_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, handler);
  }, [qc]);

  useEffect(() => {
    if (!activeId) return;
    messagingApi.markRead(activeId).then(() => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversations-unread'] });
    }).catch(() => {});
  }, [activeId, qc]);

  useEffect(() => {
    if (!activeId) return;
    const es = new EventSource(messagingApi.streamUrl(activeId));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          event?: string;
          message?: ChatMessage;
          user_id?: string;
          display_name?: string;
          typing?: boolean;
          message_ids?: string[];
          read_at?: string;
        };
        if (data.event === 'message' && data.message) {
          qc.setQueryData<ChatMessage[]>(['messages', activeId], (old) => {
            const prev = old ?? [];
            if (prev.some((m) => m.id === data.message!.id)) return prev;
            return [...prev, data.message!];
          });
          qc.invalidateQueries({ queryKey: ['conversations'] });
          qc.invalidateQueries({ queryKey: ['conversations-unread'] });
          messagingApi.markRead(activeId).catch(() => {});
          return;
        }
        if (data.event === 'typing' && data.user_id !== me) {
          if (data.typing) {
            setTypingUser(data.display_name ?? 'Someone');
            if (typingStopRef.current) clearTimeout(typingStopRef.current);
            typingStopRef.current = setTimeout(() => setTypingUser(null), 3000);
          } else {
            setTypingUser(null);
          }
          return;
        }
        if (data.event === 'messages_read' && data.message_ids?.length) {
          qc.setQueryData<ChatMessage[]>(['messages', activeId], (old) =>
            (old ?? []).map((m) =>
              data.message_ids!.includes(m.id)
                ? { ...m, read_at: data.read_at ?? m.read_at }
                : m,
            ),
          );
          return;
        }
        if (
          (data.event === 'message_updated' || data.event === 'message_deleted')
          && (data as { message?: ChatMessage }).message
        ) {
          const updated = (data as { message: ChatMessage }).message;
          qc.setQueryData<ChatMessage[]>(['messages', activeId], (old) =>
            (old ?? []).map((m) => (m.id === updated.id ? updated : m)),
          );
          qc.invalidateQueries({ queryKey: ['conversations'] });
        }
      } catch {
        /* ignore malformed SSE payloads */
      }
    };
    return () => {
      es.close();
      setTypingUser(null);
    };
  }, [activeId, me, qc]);

  const onErr = (e: Error) => toast.error(e.message);

  const sendMsg = useMutation({
    mutationFn: () => messagingApi.send(activeId!, draft.trim()),
    onSuccess: (msg) => {
      setDraft('');
      qc.setQueryData<ChatMessage[]>(['messages', activeId], (old) => {
        const prev = old ?? [];
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: onErr,
  });

  const openLeague = useMutation({
    mutationFn: (leagueId: string) => messagingApi.openLeague(leagueId),
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setActiveId(conv.id);
    },
    onError: onErr,
  });

  function renderConversationRow(conv: Conversation) {
    const title = conversationTitle(conv, leagueNames);
    const avatar =
      conv.type === 'league' && conv.league_id ? (
        <LeagueAvatar
          name={leagueNames[conv.league_id] ?? 'League'}
          logoUrl={null}
          id={conv.league_id}
          size={36}
        />
      ) : (
        <UserAvatar
          userId={conv.other_user?.id ?? conv.id}
          name={title}
          className="size-9 shrink-0"
        />
      );
    return (
      <button
        key={conv.id}
        type="button"
        className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/50"
        onClick={() => setActiveId(conv.id)}
      >
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              {(conv.unread_count ?? 0) > 0 && (
                <Badge size="sm" variant="primary" className="min-w-5 justify-center px-1.5">
                  {conv.unread_count > 9 ? '9+' : conv.unread_count}
                </Badge>
              )}
              {conv.last_message && (
                <span className="text-[11px] text-muted-foreground">
                  {timeAgo(conv.last_message.created_at)}
                </span>
              )}
            </div>
          </div>
          <div className="truncate text-xs text-muted-foreground">{conversationPreview(conv)}</div>
          <Badge size="sm" appearance="light" variant="secondary" className="mt-1">
            {conv.type === 'league' ? 'League' : 'Direct'}
          </Badge>
        </div>
      </button>
    );
  }

  function renderList(items: Conversation[], emptyText: string) {
    if (convsQ.isLoading) {
      return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</p>;
    }
    if (items.length === 0) {
      return (
        <div className="flex flex-col gap-3 px-4 py-8">
          <p className="text-center text-sm text-muted-foreground">{emptyText}</p>
          {(leaguesQ.data ?? []).length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Start a league chat
              </span>
              {(leaguesQ.data ?? []).map((lg) => (
                <Button
                  key={lg.id}
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  disabled={openLeague.isPending}
                  onClick={() => openLeague.mutate(lg.id)}
                >
                  {lg.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col">
        {items.map((conv, i) => (
          <div key={conv.id}>
            {i > 0 && <div className="border-b border-border" />}
            {renderConversationRow(conv)}
          </div>
        ))}
      </div>
    );
  }

  function renderChat() {
    const title = activeConv ? conversationTitle(activeConv, leagueNames) : 'Chat';
    const messages = msgsQ.data ?? [];

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Back to inbox"
            onClick={() => setActiveId(null)}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-4">
            {msgsQ.isLoading && (
              <p className="text-center text-sm text-muted-foreground">Loading messages…</p>
            )}
            {!msgsQ.isLoading && messages.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">Say hello!</p>
            )}
            {messages.map((m) => {
              const mine = String(m.author_id) === me;
              return (
                <div
                  key={m.id}
                  className={`flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}
                >
                  {!mine && (
                    <span className="text-[11px] text-muted-foreground">{m.author_name ?? 'Member'}</span>
                  )}
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                  >
                    {m.deleted ? (
                      <span className="italic text-muted-foreground">Message deleted</span>
                    ) : (
                      m.body
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {timeAgo(m.created_at)}
                    {m.edited_at && !m.deleted && <span className="ml-1">· edited</span>}
                    {mine && m.read_at && activeConv?.type === 'direct' && (
                      <span className="ml-1 text-primary/80">· Read</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {typingUser && (
          <p className="px-4 pb-1 text-xs text-muted-foreground">{typingUser} is typing…</p>
        )}
        <div className="flex items-center gap-2 border-t border-border p-3">
          <Input
            value={draft}
            onChange={(e) => {
              const value = e.target.value;
              setDraft(value);
              if (!activeId) return;
              if (typingSendRef.current) clearTimeout(typingSendRef.current);
              typingSendRef.current = setTimeout(() => {
                messagingApi.sendTyping(activeId, value.trim().length > 0).catch(() => {});
              }, 250);
            }}
            onBlur={() => {
              if (activeId) messagingApi.sendTyping(activeId, false).catch(() => {});
            }}
            placeholder="Type a message…"
            className="h-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim() && !sendMsg.isPending) sendMsg.mutate();
            }}
          />
          <Button
            size="icon"
            className="shrink-0"
            disabled={sendMsg.isPending || !draft.trim()}
            aria-label="Send message"
            onClick={() => sendMsg.mutate()}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={(o) => {
        setSheetOpen(o);
        if (!o) setActiveId(null);
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-white/90 hover:text-white"
          aria-label="Messages"
        >
          <MessageCircle className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{activeId ? 'Conversation' : 'Messages'}</SheetTitle>
        </SheetHeader>
        <SheetBody className="min-h-0 flex-1 p-0">
          {activeId ? (
            <div className="flex h-[calc(100vh-5.5rem)] flex-col">{renderChat()}</div>
          ) : (
            <Tabs defaultValue="all" className="w-full">
              <TabsList variant="line" className="w-full gap-6 px-4">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="direct">Direct</TabsTrigger>
                <TabsTrigger value="leagues">Leagues</TabsTrigger>
              </TabsList>
              <ScrollArea className="h-[calc(100vh-8.5rem)]">
                <TabsContent value="all" className="mt-0">
                  {renderList(lists.all, 'No conversations yet.')}
                </TabsContent>
                <TabsContent value="direct" className="mt-0">
                  {renderList(lists.direct, 'No direct messages yet.')}
                </TabsContent>
                <TabsContent value="leagues" className="mt-0">
                  {renderList(lists.leagues, 'No league chats yet.')}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}