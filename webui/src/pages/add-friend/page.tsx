import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clearPendingLink } from '@/lib/pending-link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { friendsApi } from '@/lib/friends';
import { AuthRedirectIfGuest } from '@/auth/AuthRedirectIfGuest';
import { UserAvatar } from '@/components/user-avatar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function AddFriendContent({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    clearPendingLink();
  }, []);

  const preview = useQuery({
    queryKey: ['friend-invite', userId],
    queryFn: () => friendsApi.invitePreview(userId),
    retry: false,
  });

  const add = useMutation({
    mutationFn: () => friendsApi.addByUserId(userId),
    onSuccess: () => {
      toast.success('Friend request sent');
      qc.invalidateQueries({ queryKey: ['friend-invite', userId] });
      qc.invalidateQueries({ queryKey: ['friend-requests'] });
      navigate('/friends');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accept = useMutation({
    mutationFn: (requestId: string) => friendsApi.accept(requestId),
    onSuccess: () => {
      toast.success('Friend added');
      qc.invalidateQueries({ queryKey: ['friend-invite', userId] });
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['friend-requests'] });
      navigate('/friends');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decline = useMutation({
    mutationFn: (requestId: string) => friendsApi.decline(requestId),
    onSuccess: () => {
      toast.success('Request declined');
      qc.invalidateQueries({ queryKey: ['friend-invite', userId] });
      qc.invalidateQueries({ queryKey: ['friend-requests'] });
      navigate('/');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (preview.isLoading) {
    return <p className="text-center text-sm text-muted-foreground">Loading…</p>;
  }

  if (preview.isError || !preview.data) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">This friend link is invalid.</p>
        <Link to="/" className="text-sm text-primary hover:underline">Go to Waygerz</Link>
      </div>
    );
  }

  const { user, relationship: rel, request_id: requestId } = preview.data;
  const busy = add.isPending || accept.isPending || decline.isPending;

  return (
    <>
      <div className="flex flex-col items-center gap-3 text-center">
        <UserAvatar
          userId={user.id}
          name={user.display_name}
          className="size-20"
          fallbackClassName="text-xl"
        />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{user.display_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">on Waygerz</p>
        </div>
      </div>

      {rel === 'self' ? (
        <p className="text-center text-sm text-muted-foreground">
          This is your friend link — share it so others can add you.
        </p>
      ) : rel === 'friends' ? (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground">You are already friends.</p>
          <Button variant="outline" onClick={() => navigate('/friends')}>View friends</Button>
        </div>
      ) : rel === 'pending_out' ? (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground">Friend request already sent.</p>
          <Button variant="outline" onClick={() => navigate('/friends')}>View friends</Button>
        </div>
      ) : rel === 'pending_in' && requestId ? (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground">
            {user.display_name} wants to be friends.
          </p>
          <Button onClick={() => accept.mutate(requestId)} disabled={busy}>
            {accept.isPending ? 'Accepting…' : 'Accept'}
          </Button>
          <Button variant="outline" onClick={() => decline.mutate(requestId)} disabled={busy}>
            {decline.isPending ? 'Declining…' : 'Decline'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground">
            Add {user.display_name} as a friend?
          </p>
          <Button onClick={() => add.mutate()} disabled={busy}>
            {add.isPending ? 'Sending…' : 'Add friend'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/')} disabled={busy}>
            Decline
          </Button>
        </div>
      )}
    </>
  );
}

export function AddFriendPage() {
  const [params] = useSearchParams();
  const userId = (params.get('u') || '').trim();

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-4">
      <Card className="w-full max-w-md gap-5 p-6">
        {!userId ? (
          <p className="text-center text-sm text-muted-foreground">Missing user in this link.</p>
        ) : (
          <AuthRedirectIfGuest>
            <AddFriendContent userId={userId} />
          </AuthRedirectIfGuest>
        )}
      </Card>
    </div>
  );
}