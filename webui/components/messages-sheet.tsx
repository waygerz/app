'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, MessageCircle, Send, Users, Swords, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/user-avatar';
import { LeagueAvatar } from '@/components/league-avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { messagingApi, type ChatMessage, type Conversation } from '@/lib/messaging';
import { leaguesApi } from '@/lib/leagues';
import { wagersApi, wagerPick, type Wager } from '@/lib/wagers';
import { formatCredits } from '@/lib/wallet';
import { OPEN_CHAT_EVENT } from '@/lib/open-chat';
import { useAuth } from '@/auth/AuthContext';

function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function clockTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Deterministic per-author colour for group-chat sender names.
const NAME_COLORS = [
  'text-violet-400', 'text-pink-400', 'text-teal-400', 'text-amber-400',
  'text-sky-400', 'text-emerald-400', 'text-fuchsia-400', 'text-orange-400',
];
function senderColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

function conversationTitle(conv: Conversation, leagueNames: Record<string, string>): string {
  if (conv.type === 'league' && conv.league_id) return leagueNames[conv.league_id] ?? 'League chat';
  if (conv.other_user?.display_name) return conv.other_user.display_name;
  const author = conv.last_message?.author_name;
  return author ? `Chat with ${author}` : 'Direct message';
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
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const activeConv = conversations.find((c) => c.id === activeId);
  const otherId = activeConv?.other_user?.id ?? null;

  // In-thread bet slips: the open wagers between me and the person I'm DMing,
  // interleaved into the chat by time. (Direct chats only.)
  const chatWagersQ = useQuery({
    queryKey: ['chat-wagers', me, otherId],
    queryFn: () => wagersApi.all(),
    enabled: !!activeId && activeConv?.type === 'direct' && !!otherId,
    staleTime: 15_000,
  });
  const openBets: Wager[] = useMemo(() => {
    if (!otherId) return [];
    return (chatWagersQ.data ?? []).filter(
      (w) =>
        w.status === 'open' &&
        ((w.proposer_id === me && w.acceptor_id === otherId) ||
          (w.proposer_id === otherId && w.acceptor_id === me)),
    );
  }, [chatWagersQ.data, me, otherId]);

  // Unified inbox groups: what needs a reply floats to the top (Direction 2).
  const groups = useMemo(() => {
    const byRecent = (a: Conversation, b: Conversation) =>
      new Date(b.last_message?.created_at ?? 0).getTime() -
      new Date(a.last_message?.created_at ?? 0).getTime();
    const unread = conversations.filter((c) => (c.unread_count ?? 0) > 0).sort(byRecent);
    const earlier = conversations.filter((c) => (c.unread_count ?? 0) === 0).sort(byRecent);
    return { unread, earlier };
  }, [conversations]);

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

  // Keep the newest message in view when a thread opens or a message arrives.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [activeId, msgsQ.data?.length, openBets.length, typingUser]);

  useEffect(() => {
    if (!activeId) return;
    const es = new EventSource(messagingApi.streamUrl(activeId));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          event?: string; message?: ChatMessage; user_id?: string; display_name?: string;
          typing?: boolean; message_ids?: string[]; read_at?: string;
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
              data.message_ids!.includes(m.id) ? { ...m, read_at: data.read_at ?? m.read_at } : m),
          );
          return;
        }
        if ((data.event === 'message_updated' || data.event === 'message_deleted') && data.message) {
          const updated = data.message;
          qc.setQueryData<ChatMessage[]>(['messages', activeId], (old) =>
            (old ?? []).map((m) => (m.id === updated.id ? updated : m)));
          qc.invalidateQueries({ queryKey: ['conversations'] });
        }
      } catch {
        /* ignore malformed SSE payloads */
      }
    };
    return () => { es.close(); setTypingUser(null); };
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

  const betAct = useMutation({
    mutationFn: ({ id, yes }: { id: string; yes: boolean }) =>
      yes ? wagersApi.accept(id) : wagersApi.decline(id),
    onSuccess: (_r, { yes }) => {
      toast.success(yes ? 'Bet accepted' : 'Bet rejected');
      qc.invalidateQueries({ queryKey: ['chat-wagers'] });
      qc.invalidateQueries({ queryKey: ['wagers-all'] });
      qc.invalidateQueries({ queryKey: ['wagers'] });
    },
    onError: onErr,
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await Promise.all(groups.unread.map((c) => messagingApi.markRead(c.id).catch(() => {})));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversations-unread'] });
    },
  });

  // ---- Inbox row (Direction 2) --------------------------------------------
  function ConversationRow({ conv }: { conv: Conversation }) {
    const title = conversationTitle(conv, leagueNames);
    const isLeague = conv.type === 'league' && !!conv.league_id;
    const unread = conv.unread_count ?? 0;
    const lm = conv.last_message;
    const mine = lm && String(lm.author_id) === me;
    const preview = !lm?.body?.trim()
      ? 'No messages yet'
      : `${mine ? 'You: ' : isLeague && lm.author_name ? `${lm.author_name}: ` : ''}${lm.body.trim()}`;

    return (
      <button
        type="button"
        onClick={() => setActiveId(conv.id)}
        className={cn(
          'relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40',
          unread > 0 && 'bg-primary/[0.05]',
        )}
      >
        {unread > 0 && <span className="absolute inset-y-0 start-0 w-0.5 bg-primary" aria-hidden />}
        <div className="relative shrink-0">
          {isLeague ? (
            <LeagueAvatar name={title} logoUrl={null} id={conv.league_id!} size={46} />
          ) : (
            <UserAvatar
              userId={conv.other_user?.id ?? conv.id}
              name={title}
              imageUrl={conv.other_user?.avatar_key}
              className="size-[46px]"
              clickable={false}
            />
          )}
          {isLeague && (
            <span className="absolute -bottom-1 -end-1 flex size-[19px] items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background">
              <Users className="size-2.5" />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate text-sm text-foreground', unread > 0 ? 'font-bold' : 'font-semibold')}>
              {title}
            </span>
            {lm && (
              <span className={cn('shrink-0 text-[11px] tabular-nums', unread > 0 ? 'text-primary' : 'text-muted-foreground')}>
                {timeAgo(lm.created_at)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={cn('truncate text-[13px]', unread > 0 ? 'text-muted-foreground' : 'text-muted-foreground/80')}>
              {preview}
            </span>
            {unread > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  }

  function renderInbox() {
    if (convsQ.isLoading) {
      return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</p>;
    }
    if (conversations.length === 0) {
      return (
        <div className="flex flex-col gap-3 px-4 py-8">
          <p className="text-center text-sm text-muted-foreground">No conversations yet.</p>
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
    const GroupHeader = ({ label, action }: { label: string; action?: ReactNode }) => (
      <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
        <span>{label}</span>
        {action}
      </div>
    );
    return (
      <div className="flex flex-col divide-y divide-border/60">
        {groups.unread.length > 0 && (
          <div className="flex flex-col">
            <GroupHeader
              label={`Unread · ${groups.unread.length}`}
              action={
                <button
                  type="button"
                  className="text-[11px] font-medium normal-case tracking-normal text-primary hover:underline disabled:opacity-50"
                  disabled={markAll.isPending}
                  onClick={() => markAll.mutate()}
                >
                  Mark all read
                </button>
              }
            />
            {groups.unread.map((c) => <ConversationRow key={c.id} conv={c} />)}
          </div>
        )}
        {groups.earlier.length > 0 && (
          <div className="flex flex-col">
            <GroupHeader label="Earlier" />
            {groups.earlier.map((c) => <ConversationRow key={c.id} conv={c} />)}
          </div>
        )}
      </div>
    );
  }

  // ---- Chat: bet slip (in-thread) -----------------------------------------
  function BetSlip({ w }: { w: Wager }) {
    const iAmAcceptor = w.acceptor_id === me;
    return (
      <div className="max-w-[86%] self-start rounded-2xl rounded-bl-md border border-primary/40 bg-muted/40 p-3 ring-1 ring-inset ring-primary/20">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Swords className="size-3" />
          </span>
          {iAmAcceptor ? `${w.proposer_name} challenged you` : 'Your bet'}
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <span className="text-[13px] font-semibold">
            {w.away_team} <span className="font-medium text-muted-foreground">@</span> {w.home_team}
          </span>
          <span className="whitespace-nowrap rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
            {wagerPick(w, iAmAcceptor ? w.acceptor_side : w.proposer_side)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            Stake <b className="font-mono text-foreground">{formatCredits(w.amount_cents)}</b>
          </span>
          {iAmAcceptor ? (
            <span className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={betAct.isPending}
                onClick={() => betAct.mutate({ id: w.id, yes: false })}>Reject</Button>
              <Button size="sm" disabled={betAct.isPending}
                onClick={() => betAct.mutate({ id: w.id, yes: true })}>Accept</Button>
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Waiting on {w.acceptor_name}…</span>
          )}
        </div>
      </div>
    );
  }

  function renderChat() {
    const title = activeConv ? conversationTitle(activeConv, leagueNames) : 'Chat';
    const isLeague = activeConv?.type === 'league' && !!activeConv.league_id;
    const messages = msgsQ.data ?? [];

    // Interleave messages + open bets (direct only) by time.
    type Item = { at: number; node: ReactNode; key: string };
    const items: Item[] = [];
    let lastDay = '';
    let lastAuthor = '';
    const pushDivider = (iso: string) => {
      const dk = dayKey(iso);
      if (dk && dk !== lastDay) {
        lastDay = dk;
        lastAuthor = '';
        items.push({
          at: new Date(iso).getTime(),
          key: `day-${dk}`,
          node: (
            <div key={`day-${dk}`} className="my-1 self-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {dayLabel(iso)}
            </div>
          ),
        });
      }
    };

    for (const m of messages) {
      pushDivider(m.created_at);
      const mine = String(m.author_id) === me;
      const showSender = isLeague && !mine && m.author_id !== lastAuthor;
      lastAuthor = mine ? me : m.author_id;
      const body = m.deleted
        ? <span className="italic text-muted-foreground">Message deleted</span>
        : m.body;

      if (isLeague && !mine) {
        // Group chat: sender avatar + coloured name, grouped consecutively.
        items.push({
          at: new Date(m.created_at).getTime(),
          key: m.id,
          node: (
            <div key={m.id} className="flex max-w-[88%] items-end gap-2 self-start">
              {showSender ? (
                <UserAvatar userId={m.author_id} name={m.author_name ?? 'Member'}
                  className="size-6 shrink-0" clickable={false} />
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                {showSender && (
                  <span className={cn('px-1 text-[11px] font-semibold', senderColor(m.author_id))}>
                    {m.author_name ?? 'Member'}
                  </span>
                )}
                <div className="rounded-2xl rounded-bl-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  {body}
                  {m.edited_at && !m.deleted && <span className="ml-1 text-[10px] text-muted-foreground">· edited</span>}
                </div>
              </div>
            </div>
          ),
        });
      } else {
        // DM bubbles (and my own messages in a league).
        items.push({
          at: new Date(m.created_at).getTime(),
          key: m.id,
          node: (
            <div key={m.id} className={cn('flex flex-col gap-0.5', mine ? 'items-end' : 'items-start')}>
              <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground')}>
                {body}
              </div>
              <span className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
                {clockTime(m.created_at)}
                {m.edited_at && !m.deleted && <span>· edited</span>}
                {mine && m.read_at && activeConv?.type === 'direct' && (
                  <CheckCheck className="size-3 text-primary/80" />
                )}
              </span>
            </div>
          ),
        });
      }
    }

    // Open bets between us, interleaved (direct chats only).
    for (const w of openBets) {
      const at = new Date(w.created_at).getTime();
      items.push({ at, key: `bet-${w.id}`, node: <div key={`bet-${w.id}`} className="flex flex-col"><BetSlip w={w} /></div> });
    }

    items.sort((a, b) => a.at - b.at);

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Back to inbox"
            onClick={() => setActiveId(null)}>
            <ArrowLeft className="size-4" />
          </Button>
          {activeConv && (isLeague ? (
            <LeagueAvatar name={title} logoUrl={null} id={activeConv.league_id!} size={32} />
          ) : (
            <UserAvatar userId={activeConv.other_user?.id ?? activeConv.id} name={title}
              imageUrl={activeConv.other_user?.avatar_key} className="size-8" clickable={false} />
          ))}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{title}</div>
            {isLeague && <div className="text-[11px] text-muted-foreground">League chat</div>}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1.5 p-4">
            {msgsQ.isLoading && <p className="text-center text-sm text-muted-foreground">Loading messages…</p>}
            {!msgsQ.isLoading && items.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Say hello!</p>
            )}
            {items.map((it) => it.node)}
            {typingUser && (
              <div className="mt-1 self-start rounded-2xl rounded-bl-md border border-border bg-muted px-3 py-2.5">
                <span className="flex gap-1" aria-label={`${typingUser} is typing`}>
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="flex shrink-0 items-center gap-2 border-t border-border p-3">
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
            onBlur={() => { if (activeId) messagingApi.sendTyping(activeId, false).catch(() => {}); }}
            placeholder="Type a message…"
            className="h-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim() && !sendMsg.isPending) sendMsg.mutate();
            }}
          />
          <Button size="icon" className="shrink-0" disabled={sendMsg.isPending || !draft.trim()}
            aria-label="Send message" onClick={() => sendMsg.mutate()}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Sheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) setActiveId(null); }}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-white/90 hover:text-white" aria-label="Messages">
          <MessageCircle className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{activeId ? 'Conversation' : 'Messages'}</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex min-h-0 flex-1 flex-col p-0">
          {activeId ? (
            renderChat()
          ) : (
            <ScrollArea className="min-h-0 flex-1">{renderInbox()}</ScrollArea>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
