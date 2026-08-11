'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Send, Swords, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/user-avatar';
import { LeagueAvatar } from '@/components/league-avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { messagingApi, type ChatMessage, type BetMessageMeta } from '@/lib/messaging';
import { leaguesApi } from '@/lib/leagues';
import { wagersApi, wagerPick, type Wager } from '@/lib/wagers';
import { formatCredits } from '@/lib/wallet';
import { useAuth } from '@/auth/AuthContext';
import { conversationTitle, clockTime, dayKey, dayLabel, senderColor } from '../helpers';

export default function ThreadPage() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const qc = useQueryClient();
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSendRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Run the conversations query here too so a cold/direct load of this URL still
  // resolves the header title + avatar (shared ['conversations'] cache).
  const convsQ = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagingApi.listConversations(),
    enabled: !!user,
    staleTime: 15_000,
  });
  const leaguesQ = useQuery({
    queryKey: ['leagues'],
    queryFn: () => leaguesApi.list(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const msgsQ = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => messagingApi.listMessages(conversationId),
    enabled: !!conversationId,
  });

  const leagueNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const lg of leaguesQ.data ?? []) m[lg.id] = lg.name;
    return m;
  }, [leaguesQ.data]);

  const conversations = convsQ.data ?? [];
  const activeConv = conversations.find((c) => c.id === conversationId);
  const otherId = activeConv?.other_user?.id ?? null;

  // In-thread bet slips: the open wagers between me and the person I'm DMing,
  // interleaved into the chat by time. (Direct chats only.)
  const chatWagersQ = useQuery({
    queryKey: ['chat-wagers', me, otherId],
    queryFn: () => wagersApi.all(),
    enabled: activeConv?.type === 'direct' && !!otherId,
    staleTime: 15_000,
  });
  const wagersById = useMemo(() => {
    const m = new Map<string, Wager>();
    for (const w of chatWagersQ.data ?? []) m.set(w.id, w);
    return m;
  }, [chatWagersQ.data]);

  // Opening a thread marks it read.
  useEffect(() => {
    if (!conversationId) return;
    messagingApi.markRead(conversationId).then(() => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversations-unread'] });
    }).catch(() => {});
  }, [conversationId, qc]);

  // Keep the newest message in view when the thread opens or a message arrives.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [conversationId, msgsQ.data?.length, typingUser]);

  // Live thread via SSE. Closes automatically when navigating away.
  useEffect(() => {
    if (!conversationId) return;
    const es = new EventSource(messagingApi.streamUrl(conversationId));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          event?: string; message?: ChatMessage; user_id?: string; display_name?: string;
          typing?: boolean; message_ids?: string[]; read_at?: string;
        };
        if (data.event === 'message' && data.message) {
          qc.setQueryData<ChatMessage[]>(['messages', conversationId], (old) => {
            const prev = old ?? [];
            if (prev.some((m) => m.id === data.message!.id)) return prev;
            return [...prev, data.message!];
          });
          qc.invalidateQueries({ queryKey: ['conversations'] });
          qc.invalidateQueries({ queryKey: ['conversations-unread'] });
          messagingApi.markRead(conversationId).catch(() => {});
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
          qc.setQueryData<ChatMessage[]>(['messages', conversationId], (old) =>
            (old ?? []).map((m) =>
              data.message_ids!.includes(m.id) ? { ...m, read_at: data.read_at ?? m.read_at } : m),
          );
          return;
        }
        if ((data.event === 'message_updated' || data.event === 'message_deleted') && data.message) {
          const updated = data.message;
          qc.setQueryData<ChatMessage[]>(['messages', conversationId], (old) =>
            (old ?? []).map((m) => (m.id === updated.id ? updated : m)));
          qc.invalidateQueries({ queryKey: ['conversations'] });
        }
      } catch {
        /* ignore malformed SSE payloads */
      }
    };
    return () => { es.close(); setTypingUser(null); };
  }, [conversationId, me, qc]);

  const onErr = (e: Error) => toast.error(e.message);

  const sendMsg = useMutation({
    mutationFn: () => messagingApi.send(conversationId, draft.trim()),
    onSuccess: (msg) => {
      setDraft('');
      qc.setQueryData<ChatMessage[]>(['messages', conversationId], (old) => {
        const prev = old ?? [];
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      qc.invalidateQueries({ queryKey: ['conversations'] });
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

  // Native in-thread bet card. Display comes from the message's own `meta`
  // snapshot; the live wager (by id) supplies the current status + whether
  // Accept/Reject is still available.
  function BetSlip({ meta, live }: { meta: BetMessageMeta; live?: Wager }) {
    const status = live?.status ?? meta.status;
    const iAmAcceptor = String(live?.acceptor_id ?? meta.acceptor_id) === me;
    const canAct = status === 'open' && iAmAcceptor;
    const pick = wagerPick(
      { bet_type: meta.bet_type, line: meta.line, home_team: meta.home_team, away_team: meta.away_team, proposer_side: meta.proposer_side },
      iAmAcceptor ? meta.acceptor_side : meta.proposer_side,
    );
    const won = live?.winner_user_id ? String(live.winner_user_id) === me : null;

    let action: ReactNode;
    if (canAct) {
      action = (
        <span className="flex gap-1.5">
          <Button size="sm" variant="outline" disabled={betAct.isPending}
            onClick={() => betAct.mutate({ id: meta.wager_id, yes: false })}>Reject</Button>
          <Button size="sm" disabled={betAct.isPending}
            onClick={() => betAct.mutate({ id: meta.wager_id, yes: true })}>Accept</Button>
        </span>
      );
    } else if (status === 'open') {
      action = <span className="text-[11px] text-muted-foreground">Waiting on {meta.acceptor_name}…</span>;
    } else if (status === 'accepted') {
      action = <span className="text-[11px] font-medium text-brand">Accepted ✓</span>;
    } else if (status === 'completed' || status === 'settled') {
      action = <span className={cn('text-[11px] font-semibold', won ? 'text-brand' : won === false ? 'text-destructive' : 'text-muted-foreground')}>
        {won ? 'Won' : won === false ? 'Lost' : 'Settled'}
      </span>;
    } else {
      action = <span className="text-[11px] capitalize text-muted-foreground">{status}</span>;
    }

    return (
      <div className="max-w-[86%] self-start rounded-2xl rounded-bl-md border border-primary/40 bg-muted/40 p-3 ring-1 ring-inset ring-primary/20">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Swords className="size-3" />
          </span>
          {iAmAcceptor ? `${meta.proposer_name} challenged you` : 'Your bet'}
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <span className="text-[13px] font-semibold">
            {meta.away_team} <span className="font-medium text-muted-foreground">@</span> {meta.home_team}
          </span>
          <span className="whitespace-nowrap rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
            {pick}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            Stake <b className="font-mono text-foreground">{formatCredits(meta.amount_cents)}</b>
          </span>
          {action}
        </div>
      </div>
    );
  }

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

    if (m.kind === 'bet' && m.meta) {
      lastAuthor = '';
      const meta = m.meta;
      items.push({
        at: new Date(m.created_at).getTime(),
        key: m.id,
        node: <div key={m.id} className="flex flex-col"><BetSlip meta={meta} live={wagersById.get(meta.wager_id)} /></div>,
      });
      continue;
    }

    const mine = String(m.author_id) === me;
    const showSender = isLeague && !mine && m.author_id !== lastAuthor;
    lastAuthor = mine ? me : m.author_id;
    const body = m.deleted
      ? <span className="italic text-muted-foreground">Message deleted</span>
      : m.body;

    if (isLeague && !mine) {
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

  items.sort((a, b) => a.at - b.at);

  if (!user) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2.5 px-3 py-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Back to inbox"
            onClick={() => router.push('/messages')}>
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
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-1.5 p-4">
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

      <div className="shrink-0 border-t border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-3 py-3">
          <Input
            value={draft}
            onChange={(e) => {
              const value = e.target.value;
              setDraft(value);
              if (!conversationId) return;
              if (typingSendRef.current) clearTimeout(typingSendRef.current);
              typingSendRef.current = setTimeout(() => {
                messagingApi.sendTyping(conversationId, value.trim().length > 0).catch(() => {});
              }, 250);
            }}
            onBlur={() => { if (conversationId) messagingApi.sendTyping(conversationId, false).catch(() => {}); }}
            placeholder="Type a message…"
            className="h-10 text-base"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim() && !sendMsg.isPending) sendMsg.mutate();
            }}
          />
          <Button size="icon" className="size-10 shrink-0" disabled={sendMsg.isPending || !draft.trim()}
            aria-label="Send message" onClick={() => sendMsg.mutate()}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
