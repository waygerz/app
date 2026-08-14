'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell, Swords, Trophy, TrendingDown, UserPlus, UserCheck, Ticket, BarChart3, Check,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notificationsApi, type FeedNotification } from '@/lib/notifications';
import { actOnCode } from '@/lib/invites';
import { friendsApi } from '@/lib/friends';
import { leaguesApi } from '@/lib/leagues';
import { wagersApi } from '@/lib/wagers';
import { UserAvatar } from '@/components/user-avatar';
import { LeagueAvatar } from '@/components/league-avatar';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/utils';

type ActionKind = 'bet' | 'friend' | 'league';
type Tone = 'default' | 'win' | 'loss';
interface Meta { Icon: LucideIcon; tint: string; tone: Tone; action: ActionKind | null }

// Icon + accent + inline action, driven by the specific event (template_key)
// and falling back to the coarse category for legacy rows (which get no action).
function notifMeta(n: FeedNotification): Meta {
  const bet = 'text-primary bg-primary/15';
  const friend = 'text-sky-500 bg-sky-500/15';
  const invite = 'text-fuchsia-500 bg-fuchsia-500/15';
  const digest = 'text-amber-500 bg-amber-500/15';
  switch (n.template_key) {
    case 'wager_proposed': return { Icon: Swords, tint: bet, tone: 'default', action: 'bet' };
    case 'wager_accepted': return { Icon: Swords, tint: bet, tone: 'default', action: null };
    case 'wager_settled_win': return { Icon: Trophy, tint: 'text-brand bg-brand/15', tone: 'win', action: null };
    case 'wager_settled_loss': return { Icon: TrendingDown, tint: 'text-destructive bg-destructive/15', tone: 'loss', action: null };
    case 'friend_request': return { Icon: UserPlus, tint: friend, tone: 'default', action: 'friend' };
    case 'friend_accepted': return { Icon: UserCheck, tint: friend, tone: 'default', action: null };
    case 'league_invite': return { Icon: Ticket, tint: invite, tone: 'default', action: 'league' };
    case 'weekly_digest': return { Icon: BarChart3, tint: digest, tone: 'default', action: null };
  }
  switch (n.category) {
    case 'wager_alert': return { Icon: Swords, tint: bet, tone: 'default', action: null };
    case 'friend_request': return { Icon: UserPlus, tint: friend, tone: 'default', action: null };
    case 'league_invite': return { Icon: Ticket, tint: invite, tone: 'default', action: null };
    case 'weekly_digest': return { Icon: BarChart3, tint: digest, tone: 'default', action: null };
  }
  return { Icon: Bell, tint: 'text-muted-foreground bg-muted', tone: 'default', action: null };
}

