'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Share2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { friendsApi, type Friend, type FriendRequest } from '@/lib/friends';
import { shareLink } from '@/lib/share';
import { Card } from '@/components/ui/card';
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

function PersonRow({
  userId,
  name,
  children,
}: {
  userId: string;
  name: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar userId={userId} name={name} className="size-9 shrink-0" />
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
      </div>
      {children && <div className="flex flex-wrap gap-2 sm:shrink-0">{children}</div>}
    </div>
  );
}

function ShareFriendLinkDialog({
  inviteLink,
  displayName,
}: {
  inviteLink: string;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);

  const copyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard?.writeText(inviteLink);
    toast.success('Friend link copied');
  };

  const shareInvite = async () => {
    if (!inviteLink) return;
    try {
      const result = await shareLink({
        url: inviteLink,
        title: 'Add me on Waygerz',
        text: `${displayName} wants to be friends on Waygerz`,
      });
      toast.success(result === 'shared' ? 'Link shared' : 'Link copied — paste into a message');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toast.error(e instanceof Error ? e.message : 'Could not share link');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!inviteLink}>
          <Share2 className="size-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your friend link</DialogTitle>
          <DialogDescription>
            Share this link so people can add you. You can also add league members from their member card.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-2">
          <span className="block min-w-0 truncate rounded-lg bg-muted px-3 py-1.5 text-xs text-foreground">
            {inviteLink || '…'}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void shareInvite()} disabled={!inviteLink}>
              <Share2 className="size-4" />
              Share
            </Button>
            <Button size="sm" variant="outline" onClick={copyLink} disabled={!inviteLink}>
              <Copy className="size-4" />
              Copy
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export default function FriendsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const friends = useQuery({ queryKey: ['friends'], queryFn: friendsApi.list });
  const requests = useQuery({ queryKey: ['friend-requests'], queryFn: friendsApi.requests });

  function refresh() {
    qc.invalidateQueries({ queryKey: ['friends'] });
    qc.invalidateQueries({ queryKey: ['friend-requests'] });
  }

  const accept = useMutation({
    mutationFn: (id: number) => friendsApi.accept(id),
    onSuccess: () => {
      toast.success('Friend added');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decline = useMutation({
    mutationFn: (id: number) => friendsApi.decline(id),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];
  const inviteLink = user ? friendsApi.inviteLink(String(user.id)) : '';

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Friends</h1>
        {user && <ShareFriendLinkDialog inviteLink={inviteLink} displayName={user.display_name} />}
      </div>

      {incoming.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Requests ({incoming.length})
          </h2>
          <Card className="px-5 py-1">
            {incoming.map((r: FriendRequest) => (
              <PersonRow key={r.id} userId={String(r.user_id)} name={r.display_name}>
                <Button size="sm" onClick={() => accept.mutate(r.id)}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => decline.mutate(r.id)}>
                  Decline
                </Button>
              </PersonRow>
            ))}
          </Card>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Your friends ({friends.data?.length ?? 0})
        </h2>
        <Card className="px-5 py-1">
          {friends.isLoading && <p className="py-4 text-sm text-muted-foreground">Loading…</p>}
          {!friends.isLoading && (friends.data?.length ?? 0) === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              No friends yet — share your link or add someone from a league members page.
            </p>
          )}
          {friends.data?.map((f: Friend) => (
            <PersonRow key={f.friendship_id} userId={String(f.user_id)} name={f.display_name} />
          ))}
        </Card>
      </section>

      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Pending sent</h2>
          <Card className="px-5 py-1">
            {outgoing.map((r: FriendRequest) => (
              <PersonRow key={r.id} userId={String(r.user_id)} name={r.display_name}>
                <span className="text-xs text-muted-foreground">Pending…</span>
              </PersonRow>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
