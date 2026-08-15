'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SmilePlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { commentsApi, type PostEngagement } from '@/lib/comments';
import { REACTIONS, REACTION_EMOJI, REACTION_LABEL, type ReactionKey } from '@/lib/reactions';
import { cn } from '@/lib/utils';

function topEmojis(reactions: Partial<Record<ReactionKey, number>>, n = 3) {
  return (Object.entries(reactions) as [ReactionKey, number][])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => REACTION_EMOJI[k])
    .join('');
}

export function ReactionControl({
  postId,
  engagement,
  engagementKey,
}: {
  postId: string;
  engagement: PostEngagement;
  engagementKey: string;
}) {
  const qc = useQueryClient();
  const [barOpen, setBarOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const mine = engagement.my_reaction;
  const total = engagement.total_reactions;

  const settle = () => qc.invalidateQueries({ queryKey: ['feed-engagement', engagementKey] });

  const set = useMutation({
    mutationFn: (key: ReactionKey) => commentsApi.setReaction(postId, key),
    onSuccess: settle,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => commentsApi.removeReaction(postId),
    onSuccess: settle,
    onError: (e: Error) => toast.error(e.message),
  });

  const pick = (key: ReactionKey) => {
    setBarOpen(false);
    if (key === mine) remove.mutate();
    else set.mutate(key);
  };

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Popover open={barOpen} onOpenChange={setBarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 gap-1.5 px-2.5 text-xs text-muted-foreground',
              mine && 'text-primary',
            )}
            disabled={set.isPending || remove.isPending}
          >
            {mine ? (
              <span className="text-base leading-none">{REACTION_EMOJI[mine]}</span>
            ) : (
              <SmilePlus className="size-4" />
            )}
            {mine ? REACTION_LABEL[mine] : 'React'}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-auto rounded-full p-1.5"
        >
          <div className="flex items-center gap-0.5">
            {REACTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-label={r.label}
                aria-pressed={mine === r.key}
                onClick={() => pick(r.key)}
                className={cn(
                  'flex size-11 items-center justify-center rounded-full text-2xl transition hover:scale-125 hover:bg-muted',
                  mine === r.key && 'bg-primary/15',
                )}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {total > 0 && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          aria-label="See who reacted"
        >
          <span className="leading-none">{topEmojis(engagement.reactions)}</span>
          <span className="tabular-nums">{total}</span>
        </button>
      )}

      <ReactorSheet postId={postId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

function ReactorSheet({
  postId,
  open,
  onOpenChange,
}: {
  postId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const q = useQuery({
    queryKey: ['post-reactors', postId],
    queryFn: () => commentsApi.reactors(postId),
    enabled: open,
    staleTime: 10_000,
  });
  const reactors = q.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[70svh] flex-col gap-0 rounded-t-2xl p-0">
        <SheetHeader className="border-b px-4 py-3 text-start">
          <SheetTitle className="text-base">Reactions</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-2">
          {q.isPending ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : reactors.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No reactions yet.</p>
          ) : (
            reactors.map((r) => (
              <div key={r.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <div className="relative shrink-0">
                  <UserAvatar
                    userId={r.user_id}
                    name={r.display_name ?? 'Member'}
                    imageUrl={r.avatar_key}
                    className="size-9"
                  />
                  <span className="absolute -bottom-1 -right-1 text-sm leading-none">
                    {REACTION_EMOJI[r.reaction]}
                  </span>
                </div>
                <span className="truncate text-sm font-medium text-foreground">
                  {r.display_name ?? 'Member'}
                </span>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