function timeAgo(iso: string | null) {
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

export default function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  // Notifications resolved inline this session → show a terse "done" line.
  const [resolved, setResolved] = useState<Record<string, string>>({});

  const feedQ = useQuery({
    queryKey: ['notifications-feed'],
    queryFn: () => notificationsApi.list(50),
    enabled: !!user,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  const items = feedQ.data?.notifications ?? [];
  const unread = feedQ.data?.unread ?? 0;

  // A bet challenge expires when its game kicks off (the scheduler voids the open
  // offer). The notification row can't see that on its own, so cross-reference
  // the viewer's own wagers — `my_wagers` includes the offers addressed to them,
  // with live status — and show "no longer available" instead of a dead
  // Accept/Reject that only errors when tapped.
  const hasBetActions = items.some((n) => notifMeta(n).action === 'bet' && !n.read);
  const wagersQ = useQuery({
    queryKey: ['wagers-all'],
    queryFn: () => wagersApi.all(),
    enabled: !!user && hasBetActions,
    staleTime: 15_000,
  });
  const wagerStatusById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of wagersQ.data ?? []) m.set(w.id, w.status);
    return m;
  }, [wagersQ.data]);

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-feed'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  // Inline Accept / Reject / Join — act without leaving the page.
  const act = useMutation({
    mutationFn: async ({ n, yes }: { n: FeedNotification; yes: boolean }) => {
      const meta = notifMeta(n);
      if (meta.action === 'bet') {
        const code = (n.deep_link || '').replace(/^\/c\//, '');
        if (!code.startsWith('B')) throw new Error('This bet link is invalid');
        await actOnCode(code, yes ? 'accept' : 'decline');
        return yes ? 'Accepted' : 'Rejected';
      }
      if (meta.action === 'friend') {
        const reqs = await friendsApi.requests();
        const who = String(n.actor_id ?? n.ref_id ?? '');
        const r = reqs.incoming.find((x) => String(x.user_id) === who);
        if (!r) throw new Error('This request is no longer pending');
        if (yes) await friendsApi.accept(r.id);
        else await friendsApi.decline(r.id);
        return yes ? 'Added' : 'Declined';
      }
      if (meta.action === 'league') {
        if (yes) await leaguesApi.acceptInvite(String(n.ref_id));
        return yes ? 'Joined' : 'Dismissed';
      }
      return 'Done';
    },
    onSuccess: (label, { n }) => {
      setResolved((r) => ({ ...r, [n.id]: label }));
      if (!n.read) markRead.mutate([n.id]);
      for (const key of [
        ['wagers-all'], ['wagers'], ['friends'], ['friend-requests'], ['leagues'], ['league-invites'],
      ]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e: Error, { n }) => {
      // Race: the offer/invite lapsed between render and tap. Reflect it as a
      // resolved "no longer available" line rather than a jarring red error.
      if (/no longer|already started|expired/i.test(e.message)) {
        setResolved((r) => ({ ...r, [n.id]: 'No longer available' }));
        if (!n.read) markRead.mutate([n.id]);
        return;
      }
      toast.error(e.message);
    },
  });

  // Opening an item marks it read and jumps to where the live action lives.
  const openItem = (n: FeedNotification) => {
    if (!n.read) markRead.mutate([n.id]);
    if (n.deep_link) router.push(n.deep_link);
  };

  if (!user) return null;

  return (
    <div className="container py-5 sm:py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="hidden text-2xl font-bold text-foreground lg:block">Notifications</h1>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ms-auto"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(undefined)}
            >
              Mark all read
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {feedQ.isLoading ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            <div className="flex flex-col">
              {items.map((n) => {
                const meta = notifMeta(n);
                const Icon = meta.Icon;
                const done = resolved[n.id];
                // Bet challenge that's no longer open (expired/voided/taken).
                const betStatus = meta.action === 'bet' ? wagerStatusById.get(n.ref_id ?? '') : undefined;
                const betStale = betStatus !== undefined && betStatus !== 'open';
                const showActions = !!meta.action && !n.read && !done && !betStale;
                const busy = act.isPending && act.variables?.n.id === n.id;
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openItem(n)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return; // let inner buttons handle their own keys
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(n); }
                    }}
                    className={cn(
                      'relative flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40',
                      !n.read && !done && 'bg-primary/[0.04]',
                    )}
                  >
                    {!n.read && !done && (
                      <span className="absolute inset-y-0 start-0 w-0.5 bg-primary" aria-hidden />
                    )}

                    {/* Actor avatar (with a small category badge) when we know
                        who it's from; otherwise a category icon chip. */}
                    {n.actor_id ? (
                      <div className="relative shrink-0">
                        {n.ref_type === 'league' ? (
                          <LeagueAvatar
                            name={n.actor_name ?? 'League'}
                            logoUrl={n.actor_avatar_key}
                            id={n.actor_id}
                            size={36}
                          />
                        ) : (
                          <UserAvatar
                            userId={n.actor_id}
                            name={n.actor_name ?? 'Someone'}
                            imageUrl={n.actor_avatar_key}
                            className="size-9"
                            clickable={false}
                          />
                        )}
                        <span className={cn('absolute -bottom-1 -end-1 flex size-4 items-center justify-center rounded-full ring-2 ring-background', meta.tint)}>
                          <Icon className="size-2.5" />
                        </span>
                      </div>
                    ) : (
                      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', meta.tint)}>
                        <Icon className="size-4" />
                      </span>
                    )}

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className={cn(
                        'text-sm text-foreground',
                        !n.read && !done && 'font-medium',
                        meta.tone === 'win' && 'text-brand',
                        meta.tone === 'loss' && 'text-destructive',
                      )}>
                        {n.title}
                      </div>
                      {n.body && n.body !== n.title && (
                        <div className="text-xs text-muted-foreground">{n.body}</div>
                      )}

                      {done ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Check className="size-3.5 text-brand" /> {done}
                        </span>
                      ) : showActions ? (
                        <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" disabled={busy} onClick={() => act.mutate({ n, yes: true })}>
                            {meta.action === 'bet' ? 'Accept' : meta.action === 'league' ? 'Join' : 'Accept'}
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => act.mutate({ n, yes: false })}>
                            {meta.action === 'bet' ? 'Reject' : meta.action === 'league' ? 'Dismiss' : 'Decline'}
                          </Button>
                        </div>
                      ) : betStale && !n.read ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Swords className="size-3.5" /> No longer available
                        </span>
                      ) : null}

                      <span className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>

                    {!n.read && !done && !showActions && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
