'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  CalendarClock,
  Megaphone,
  MessageCircle,
  PartyPopper,
  Swords,
  Trash2,
  Trophy,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { commentsApi, type Comment, type PostEngagement } from '@/lib/comments';
import { ReactionControl } from '@/components/reactions/reaction-control';
import type { FeedItem, FeedMeta } from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';

// System activity posts get a per-event-type icon + tinted chip, mirroring the
// color language of the leagues home and landing page. Entries with a `label`
// render as a system line (icon + label, no avatar/matchup) even when the post
// carries an author_id — used for head-to-head bet events (Swords = H2H).
const EVENT_STYLE: Record<string, { icon: LucideIcon; chip: string; label?: string }> = {
  league_created: { icon: PartyPopper, chip: 'bg-brand/15 text-brand' },
  member_joined: { icon: UserPlus, chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  period_opened: { icon: CalendarClock, chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  period_final: { icon: Trophy, chip: 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white' },
  wager_accepted: { icon: Swords, chip: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', label: 'Bet accepted' },
  wager_settled: { icon: Swords, chip: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', label: 'Bet settled' },
  wager_completed: { icon: Swords, chip: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', label: 'Bet result' },
};
const DEFAULT_EVENT = { icon: Activity, chip: 'bg-muted text-muted-foreground' };

// The game behind a bet post: matchup + final score + stake. `started` = the
// score is in (a final game); otherwise it's just the matchup + kickoff pending.
function GameRow({ m }: { m: FeedMeta }) {
  const started = m.away_score != null && m.home_score != null;
  const stake = m.amount_cents ? formatCredits(m.amount_cents) : m.treat === 'shot' ? '🥃' : '🍺';
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground">
        <span>{m.away}{started ? ` ${m.away_score}` : ''}</span>
        <span className="text-muted-foreground">{started ? '·' : '@'}</span>
        <span>{m.home}{started ? ` ${m.home_score}` : ''}</span>
      </span>
      <span className="ml-auto text-xs font-medium text-muted-foreground">
        {stake}{started ? ' · Final' : ''}
      </span>
    </div>
  );
}

// Compact relative time ("just now", "5m ago", "3h ago", then a date).
function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type FeedPostCardProps = {
  item: FeedItem;
  engagement: PostEngagement;
  currentUserId: string;
  engagementKey: string;
  /** Author's avatar key, looked up from league members; null for system posts. */
  authorAvatarKey?: string | null;
  /** Resolve a member's avatar key by user id — used for comment authors. */
  avatarFor?: (userId: string) => string | null | undefined;
};

/** Avatar/icon + title/body/link/meta. Shared by the feed card and the dialog. */
function PostHeader({
  item,
  authorAvatarKey,
  className,
  footer,
}: {
  item: FeedItem;
  authorAvatarKey?: string | null;
  className?: string;
  footer?: ReactNode;
}) {
  const ev = EVENT_STYLE[item.event_type ?? ''] ?? DEFAULT_EVENT;
  const isWinner = item.event_type === 'period_final';
  const isAnnouncement = item.kind === 'announcement';

  // A labelled event (bet events) reads as a system line — the icon + a short
  // label, no avatar and no matchup title — even though it carries an author_id
  // (the proposer). Everything else keeps the avatar + title behaviour.
  const asSystem = !item.author_id || !!ev.label;

  // Activity posts embed the actor in the title ("Anky took … against Johnny"),
  // so the title is the heading and the author's avatar sits beside it.
  // Announcements/chat lead with the poster's name, with any title below.
  const heading =
    ev.label ??
    (item.kind === 'activity'
      ? item.title ?? item.author_name ?? 'Update'
      : item.author_name ?? item.title ?? 'Update');
  // The distinct sub-title (system posts) is suppressed for labelled events so
  // the matchup name doesn't reappear under the label.
  const showSubtitle = !ev.label && !!item.title && item.title !== heading;

  // Bet posts carry the game: show a compact matchup + final score row (from
  // meta). Older posts without meta fall back to the matchup name.
  const wagerEvent = (item.event_type ?? '').startsWith('wager_');
  const gm = item.meta;
  const hasGame = wagerEvent && !!gm && (!!gm.away || !!gm.home);
  const showMatchupFallback = wagerEvent && !hasGame && !!item.title && item.title !== heading;

  return (
    <div className={cn('flex flex-col gap-4 p-4 sm:p-5', className)}>
      {/* Heading — avatar + author name over the date (post4 style). */}
      <div className="flex items-center gap-3">
        {!asSystem && item.author_id ? (
          <UserAvatar
            userId={item.author_id}
            name={item.author_name ?? 'Member'}
            imageUrl={authorAvatarKey}
            className="size-10 shrink-0"
            clickable={false}
          />
        ) : (
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', ev.chip)} aria-hidden>
            <ev.icon className="size-5" />
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{heading}</span>
          <time className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</time>
        </div>
        {isAnnouncement && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <Megaphone className="size-3" /> Announcement
          </span>
        )}
      </div>

      {/* Body — a distinct title (system posts) then the text. */}
      {showSubtitle && (
        <div className="text-base font-semibold text-foreground">{item.title}</div>
      )}
      {item.body && (
        <p
          className={cn(
            'whitespace-pre-wrap break-words text-base leading-relaxed text-foreground',
            isWinner && 'font-medium',
          )}
        >
          {item.body}
        </p>
      )}
      {hasGame && gm && <GameRow m={gm} />}
      {showMatchupFallback && (
        <div className="text-sm font-medium text-muted-foreground">{item.title}</div>
      )}
      {item.link_url && (
        <a
          href={item.link_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="break-all text-xs text-primary hover:underline"
        >
          {item.link_label || item.link_url}
        </a>
      )}
      {footer}
    </div>
  );
}

export function FeedPostCard({ item, engagement, currentUserId, engagementKey, authorAvatarKey, avatarFor }: FeedPostCardProps) {
  const [open, setOpen] = useState(false);

  const isWinner = item.event_type === 'period_final';

  const reactionControl = (
    <ReactionControl postId={item.id} engagement={engagement} engagementKey={engagementKey} />
  );

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'min-w-0 cursor-pointer flex-col items-stretch gap-0 overflow-hidden p-0 transition-shadow hover:shadow-sm',
          isWinner && 'border-violet-500/30 bg-gradient-to-br from-violet-500/[0.07] to-fuchsia-500/[0.07]',
        )}
      >
        <PostHeader
          item={item}
          authorAvatarKey={authorAvatarKey}
          footer={
            <div className="flex items-center gap-1 border-t border-dashed border-border pt-3">
              {reactionControl}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(true);
                }}
              >
                <MessageCircle className="size-4" />
                {engagement.comment_count > 0 ? `${engagement.comment_count} Comment${engagement.comment_count === 1 ? '' : 's'}` : 'Comment'}
              </Button>
            </div>
          }
        />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0">
          <DialogHeader className="sr-only mb-0">
            <DialogTitle>{item.title || item.author_name || 'Post'}</DialogTitle>
            <DialogDescription>Post details and comments</DialogDescription>
          </DialogHeader>
          <PostContent
            item={item}
            authorAvatarKey={authorAvatarKey}
            avatarFor={avatarFor}
            currentUserId={currentUserId}
            engagementKey={engagementKey}
            reactionControl={reactionControl}
            open={open}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The full post + comments + composer shown inside the dialog. */
function PostContent({
  item,
  authorAvatarKey,
  avatarFor,
  currentUserId,
  engagementKey,
  reactionControl,
  open,
}: {
  item: FeedItem;
  authorAvatarKey?: string | null;
  avatarFor?: (userId: string) => string | null | undefined;
  currentUserId: string;
  engagementKey: string;
  reactionControl: ReactNode;
  open: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const comments = useQuery({
    queryKey: ['post-comments', item.id],
    queryFn: () => commentsApi.list(item.id),
    enabled: open,
  });

  const refreshEngagement = () => qc.invalidateQueries({ queryKey: ['feed-engagement', engagementKey] });
  const onErr = (e: Error) => toast.error(e.message);

  const addComment = useMutation({
    mutationFn: () => commentsApi.create(item.id, draft.trim(), replyTo?.id),
    onSuccess: () => {
      setDraft('');
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ['post-comments', item.id] });
      refreshEngagement();
    },
    onError: onErr,
  });

  const removeComment = useMutation({
    mutationFn: (commentId: string) => commentsApi.delete(commentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['post-comments', item.id] });
      refreshEngagement();
    },
    onError: onErr,
  });

  const list = comments.data ?? [];

  return (
    <>
      {/* Post + comments scroll together; the composer stays pinned below. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PostHeader
          item={item}
          authorAvatarKey={authorAvatarKey}
          className="pe-10"
          footer={<div className="flex items-center gap-1 border-t border-dashed border-border pt-3">{reactionControl}</div>}
        />
        <div className="border-t border-border px-5 py-4">
          {list.length > 0 && (
            <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {list.length} comment{list.length === 1 ? '' : 's'}
            </div>
          )}
          {comments.isLoading && <p className="text-xs text-muted-foreground">Loading comments…</p>}
          {list.map((c) => (
            <CommentThread
              key={c.id}
              comment={c}
              avatarFor={avatarFor}
              currentUserId={currentUserId}
              onReply={(comment) => {
                setReplyTo(comment);
                setDraft('');
              }}
              onDelete={(id) => removeComment.mutate(id)}
              deleting={removeComment.isPending}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border p-3">
        {replyTo && (
          <p className="mb-1 text-xs text-muted-foreground">
            Replying to <span className="font-medium text-foreground">{replyTo.author_name ?? 'member'}</span>
            <button type="button" className="ml-2 text-primary hover:underline" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}
            rows={1}
            className="min-h-[2.5rem] min-w-0 flex-1 resize-none text-sm"
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline.
              if (e.key === 'Enter' && !e.shiftKey && draft.trim()) {
                e.preventDefault();
                addComment.mutate();
              }
            }}
          />
          <Button
            size="sm"
            className="shrink-0"
            disabled={addComment.isPending || !draft.trim()}
            onClick={() => addComment.mutate()}
          >
            {replyTo ? 'Reply' : 'Post'}
          </Button>
        </div>
      </div>
    </>
  );
}

function CommentThread({
  comment,
  avatarFor,
  currentUserId,
  onReply,
  onDelete,
  deleting,
  depth = 0,
}: {
  comment: Comment;
  avatarFor?: (userId: string) => string | null | undefined;
  currentUserId: string;
  onReply: (c: Comment) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
  depth?: number;
}) {
  const isOwn = comment.author_id === currentUserId;

  return (
    <div className={cn('mb-4', depth > 0 && 'ml-5 border-l border-border pl-4')}>
      <div className="flex items-start gap-2.5">
        <UserAvatar
          userId={comment.author_id}
          name={comment.author_name ?? 'Member'}
          imageUrl={avatarFor?.(comment.author_id)}
          className="size-8 shrink-0"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-base font-medium text-foreground">{comment.author_name ?? 'Member'}</span>
              <span className="shrink-0 text-sm text-muted-foreground">{timeAgo(comment.created_at)}</span>
            </div>
            {depth === 0 && (
              <button
                type="button"
                className="shrink-0 text-sm font-medium text-primary hover:underline"
                onClick={() => onReply(comment)}
              >
                Reply
              </button>
            )}
          </div>
          <p className="whitespace-pre-wrap break-words text-base text-foreground">{comment.body}</p>
        </div>
        {isOwn && (
          <Button
            variant="ghost"
            size="sm"
            className="size-7 shrink-0 p-0 text-muted-foreground"
            disabled={deleting}
            onClick={() => onDelete(comment.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {(comment.replies ?? []).map((r) => (
        <CommentThread
          key={r.id}
          comment={r}
          avatarFor={avatarFor}
          currentUserId={currentUserId}
          onReply={onReply}
          onDelete={onDelete}
          deleting={deleting}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
