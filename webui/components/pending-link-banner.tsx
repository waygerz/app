'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  readPendingLink,
  savePendingLinkFromReturnPath,
  type PendingLink,
} from '@/lib/pending-link';
import { leaguesApi } from '@/lib/leagues';
import { friendsApi } from '@/lib/friends';
import { LeagueAvatar } from '@/components/league-avatar';
import { UserAvatar } from '@/components/user-avatar';

export function PendingLinkBanner({ returnPath }: { returnPath?: string }) {
  const [pending, setPending] = useState<PendingLink | null>(() => readPendingLink());

  useEffect(() => {
    if (returnPath) savePendingLinkFromReturnPath(returnPath);
    setPending(readPendingLink());
  }, [returnPath]);

  const inviteCode = pending?.kind === 'invite' ? pending.code : '';
  const friendUserId = pending?.kind === 'friend' ? pending.userId : '';

  const invite = useQuery({
    queryKey: ['pending-link-invite', inviteCode],
    queryFn: () => leaguesApi.preview(inviteCode),
    enabled: !!inviteCode,
    retry: false,
  });

  const friend = useQuery({
    queryKey: ['pending-link-friend', friendUserId],
    queryFn: () => friendsApi.invitePreview(friendUserId),
    enabled: !!friendUserId,
    retry: false,
  });

  if (!pending) return null;

  if (pending.kind === 'invite') {
    if (invite.isLoading) {
      return (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
          Loading league invite…
        </p>
      );
    }
    if (invite.isError || !invite.data) return null;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <LeagueAvatar
          name={invite.data.name}
          logoUrl={invite.data.logo_url}
          id={invite.data.id}
          size={44}
        />
        <div className="min-w-0 text-left">
          <p className="text-xs text-muted-foreground">Log in to join</p>
          <p className="truncate text-sm font-semibold text-foreground">{invite.data.name}</p>
        </div>
      </div>
    );
  }

  if (friend.isLoading) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
        Loading friend invite…
      </p>
    );
  }
  if (friend.isError || !friend.data) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <UserAvatar
        userId={friend.data.user.id}
        name={friend.data.user.display_name}
        className="size-11 shrink-0"
      />
      <div className="min-w-0 text-left">
        <p className="text-xs text-muted-foreground">Log in to connect</p>
        <p className="truncate text-sm font-semibold text-foreground">
          {friend.data.user.display_name}
        </p>
      </div>
    </div>
  );
}
