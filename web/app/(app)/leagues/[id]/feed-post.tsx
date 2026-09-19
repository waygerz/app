'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  ArrowUp,
  CalendarClock,
  Megaphone,
  MessageCircle,
  PartyPopper,
  Swords,
  Trophy,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { commentsApi, type Comment, type PostEngagement } from '@/lib/comments';
import { ReactionControl, topEmojis } from '@/components/reactions/reaction-control';
import type { FeedItem, FeedMeta } from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';

// The feed is a timeline (Threads-style): people's posts are rows with an
// icon action bar and the newest comment inline; system activity (joins, bets,
// weekly results) is a one-line row. Comments open in a bottom sheet.

// System activity gets a per-event-type icon + tinted chip, mirroring the
// color language of the leagues home and landing page. Entries with a `label`
// are bet events: their text is the post body ("Sam won $40 from Riley").
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

// Quick emoji for the comment composer — inserted into the text.
const QUICK_EMOJI = ['🔥', '😂', '💰', '👍', '😭', '😮'];

// Compact relative time: "now", "5m", "3h", "4d", then a date.
function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// The game behind a bet post, as one line: "LAC 17–24 KC · $40" (final) or
// "LAC @ KC · $40" (not played yet).
function gameLine(m: FeedMeta): string | null {
  if (!m.away && !m.home) return null;
  const started = m.away_score != null && m.home_score != null;
  const stake = m.amount_cents ? formatCredits(m.amount_cents) : m.treat === 'shot' ? '🥃' : '🍺';
  const game = started ? `${m.away} ${m.away_score}–${m.home_score} ${m.home}` : `${m.away} @ ${m.home}`;
  return `${game} · ${stake}`;
}

/** What a post says, split for display. Bet events lead with the body; other
 * activity leads with the title (the body, if different, is the detail). */
