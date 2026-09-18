'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  pendingLinkFromReturnPath,
  readPendingLink,
  savePendingLinkFromReturnPath,
} from '@/lib/pending-link';
import {
  resolveCode,
  type LeagueCodePreview,
  type FriendCodePreview,
  type BetCodePreview,
} from '@/lib/invites';
import { LeagueAvatar } from '@/components/league-avatar';
import { UserAvatar } from '@/components/user-avatar';

// sessionStorage has no same-tab change events; the stash is only read here.
const subscribeNoop = () => () => {};

export function PendingLinkBanner({ returnPath }: { returnPath?: string }) {
  // A /c/<code> return path is the pending link (stashed for after login below);
  // otherwise fall back to a code an earlier visit stashed.
  const fromReturn = returnPath ? pendingLinkFromReturnPath(returnPath) : null;
  const storedCode = useSyncExternalStore(
    subscribeNoop,
    () => readPendingLink()?.code ?? null,
    () => null,
  );

  useEffect(() => {
    if (returnPath) savePendingLinkFromReturnPath(returnPath);
  }, [returnPath]);

  const code = fromReturn?.code ?? storedCode ?? '';

  const resolved = useQuery({
    queryKey: ['pending-link', code],
    queryFn: () => resolveCode(code),
    enabled: !!code,
    retry: false,
  });

  if (!code) return null;

  if (resolved.isLoading) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
        Loading invite…
      </p>
    );
  }

  const data = resolved.data;
  if (resolved.isError || !data || data.state !== 'ok' || !data.preview) return null;

  if (data.type === 'league') {
    const lg = data.preview as LeagueCodePreview;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <LeagueAvatar name={lg.name} logoUrl={lg.logo_url} id={lg.id} size={44} />
        <div className="min-w-0 text-left">
          <p className="text-xs text-muted-foreground">Log in to join</p>
          <p className="truncate text-sm font-semibold text-foreground">{lg.name}</p>
        </div>
      </div>
    );
  }

  if (data.type === 'bet') {
    const w = (data.preview as BetCodePreview).wager;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <UserAvatar
          userId={w.proposer_id}
          name={w.proposer_name}
          imageUrl={w.proposer_avatar_key}
          className="size-10 shrink-0"
        />
        <div className="min-w-0 text-left">
          <p className="text-xs text-muted-foreground">Log in to answer your bet</p>
          <p className="truncate text-sm font-semibold text-foreground">
            {w.proposer_name} · {w.event_name || `${w.away_team} @ ${w.home_team}`}
          </p>
        </div>
      </div>
    );
  }

  const user = (data.preview as FriendCodePreview).user;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <UserAvatar
        userId={user.id}
        name={user.display_name}
        imageUrl={user.avatar_key}
        className="size-10 shrink-0"
      />
      <div className="min-w-0 text-left">
        <p className="text-xs text-muted-foreground">Log in to connect</p>
        <p className="truncate text-sm font-semibold text-foreground">{user.display_name}</p>
      </div>
    </div>
  );
}
