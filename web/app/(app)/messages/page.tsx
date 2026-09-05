'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CenterCard } from '@/components/ui/center-card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { LeagueAvatar } from '@/components/league-avatar';
import { cn } from '@/lib/utils';
import { messagingApi, type Conversation } from '@/lib/messaging';
import { leaguesApi } from '@/lib/leagues';
import { useAuth } from '@/auth/AuthContext';
import { conversationTitle, timeAgo } from './helpers';

export default function MessagesPage() {
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const qc = useQueryClient();
  const router = useRouter();

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

  const leagueNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const lg of leaguesQ.data ?? []) m[lg.id] = lg.name;
    return m;
  }, [leaguesQ.data]);

  const conversations = useMemo(() => convsQ.data ?? [], [convsQ.data]);

  // Unified inbox groups: what needs a reply floats to the top.
  const groups = useMemo(() => {
    const byRecent = (a: Conversation, b: Conversation) =>
      new Date(b.last_message?.created_at ?? 0).getTime() -
      new Date(a.last_message?.created_at ?? 0).getTime();
    const unread = conversations.filter((c) => (c.unread_count ?? 0) > 0).sort(byRecent);
    const earlier = conversations.filter((c) => (c.unread_count ?? 0) === 0).sort(byRecent);
    return { unread, earlier };
  }, [conversations]);

  const onErr = (e: Error) => toast.error(e.message);

  const openLeague = useMutation({
    mutationFn: (leagueId: string) => messagingApi.openLeague(leagueId),
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      router.push('/messages/' + conv.id);
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
      <Link
        href={'/messages/' + conv.id}
        className={cn(
          'relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted',
          unread > 0 && 'bg-primary/[0.06]',
        )}
      >
        {unread > 0 && <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-primary" aria-hidden />}
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
      </Link>
    );
  }

  const GroupHeader = ({ label, action }: { label: string; action?: ReactNode }) => (
    <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
      <span>{label}</span>
      {action}
    </div>
  );

  function renderBody() {
    if (convsQ.isLoading) {
      return (
        <div className="flex flex-col gap-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <Skeleton className="size-[46px] shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (conversations.length === 0) {
      return (
        <CenterCard>
          <MessagesSquare className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
          {(leaguesQ.data ?? []).length > 0 && (
            <div className="mt-2 flex w-full flex-col gap-2">
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
        </CenterCard>
      );
    }
    return (
      <div className="flex flex-col gap-0.5">
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

  if (!user) return null;

  return (
    <div className="container py-5 sm:py-8">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-4 hidden text-2xl font-bold text-foreground lg:block">Messages</h1>
        {renderBody()}
      </div>
    </div>
  );
}
