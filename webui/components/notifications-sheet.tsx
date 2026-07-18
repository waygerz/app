'use client';

import { useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { wagersApi, type WagerResult } from '@/lib/wagers';
import { friendsApi } from '@/lib/friends';
import { formatCredits } from '@/lib/wallet';
import { useAuth } from '@/auth/AuthContext';

type BadgeVariant =
  | 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'outline' | 'destructive';

interface Notif {
  id: string;
  tab: 'bets' | 'friends';
  userId: string;
  userName: string;
  title: string;
  sub?: string;
  time: string | null;
  badge: { label: string; variant: BadgeVariant };
  actions?: ReactNode;
  actionable: boolean;
  sortTime: number;
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

export function NotificationsSheet() {
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const qc = useQueryClient();

  const wagersQ = useQuery({
    queryKey: ['wagers-all'],
    queryFn: () => wagersApi.all(),
    enabled: !!user,
    staleTime: 30_000,
  });
  const friendReqQ = useQuery({
    queryKey: ['friend-requests'],
    queryFn: () => friendsApi.requests(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const refreshWagers = () => {
    qc.invalidateQueries({ queryKey: ['wagers-all'] });
    qc.invalidateQueries({ queryKey: ['wagers'] });
  };
  const onErr = (e: Error) => toast.error(e.message);
  const acceptBet = useMutation({ mutationFn: (id: string) => wagersApi.accept(id), onSuccess: () => { toast.success('Bet accepted'); refreshWagers(); }, onError: onErr });
  const declineBet = useMutation({ mutationFn: (id: string) => wagersApi.decline(id), onSuccess: () => { toast.success('Bet declined'); refreshWagers(); }, onError: onErr });
  const cancelBet = useMutation({ mutationFn: (id: string) => wagersApi.cancel(id), onSuccess: () => { toast.success('Bet cancelled'); refreshWagers(); }, onError: onErr });
  const confirmBet = useMutation({ mutationFn: ({ id, result }: { id: string; result: WagerResult }) => wagersApi.confirm(id, result), onSuccess: (_d, v) => { toast.success(v.result === 'draw' ? 'Called a draw' : 'Result confirmed'); refreshWagers(); }, onError: onErr });
  const acceptFriend = useMutation({ mutationFn: (id: number) => friendsApi.accept(id), onSuccess: () => { toast.success('Friend added'); qc.invalidateQueries({ queryKey: ['friend-requests'] }); qc.invalidateQueries({ queryKey: ['friends'] }); }, onError: onErr });
  const declineFriend = useMutation({ mutationFn: (id: number) => friendsApi.decline(id), onSuccess: () => { toast.success('Request declined'); qc.invalidateQueries({ queryKey: ['friend-requests'] }); }, onError: onErr });

  const notifs = useMemo<Notif[]>(() => {
    const out: Notif[] = [];

    for (const w of wagersQ.data ?? []) {
      const iAmProposer = String(w.proposer_id) === me;
      const other = iAmProposer ? w.acceptor_name : w.proposer_name;
      const otherId = iAmProposer ? w.acceptor_id : w.proposer_id;
      const mySide = iAmProposer ? w.proposer_side : w.acceptor_side;
      const myTeam = mySide === 'home' ? w.home_team : w.away_team;
      const amount = formatCredits(w.amount_cents);
      const sub = `${w.event_name} · ${myTeam} · ${amount}`;
      const time = w.settled_at ?? w.created_at;
      let n: Omit<Notif, 'id' | 'tab' | 'userId' | 'userName' | 'sortTime'> | null = null;

      if (w.status === 'open' && !iAmProposer) {
        n = {
          title: `${w.proposer_name} challenged you`, sub, time, actionable: true,
          badge: { label: 'Pending', variant: 'warning' },
          actions: (
            <>
              <Button size="sm" disabled={acceptBet.isPending} onClick={() => acceptBet.mutate(w.id)}>Accept</Button>
              <Button size="sm" variant="outline" disabled={declineBet.isPending} onClick={() => declineBet.mutate(w.id)}>Decline</Button>
            </>
          ),
        };
      } else if (w.status === 'open' && iAmProposer) {
        n = {
          title: `You challenged ${w.acceptor_name}`, sub, time, actionable: false,
          badge: { label: 'Awaiting', variant: 'warning' },
          actions: <Button size="sm" variant="outline" disabled={cancelBet.isPending} onClick={() => cancelBet.mutate(w.id)}>Cancel</Button>,
        };
      } else if (w.status === 'accepted') {
        n = { title: `Bet is live vs ${other}`, sub, time, actionable: false, badge: { label: 'Active', variant: 'info' } };
      } else if (w.status === 'completed') {
        n = {
          title: `Confirm your result vs ${other}`, sub, time: w.completed_at ?? time, actionable: true,
          badge: { label: 'Confirm', variant: 'warning' },
          actions: (
            <>
              <Button size="sm" variant="outline" disabled={confirmBet.isPending} title="Concede — pays your opponent" onClick={() => confirmBet.mutate({ id: w.id, result: 'lost' })}>I lost</Button>
              <Button size="sm" variant="ghost" disabled={confirmBet.isPending} onClick={() => confirmBet.mutate({ id: w.id, result: 'draw' })}>Draw</Button>
            </>
          ),
        };
      } else if (w.status === 'settled') {
        const won = String(w.winner_user_id ?? '') === me;
        n = {
          title: `You ${won ? 'won' : 'lost'} your bet vs ${other}`, sub, time, actionable: false,
          badge: won ? { label: 'Won', variant: 'success' } : { label: 'Lost', variant: 'destructive' },
        };
      } else if (w.status === 'refunded') {
        n = { title: `Bet pushed vs ${other}`, sub, time, actionable: false, badge: { label: 'Push', variant: 'secondary' } };
      } else if (w.status === 'declined') {
        n = {
          title: iAmProposer ? `${w.acceptor_name} declined your bet` : `You declined ${w.proposer_name}`,
          sub, time, actionable: false, badge: { label: 'Declined', variant: 'secondary' },
        };
      } else if (w.status === 'cancelled') {
        n = {
          title: iAmProposer ? `You cancelled your bet` : `${w.proposer_name} cancelled a bet`,
          sub, time, actionable: false, badge: { label: 'Cancelled', variant: 'secondary' },
        };
      }
      if (n) {
        out.push({
          ...n,
          id: `wager:${w.id}:${w.status}`,
          tab: 'bets',
          userId: otherId,
          userName: other,
          sortTime: new Date(time ?? 0).getTime() || 0,
        });
      }
    }

    for (const fr of friendReqQ.data?.incoming ?? []) {
      out.push({
        id: `friendreq:${fr.id}`,
        tab: 'friends',
        userId: String(fr.user_id),
        userName: fr.display_name,
        title: `${fr.display_name} sent you a friend request`,
        time: null,
        actionable: true,
        badge: { label: 'Friend request', variant: 'primary' }, sortTime: Date.now(),
        actions: (
          <>
            <Button size="sm" disabled={acceptFriend.isPending} onClick={() => acceptFriend.mutate(fr.id)}>Accept</Button>
            <Button size="sm" variant="outline" disabled={declineFriend.isPending} onClick={() => declineFriend.mutate(fr.id)}>Decline</Button>
          </>
        ),
      });
    }

    // Actionable items first, then most-recent.
    out.sort((a, b) => Number(b.actionable) - Number(a.actionable) || b.sortTime - a.sortTime);
    return out;
  }, [wagersQ.data, friendReqQ.data, me, acceptBet, declineBet, cancelBet, acceptFriend, declineFriend]);

  const actionableCount = notifs.filter((n) => n.actionable).length;
  const loading = wagersQ.isLoading || friendReqQ.isLoading;

  const lists: Record<'all' | 'bets' | 'friends', Notif[]> = {
    all: notifs,
    bets: notifs.filter((n) => n.tab === 'bets'),
    friends: notifs.filter((n) => n.tab === 'friends'),
  };

  function renderList(items: Notif[], emptyText: string) {
    if (loading) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</p>;
    if (items.length === 0) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
    return (
      <div className="flex flex-col">
        {items.map((n, i) => (
          <div key={n.id}>
            {i > 0 && <div className="border-b border-border" />}
            <div className="flex gap-3 px-4 py-3">
              <UserAvatar userId={n.userId} name={n.userName} className="size-9 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="text-sm text-foreground">{n.title}</div>
                {n.sub && <div className="truncate text-xs text-muted-foreground">{n.sub}</div>}
                <div className="flex items-center gap-2 pt-0.5">
                  <Badge size="sm" appearance="light" variant={n.badge.variant}>{n.badge.label}</Badge>
                  {n.time && <span className="text-[11px] text-muted-foreground">{timeAgo(n.time)}</span>}
                </div>
                {n.actions && <div className="flex gap-2 pt-1.5">{n.actions}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-white/90 hover:text-white"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {actionableCount > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {actionableCount > 9 ? '9+' : actionableCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="gap-0 p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0">
          <Tabs defaultValue="all" className="w-full">
            <TabsList variant="line" className="w-full gap-6 px-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="bets">Bets</TabsTrigger>
              <TabsTrigger value="friends">Friends</TabsTrigger>
            </TabsList>
            <ScrollArea className="h-[calc(100vh-8.5rem)]">
              <TabsContent value="all" className="mt-0">{renderList(lists.all, 'Nothing here yet.')}</TabsContent>
              <TabsContent value="bets" className="mt-0">{renderList(lists.bets, 'No bets yet.')}</TabsContent>
              <TabsContent value="friends" className="mt-0">{renderList(lists.friends, 'No friend requests.')}</TabsContent>
            </ScrollArea>
          </Tabs>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
