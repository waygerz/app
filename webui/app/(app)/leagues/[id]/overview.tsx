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
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Rss } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { FeedPostCard } from './feed-post';

const EMPTY_ENGAGEMENT = { like_count: 0, liked_by_me: false, comment_count: 0 };

export function LeagueOverview() {
  const lg = useLeague();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [announcement, setAnnouncement] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
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
    onSuccess: () => { setAnnouncement(''); setComposerOpen(false); refresh(); },
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
  const canModerate = isCommish || lg.my_role === 'moderator';
  const isMoney = lg.league_type !== 'pickem';
  const commish = lg.members.find((m) => m.role === 'commissioner');
  const membersById = new Map(lg.members.map((m) => [String(m.user_id), m]));

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-3">
      {/* Left: feed */}
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
        <section>
          {canModerate && (
            <Card className="mb-3 min-w-0 flex-row items-center gap-3 p-3">
              {user && (
                <UserAvatar
                  userId={String(user.id)}
                  name={user.display_name}
                  imageUrl={user.avatar_key}
                  className="size-9 shrink-0"
                />
              )}
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="min-w-0 flex-1 truncate rounded-full border border-input bg-muted/50 px-4 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
              >
                Post an update to your league…
              </button>
            </Card>
          )}

          <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post to {lg.name}</DialogTitle>
                <DialogDescription className="sr-only">Share an update with your league.</DialogDescription>
              </DialogHeader>
              <DialogBody className="py-2">
                <Textarea
                  autoFocus
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={5}
                  className="min-h-32 resize-none"
                />
              </DialogBody>
              <DialogFooter>
                <Button
                  className="w-full sm:w-auto"
                  disabled={post.isPending || !announcement.trim()}
                  onClick={() => post.mutate()}
                >
                  {post.isPending ? 'Posting…' : 'Post'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="flex flex-col gap-2">
            {(feed.data ?? []).map((item) => (
              <FeedPostCard
                key={item.id}
                item={item}
                authorAvatarKey={item.author_id ? membersById.get(String(item.author_id))?.avatar_key ?? null : null}
                engagement={engagement.data?.[item.id] ?? EMPTY_ENGAGEMENT}
                currentUserId={user ? String(user.id) : ''}
                engagementKey={lg.id}
              />
            ))}
            {(feed.data ?? []).length === 0 && (
              <Card className="items-center gap-3 p-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-brand/15 text-primary">
                  <Rss className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">No activity yet</p>
                  <p className="text-xs text-muted-foreground">
                    League updates, results, and announcements will show up here.
                  </p>
                </div>
              </Card>
            )}
          </div>
        </section>
      </div>

      {/* Right aside: commissioner → description → balance → invite */}
      <div className="flex min-w-0 flex-col gap-6">
        <Card className="gap-2 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Commissioner</span>
          <div className="flex items-center gap-3">
            {commish && (
              <UserAvatar userId={commish.user_id} name={commish.display_name} imageUrl={commish.avatar_key} className="size-9 shrink-0" />
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
