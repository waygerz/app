'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeague } from './league-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { commentsApi } from '@/lib/comments';
import { leaguesApi, type LeagueDetail } from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { UserAvatar } from '@/components/user-avatar';
import { FeedPostCard } from './feed-post';

const EMPTY_ENGAGEMENT = { like_count: 0, liked_by_me: false, comment_count: 0 };

export function LeagueOverview() {
  const lg = useLeague();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [announcement, setAnnouncement] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);

  const feed = useQuery({ queryKey: ['league-feed', lg.id], queryFn: () => leaguesApi.feed(lg.id) });
  const postIds = (feed.data ?? []).map((i) => i.id);

  useEffect(() => {
    if (feed.isSuccess) {
      qc.invalidateQueries({ queryKey: ['leagues'] });
    }
  }, [feed.isSuccess, lg.id, qc]);
  const engagement = useQuery({
    queryKey: ['feed-engagement', lg.id, postIds.join(',')],
    queryFn: () => commentsApi.engagement(postIds),
    enabled: postIds.length > 0,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['league', lg.id] });
    qc.invalidateQueries({ queryKey: ['league-feed', lg.id] });
    qc.invalidateQueries({ queryKey: ['feed-engagement', lg.id] });
  };
  const onErr = (e: Error) => toast.error(e.message);

  const post = useMutation({
    mutationFn: () => leaguesApi.postFeed(lg.id, { body: announcement.trim() }),
    onSuccess: () => { setAnnouncement(''); refresh(); },
    onError: onErr,
  });
  const leave = useMutation({
    mutationFn: () => leaguesApi.leave(lg.id),
    onSuccess: () => {
      setLeaveOpen(false);
      toast.success('You left the league');
      qc.invalidateQueries({ queryKey: ['leagues'] });
      router.push('/');
    },
    onError: onErr,
  });

  const isCommish = lg.my_role === 'commissioner';
  const isMoney = lg.league_type !== 'pickem';
  const commish = lg.members.find((m) => m.role === 'commissioner');

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-3">
      {/* Left: feed */}
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
        <section>
          {isCommish && (
            <Card className="mb-3 min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <Input
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="Post an update to your league…"
                className="min-w-0 w-full flex-1"
              />
              <Button size="sm" className="w-full shrink-0 sm:w-auto" disabled={post.isPending || !announcement.trim()} onClick={() => post.mutate()}>
                Post
              </Button>
            </Card>
          )}
          <div className="flex flex-col gap-2">
            {(feed.data ?? []).map((item) => (
              <FeedPostCard
                key={item.id}
                item={item}
                engagement={engagement.data?.[item.id] ?? EMPTY_ENGAGEMENT}
                currentUserId={user ? String(user.id) : ''}
                engagementKey={lg.id}
              />
            ))}
            {(feed.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          </div>
        </section>
      </div>

      {/* Right aside: commissioner → description → balance → invite */}
      <div className="flex min-w-0 flex-col gap-6">
        <Card className="gap-2 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Commissioner</span>
          <div className="flex items-center gap-3">
            {commish && (
              <UserAvatar userId={commish.user_id} name={commish.display_name} className="size-9 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{commish?.display_name ?? '—'}</span>
              <Badge size="sm" appearance="light">Commish</Badge>
            </div>
          </div>
        </Card>

        {lg.description && (
          <Card className="gap-2 p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</span>
            <p className="break-words text-sm text-foreground">{lg.description}</p>
          </Card>
        )}

        {isMoney && (
          <Card className="gap-1 p-5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">My balance</span>
            <span className="text-3xl font-bold text-foreground">{formatCredits(lg.my_balance_cents ?? 0)}</span>
          </Card>
        )}

        {!isCommish && (
          <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Leave league</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave {lg.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will lose access to this league&apos;s feed, bets, standings, and chat.
                  You can rejoin later with the invite link if the league is still open.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={leave.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={leave.isPending}
                  onClick={() => leave.mutate()}
                >
                  {leave.isPending ? 'Leaving…' : 'Leave league'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
