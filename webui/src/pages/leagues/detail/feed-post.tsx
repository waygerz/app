import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Activity, Heart, Megaphone, MessageCircle, Trash2 } from 'lucide-react';
import { commentsApi, type Comment, type PostEngagement } from '@/lib/comments';
import type { FeedItem } from '@/lib/leagues';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type FeedPostCardProps = {
  item: FeedItem;
  engagement: PostEngagement;
  currentUserId: string;
  engagementKey: string;
};

export function FeedPostCard({ item, engagement, currentUserId, engagementKey }: FeedPostCardProps) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const comments = useQuery({
    queryKey: ['post-comments', item.id],
    queryFn: () => commentsApi.list(item.id),
    enabled: expanded,
  });

  const refreshEngagement = () => qc.invalidateQueries({ queryKey: ['feed-engagement', engagementKey] });

  const onErr = (e: Error) => toast.error(e.message);

  const like = useMutation({
    mutationFn: () => commentsApi.toggleLike(item.id),
    onSuccess: refreshEngagement,
    onError: onErr,
  });

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

  const toggleExpanded = () => setExpanded((v) => !v);

  return (
    <Card className="min-w-0 flex-col items-stretch gap-0 overflow-hidden p-0">
      <div className="flex flex-row items-start gap-3 p-3">
        <div className="mt-0.5 text-muted-foreground">
          {item.kind === 'announcement' ? <Megaphone className="size-4" /> : <Activity className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          {item.title && <div className="text-sm font-medium text-foreground">{item.title}</div>}
          {item.body && <div className="break-words text-sm text-muted-foreground">{item.body}</div>}
          {item.link_url && (
            <a href={item.link_url} target="_blank" rel="noreferrer" className="break-all text-xs text-primary hover:underline">
              {item.link_label || item.link_url}
            </a>
          )}
          <div className="mt-1 text-[11px] text-muted-foreground">
            {item.author_name ? `${item.author_name} · ` : ''}
            {new Date(item.created_at).toLocaleString()}
          </div>

          <div className="mt-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-7 gap-1 px-2 text-xs', engagement.liked_by_me && 'text-rose-500')}
              disabled={like.isPending}
              onClick={() => like.mutate()}
            >
              <Heart className={cn('size-3.5', engagement.liked_by_me && 'fill-current')} />
              {engagement.like_count > 0 ? engagement.like_count : 'Like'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={toggleExpanded}
            >
              <MessageCircle className="size-3.5" />
              {engagement.comment_count > 0 ? engagement.comment_count : 'Comment'}
            </Button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-3">
          {comments.isLoading && <p className="text-xs text-muted-foreground">Loading comments…</p>}
          {(comments.data ?? []).map((c) => (
            <CommentThread
              key={c.id}
              comment={c}
              currentUserId={currentUserId}
              onReply={(comment) => { setReplyTo(comment); setDraft(''); }}
              onDelete={(id) => removeComment.mutate(id)}
              deleting={removeComment.isPending}
            />
          ))}
          {(comments.data ?? []).length === 0 && !comments.isLoading && (
            <p className="mb-2 text-xs text-muted-foreground">No comments yet — start the conversation.</p>
          )}

          {replyTo && (
            <p className="mb-1 text-xs text-muted-foreground">
              Replying to <span className="font-medium text-foreground">{replyTo.author_name ?? 'member'}</span>
              <button type="button" className="ml-2 text-primary hover:underline" onClick={() => setReplyTo(null)}>
                Cancel
              </button>
            </p>
          )}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}
              className="h-8 min-w-0 flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) addComment.mutate();
              }}
            />
            <Button
              size="sm"
              className="w-full shrink-0 sm:w-auto"
              disabled={addComment.isPending || !draft.trim()}
              onClick={() => addComment.mutate()}
            >
              {replyTo ? 'Reply' : 'Post'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function CommentThread({
  comment,
  currentUserId,
  onReply,
  onDelete,
  deleting,
  depth = 0,
}: {
  comment: Comment;
  currentUserId: string;
  onReply: (c: Comment) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
  depth?: number;
}) {
  const isOwn = comment.author_id === currentUserId;

  return (
    <div className={cn('mb-2', depth > 0 && 'ml-4 border-l border-border pl-3')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-foreground">{comment.author_name ?? 'Member'}</div>
          <div className="text-sm text-foreground">{comment.body}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{new Date(comment.created_at).toLocaleString()}</span>
            {depth === 0 && (
              <button type="button" className="text-primary hover:underline" onClick={() => onReply(comment)}>
                Reply
              </button>
            )}
          </div>
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