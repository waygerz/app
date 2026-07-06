'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Share2, UserPlus } from 'lucide-react';
import { friendsApi } from '@/lib/friends';
import { leaguesApi } from '@/lib/leagues';
import { shareLink } from '@/lib/share';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { UserAvatar } from '@/components/user-avatar';

export function LeagueInviteDialog({
  leagueName,
  joinCode,
  isCommish = false,
  leagueId,
  memberIds = [],
  onInvitesSent,
}: {
  leagueName: string;
  joinCode: string;
  isCommish?: boolean;
  leagueId?: string;
  memberIds?: string[];
  onInvitesSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const inviteLink = `${window.location.origin}/invite?code=${joinCode}`;

  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: friendsApi.list,
    enabled: open && isCommish,
  });

  const send = useMutation({
    mutationFn: () => leaguesApi.sendInvites(leagueId!, selected),
    onSuccess: () => {
      toast.success('Invites sent');
      setSelected([]);
      onInvitesSent?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyLink = () => {
    navigator.clipboard?.writeText(inviteLink);
    toast.success('Invite link copied');
  };

  const shareInvite = async () => {
    try {
      const result = await shareLink({
        url: inviteLink,
        title: `Join ${leagueName} on Waygerz`,
        text: `You're invited to join ${leagueName} on Waygerz`,
      });
      toast.success(result === 'shared' ? 'Link shared' : 'Link copied — paste into a message');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toast.error(e instanceof Error ? e.message : 'Could not share link');
    }
  };

  const candidates = (friends.data ?? []).filter((f) => !memberIds.includes(String(f.user_id)));
  const toggle = (uid: string) =>
    setSelected((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="size-4" />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to {leagueName}</DialogTitle>
          <DialogDescription>
            Share this link so people can join the league.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-2">
          <span className="block min-w-0 truncate rounded-lg bg-muted px-3 py-1.5 text-xs text-foreground">
            {inviteLink}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void shareInvite()}>
              <Share2 className="size-4" />
              Share
            </Button>
            <Button size="sm" variant="outline" onClick={copyLink}>
              <Copy className="size-4" />
              Copy
            </Button>
          </div>

          {isCommish && leagueId && (
            <div className="mt-2 border-t border-border pt-4">
              <p className="mb-2 text-sm font-medium text-foreground">Invite friends</p>
              {friends.isLoading && <p className="text-sm text-muted-foreground">Loading friends…</p>}
              {!friends.isLoading && candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No friends to invite — they may already be members. Add friends from the Friends page.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {candidates.map((f) => (
                  <label key={f.user_id} className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={selected.includes(String(f.user_id))}
                      onChange={() => toggle(String(f.user_id))}
                    />
                    <UserAvatar userId={String(f.user_id)} name={f.display_name} className="size-8 shrink-0" />
                    {f.display_name}
                  </label>
                ))}
              </div>
              {candidates.length > 0 && (
                <Button
                  className="mt-3 self-start"
                  size="sm"
                  disabled={selected.length === 0 || send.isPending}
                  onClick={() => send.mutate()}
                >
                  Send{selected.length > 0 ? ` (${selected.length})` : ''}
                </Button>
              )}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}