'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, Link2, Search, Share2, Users } from 'lucide-react';
import { friendsApi, type Friend } from '@/lib/friends';
import { leaguesApi, type LeagueMember } from '@/lib/leagues';
import { inviteUrl } from '@/lib/invites';
import { shareLink } from '@/lib/share';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CenterCard } from '@/components/ui/center-card';
import { UserAvatar } from '@/components/user-avatar';
import { ListSearch } from '@/components/list-search';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/**
 * Invite-to-league dialog: the league "Invite" action. Top is a button that
 * opens the by-link (external) invite dialog for people who aren't your friends;
 * below is a searchable list of your friends, each with a one-tap Invite that
 * fires a direct in-app league invite (leaguesApi.sendInvites).
 */
export function InviteToLeagueDialog({
  leagueId,
  leagueName,
  inviteCode,
  members,
  open,
  onOpenChange,
}: {
  leagueId: string;
  leagueName: string;
  inviteCode: string | null;
  members: LeagueMember[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [extOpen, setExtOpen] = useState(false);
  const [q, setQ] = useState('');
  // The league payload has no per-friend "already invited" flag, so track the
  // ones sent this session to flip their button to "Invited" optimistically.
  const [invited, setInvited] = useState<Set<string>>(new Set());

  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: friendsApi.list,
    enabled: open,
  });

  const invite = useMutation({
    mutationFn: (uid: string) => leaguesApi.sendInvites(leagueId, [uid]),
    onSuccess: (_d, uid) => {
      setInvited((prev) => new Set(prev).add(uid));
      toast.success('Invite sent');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const memberIds = useMemo(
    () => new Set(members.map((m) => String(m.user_id))),
    [members],
  );

  const query = q.trim().toLowerCase();
  const all = friends.data ?? [];
  const shown = query
    ? all.filter((f) => f.display_name.toLowerCase().includes(query))
    : all;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite to {leagueName}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Button variant="outline" className="w-full" onClick={() => setExtOpen(true)}>
              <Link2 className="size-4" />
              Invite by link
            </Button>

            {all.length > 0 && (
              <ListSearch value={q} onChange={setQ} placeholder="Search friends" />
            )}

            {friends.isLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ))}
              </div>
            ) : all.length === 0 ? (
              <CenterCard>
                <Users className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No friends yet — use “Invite by link” to share this league.
                </p>
              </CenterCard>
            ) : shown.length === 0 ? (
              <CenterCard>
                <Search className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No friends match “{q.trim()}”.</p>
              </CenterCard>
            ) : (
              <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
                {shown.map((f: Friend) => {
                  const uid = String(f.user_id);
                  const isMember = memberIds.has(uid);
                  const isInvited = invited.has(uid);
                  return (
                    <Card
                      key={f.friendship_id}
                      className={cn('flex flex-row items-center gap-3 p-3', isMember && 'opacity-60')}
                    >
                      <UserAvatar
                        userId={uid}
                        name={f.display_name}
                        imageUrl={f.avatar_key}
                        className="size-12 shrink-0"
                        fallbackClassName="text-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{f.display_name}</div>
                        {isMember && <div className="truncate text-xs text-muted-foreground">In this league</div>}
                      </div>
                      <div className="shrink-0">
                        {isMember ? (
                          <span className="text-xs font-medium text-muted-foreground">Member</span>
                        ) : isInvited ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <Check className="size-3.5" /> Invited
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => invite.mutate(uid)}
                            disabled={invite.isPending && invite.variables === uid}
                          >
                            Invite
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ExternalInviteDialog
        leagueName={leagueName}
        inviteCode={inviteCode}
        open={extOpen}
        onOpenChange={setExtOpen}
      />
    </>
  );
}

/** The shareable-link invite — for people who aren't your Waygerz friends. */
function ExternalInviteDialog({
  leagueName,
  inviteCode,
  open,
  onOpenChange,
}: {
  leagueName: string;
  inviteCode: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const link = inviteCode ? inviteUrl(inviteCode) : '';

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const share = async () => {
    if (!link) return;
    try {
      const result = await shareLink({
        url: link,
        title: `Join ${leagueName} on Waygerz`,
        text: `You're invited to join ${leagueName} on Waygerz`,
      });
      toast.success(result === 'shared' ? 'Link shared' : 'Link copied — paste into a message');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toast.error(e instanceof Error ? e.message : 'Could not share link');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite by link</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {link ? (
            <>
              <p className="text-sm text-muted-foreground">
                Anyone with this link can join {leagueName}.
              </p>
              <div className="flex items-center rounded-xl border border-border bg-muted/40 p-3">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{link}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => void copy()}>
                  <Copy className="size-4" /> Copy
                </Button>
                <Button className="flex-1" onClick={() => void share()}>
                  <Share2 className="size-4" /> Share
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No invite link for this league yet.</p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
