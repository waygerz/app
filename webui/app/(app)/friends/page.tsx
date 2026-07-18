'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Share2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { friendsApi, type Friend, type FriendRequest } from '@/lib/friends';
import { shareLink } from '@/lib/share';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserMiniCard } from '@/components/user-mini-card';

// Dense grid for display-only cards; roomier grid for cards with action buttons
// (Accept/Decline) so they don't cramp at 2 columns on phones.
const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4';
const ACTION_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';

function AddFriendsButton({
  inviteLink,
  displayName,
}: {
  inviteLink: string;
  displayName: string;
}) {
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
    <Button variant="outline" size="sm" disabled={!inviteLink} onClick={() => void shareInvite()}>
      <Share2 className="size-4" />
      Add Friends
    </Button>
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
        {user && <AddFriendsButton inviteLink={inviteLink} displayName={user.display_name} />}
      </div>

      {incoming.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Requests ({incoming.length})</h2>
          <div className={ACTION_GRID}>
            {incoming.map((r: FriendRequest) => (
              <UserMiniCard
                key={r.id}
                userId={String(r.user_id)}
                name={r.display_name}
                subtitle="Wants to be friends"
                actions={
                  <>
                    <Button size="sm" onClick={() => accept.mutate(r.id)}>Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => decline.mutate(r.id)}>Decline</Button>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Your friends ({friends.data?.length ?? 0})
        </h2>
        {friends.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (friends.data?.length ?? 0) === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No friends yet — share your link or add someone from a league members page.
          </Card>
        ) : (
          <div className={GRID}>
            {friends.data?.map((f: Friend) => (
              <UserMiniCard key={f.friendship_id} userId={String(f.user_id)} name={f.display_name} />
            ))}
          </div>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Pending sent</h2>
          <div className={GRID}>
            {outgoing.map((r: FriendRequest) => (
              <UserMiniCard
                key={r.id}
                userId={String(r.user_id)}
                name={r.display_name}
                subtitle="Pending…"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