function postText(item: FeedItem) {
  const ev = EVENT_STYLE[item.event_type ?? ''] ?? DEFAULT_EVENT;
  const isBet = !!ev.label;
  const primary = isBet
    ? item.body ?? item.title ?? ev.label!
    : item.kind === 'activity'
      ? item.title ?? item.body ?? 'Update'
      : item.body ?? '';
  const detail =
    !isBet && item.kind === 'activity' && item.title && item.body && item.body !== item.title ? item.body : null;
  const game = isBet && item.meta ? gameLine(item.meta) : null;
  // A person's avatar leads, except for bet events and author-less system posts.
  const showAvatar = !!item.author_id && !isBet;
  return { ev, primary, detail, game, showAvatar };
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

/** One feed item: a post row or an activity row, plus its comments sheet. */
export function FeedPostCard(props: FeedPostCardProps) {
  const [open, setOpen] = useState(false);
  const { item } = props;
  return (
    <>
      {item.kind === 'activity' ? (
        <ActivityRow {...props} onOpen={() => setOpen(true)} />
      ) : (
        <PostRow {...props} onOpen={() => setOpen(true)} />
      )}
      <CommentsSheet {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}

// ---- Post row (announcements / people's posts) ------------------------------

function PostRow({
  item,
  engagement,
  engagementKey,
  authorAvatarKey,
  avatarFor,
  onOpen,
}: FeedPostCardProps & { onOpen: () => void }) {
  const name = item.author_name ?? 'Member';
  const count = engagement.comment_count;
  const latest = engagement.latest_comment;
  return (
    <article className="grid grid-cols-[2.5rem_1fr] gap-3 border-b border-border px-4 py-3">
      {item.author_id ? (
        <UserAvatar userId={item.author_id} name={name} imageUrl={authorAvatarKey} className="size-10" />
      ) : (
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
          <Megaphone className="size-5" />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-bold text-foreground">{name}</span>
          {item.kind === 'announcement' && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
              <Megaphone className="size-3" aria-hidden /> Announcement
            </span>
          )}
          <time dateTime={item.created_at} className="shrink-0 text-xs text-muted-foreground">
            · {timeAgo(item.created_at)}
          </time>
        </div>
        {item.title && item.title !== name && (
          <p className="text-sm font-semibold text-foreground">{item.title}</p>
        )}
        {item.body && (
          <button
            type="button"
            onClick={onOpen}
            className="whitespace-pre-wrap break-words text-left text-[15px] leading-relaxed text-foreground"
          >
            {item.body}
          </button>
        )}
        {item.link_url && (
          <a href={item.link_url} target="_blank" rel="noreferrer" className="break-all text-xs text-primary hover:underline">
            {item.link_label || item.link_url}
          </a>
        )}

        {/* Action row: react (+ who reacted), comments. */}
        <div className="-ms-2.5 flex items-center gap-1">
          <ReactionControl postId={item.id} engagement={engagement} engagementKey={engagementKey} compact />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
            onClick={onOpen}
            aria-label={count > 0 ? `${count} comment${count === 1 ? '' : 's'}` : 'Comment'}
          >
            <MessageCircle className="size-4" />
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </Button>
        </div>

        {/* The newest comment, inline; the rest are one tap away. */}
        {latest && (
          <button type="button" onClick={onOpen} className="flex flex-col items-start gap-1.5 text-left">
            <span className="flex min-w-0 items-start gap-2">
              <UserAvatar
                userId={latest.author_id}
                name={latest.author_name ?? 'Member'}
                imageUrl={avatarFor?.(latest.author_id)}
                className="mt-0.5 size-6 shrink-0"
                fallbackClassName="text-[10px]"
                clickable={false}
              />
              <span className="line-clamp-2 min-w-0 rounded-2xl bg-muted px-3 py-1.5 text-sm text-foreground">
                <span className="me-1 font-semibold">{latest.author_name ?? 'Member'}</span>
                {latest.body}
              </span>
            </span>
            {count > 1 && (
              <span className="text-xs font-semibold text-muted-foreground">View all {count} comments</span>
            )}
          </button>
        )}
      </div>
    </article>
  );
}

// ---- Activity row (joins, bets, weekly results) -------------------------------

function ActivityRow({ item, engagement, authorAvatarKey, onOpen }: FeedPostCardProps & { onOpen: () => void }) {
  const { ev, primary, detail, game, showAvatar } = postText(item);
  const reactions = engagement.total_reactions;
  const comments = engagement.comment_count;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      {showAvatar && item.author_id ? (
        <UserAvatar
          userId={item.author_id}
          name={item.author_name ?? 'Member'}
          imageUrl={authorAvatarKey}
          className="size-8 shrink-0"
          clickable={false}
        />
      ) : (
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', ev.chip)} aria-hidden>
          <ev.icon className="size-4" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-2 text-sm text-foreground">{primary}</span>
        {(game || detail) && (
          <span className="line-clamp-2 text-xs tabular-nums text-muted-foreground">{game ?? detail}</span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
        <time dateTime={item.created_at}>{timeAgo(item.created_at)}</time>
        {(reactions > 0 || comments > 0) && (
          <span className="flex items-center gap-1.5 tabular-nums">
            {reactions > 0 && <span>{topEmojis(engagement.reactions, 2)} {reactions}</span>}
            {comments > 0 && (
              <span className="flex items-center gap-0.5">
                <MessageCircle className="size-3" aria-hidden />
                {comments}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

// ---- Comments sheet -----------------------------------------------------------

function CommentsSheet({
  item,
  engagement,
  currentUserId,
  engagementKey,
  authorAvatarKey,
  avatarFor,
  open,
  onOpenChange,
}: FeedPostCardProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  // Threads whose replies are showing (collapsed behind "View N replies").
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
      // Show the thread the reply went into.
      if (replyTo) setExpanded((s) => new Set(s).add(replyTo.id));
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
  const count = engagement.comment_count;
  const { ev, primary, detail, game, showAvatar } = postText(item);
  const isPost = item.kind !== 'activity';
  const send = () => {
    if (draft.trim() && !addComment.isPending) addComment.mutate();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="h-[85dvh] max-h-[85dvh]">
        <DrawerTitle className="border-b border-border pb-2.5 pt-2 text-center text-sm font-bold">
          {count > 0 ? `${count} comment${count === 1 ? '' : 's'}` : 'Comments'}
        </DrawerTitle>
        <DrawerDescription className="sr-only">The post and its comments</DrawerDescription>

        {/* The post, summarized, with its reactions. */}
        <div className="flex gap-3 border-b border-border bg-muted/30 px-4 py-3">
          {(isPost || showAvatar) && item.author_id ? (
            <UserAvatar
              userId={item.author_id}
              name={item.author_name ?? 'Member'}
              imageUrl={authorAvatarKey}
              className="size-8 shrink-0"
            />
          ) : (
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', ev.chip)} aria-hidden>
              <ev.icon className="size-4" />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-foreground">
              {isPost && <span className="me-1 font-semibold">{item.author_name ?? 'Member'}</span>}
              {primary}
            </p>
            {(game || detail) && <p className="text-xs tabular-nums text-muted-foreground">{game ?? detail}</p>}
            {item.link_url && (
              <a href={item.link_url} target="_blank" rel="noreferrer" className="break-all text-xs text-primary hover:underline">
                {item.link_label || item.link_url}
              </a>
            )}
            <div className="-ms-2.5">
              <ReactionControl postId={item.id} engagement={engagement} engagementKey={engagementKey} />
            </div>
          </div>
        </div>

        {/* Threads. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {comments.isLoading && <p className="text-xs text-muted-foreground">Loading comments…</p>}
          {!comments.isLoading && list.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
          )}
          <div className="flex flex-col gap-4">
            {list.map((c) => {
              const replies = c.replies ?? [];
              const showReplies = expanded.has(c.id);
              return (
                <div key={c.id} className="flex flex-col gap-3">
                  <CommentItem
                    comment={c}
                    avatarFor={avatarFor}
                    isOwn={c.author_id === currentUserId}
                    onReply={() => setReplyTo(c)}
                    onDelete={() => removeComment.mutate(c.id)}
                    deleting={removeComment.isPending}
                  />
                  {replies.length > 0 && (
                    <div className="ms-10 flex flex-col gap-3">
                      {showReplies ? (
                        replies.map((r) => (
                          <CommentItem
                            key={r.id}
                            comment={r}
                            avatarFor={avatarFor}
                            isOwn={r.author_id === currentUserId}
                            onDelete={() => removeComment.mutate(r.id)}
                            deleting={removeComment.isPending}
                          />
                        ))
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpanded((s) => new Set(s).add(c.id))}
                          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"
                        >
                          <span className="h-px w-6 bg-input" aria-hidden />
                          View {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Composer: replying chip, quick emoji, pill input + send. */}
        <div className="border-t border-border pb-[env(safe-area-inset-bottom)]">
          {replyTo && (
            <div className="mx-3 mt-2 flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
              <span>
                Replying to <span className="font-semibold text-foreground">{replyTo.author_name ?? 'member'}</span>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="p-1">
                <X className="size-3.5" />
              </button>
            </div>
          )}
          <div className="flex justify-around px-3 pt-1.5">
            {QUICK_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setDraft((d) => d + e)}
                className="flex size-10 items-center justify-center rounded-full text-xl hover:bg-muted"
                aria-label={`Add ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 px-3 pb-3 pt-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={replyTo ? `Reply to ${replyTo.author_name ?? 'member'}…` : 'Add a comment…'}
              rows={1}
              aria-label={replyTo ? 'Write a reply' : 'Write a comment'}
              className="max-h-28 min-h-10 min-w-0 flex-1 resize-none rounded-3xl px-4 py-2.5 text-sm [field-sizing:content]"
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter inserts a newline.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button
              size="icon"
              className="size-10 shrink-0 rounded-full"
              aria-label={replyTo ? 'Send reply' : 'Post comment'}
              disabled={addComment.isPending || !draft.trim()}
              onClick={send}
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function CommentItem({
  comment,
  avatarFor,
  isOwn,
  onReply,
  onDelete,
  deleting,
}: {
  comment: Comment;
  avatarFor?: (userId: string) => string | null | undefined;
  isOwn: boolean;
  /** Top-level comments only — replies are one level deep. */
  onReply?: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const name = comment.author_name ?? 'Member';
  return (
    <div className="flex items-start gap-2.5">
      <UserAvatar
        userId={comment.author_id}
        name={name}
        imageUrl={avatarFor?.(comment.author_id)}
        className="size-7 shrink-0"
        fallbackClassName="text-[10px]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">
          <span className="me-1.5 font-semibold text-foreground">{name}</span>
          <time dateTime={comment.created_at}>{timeAgo(comment.created_at)}</time>
        </p>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{comment.body}</p>
        {(onReply || isOwn) && (
          <div className="flex gap-4 text-xs font-semibold text-muted-foreground">
            {onReply && (
              <button type="button" onClick={onReply} className="py-1 hover:text-foreground">
                Reply
              </button>
            )}
            {isOwn && (
              <button type="button" onClick={onDelete} disabled={deleting} className="py-1 hover:text-destructive">
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
