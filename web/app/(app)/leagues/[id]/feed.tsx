'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeague } from './league-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { commentsApi } from '@/lib/comments';
import { leaguesApi } from '@/lib/leagues';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AppSheet } from '@/components/ui/app-sheet';
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

const EMPTY_ENGAGEMENT = {
  reactions: {},
  total_reactions: 0,
  my_reaction: null,
  comment_count: 0,
};

export function LeagueFeed() {
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
  const membersById = new Map(lg.members.map((m) => [String(m.user_id), m]));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* The timeline runs edge to edge; rows carry their own padding and
          dividers. The league description lives in the league details sheet. */}
      <section className="-mx-4 -mt-4">
          {canModerate && (
            <div className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3">
              {user && (
                <UserAvatar
                  userId={String(user.id)}
                  name={user.display_name}
                  imageUrl={user.avatar_key}
                  className="size-8 shrink-0"
                />
              )}
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="flex h-10 min-w-0 flex-1 items-center truncate rounded-full bg-muted px-4 text-left text-sm text-muted-foreground hover:bg-muted/70"
              >
                Post to your league…
              </button>
            </div>
          )}

          <AppSheet
            open={composerOpen}
            onOpenChange={setComposerOpen}
            title={`Post to ${lg.name}`}
            action={
              <Button
                size="sm"
                className="rounded-full px-4"
                disabled={post.isPending || !announcement.trim()}
                onClick={() => post.mutate()}
              >
                {post.isPending ? 'Posting…' : 'Post'}
              </Button>
            }
          >
                <Textarea
                  autoFocus
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={5}
                  className="min-h-32 resize-none border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0"
                />
          </AppSheet>
          <div className="flex flex-col">
            {(feed.data ?? []).map((item) => (
              <FeedPostCard
                key={item.id}
                item={item}
                authorAvatarKey={item.author_id ? membersById.get(String(item.author_id))?.avatar_key ?? null : null}
                avatarFor={(uid) => membersById.get(String(uid))?.avatar_key ?? null}
                engagement={engagement.data?.[item.id] ?? EMPTY_ENGAGEMENT}
                currentUserId={user ? String(user.id) : ''}
                engagementKey={lg.id}
              />
            ))}
            {(feed.data ?? []).length === 0 && (
              <Card className="m-4 items-center gap-3 p-8 text-center">
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

        {!isCommish && (
          <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="self-center text-muted-foreground">Leave league</Button>
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
  );
}
