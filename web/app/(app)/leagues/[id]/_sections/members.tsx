'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeague } from '../league-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { leaguesApi, type LeagueMember } from '@/lib/leagues';
import { useAuth } from '@/auth/AuthContext';
import { CenterCard } from '@/components/ui/center-card';
import { SectionTitle } from '@/components/section-title';
import { UserMiniCard } from '@/components/user-mini-card';
import { ListSearch } from '@/components/list-search';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UserPlus, UserCheck, UserMinus, Clock, EllipsisVertical, MessageCircle, Search } from 'lucide-react';
import { friendsApi } from '@/lib/friends';
import { messagingApi } from '@/lib/messaging';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { memberRoleLabel } from './shared';

// ===================== MEMBERS =====================
// Per-member actions menu: commissioners manage roles + transfer + remove;
// moderators can only remove regular members. Consequential actions confirm.
function MemberActionsMenu({
  member, isCommish, canModerate, isFriend, busy, onSetRole, onTransfer, onRemove, onUnfriend,
}: {
  member: LeagueMember;
  isCommish: boolean;
  canModerate: boolean;
  isFriend: boolean;
  busy: boolean;
  onSetRole: (role: 'moderator' | 'member') => void;
  onTransfer: () => void;
  onRemove: () => void;
  onUnfriend: () => void;
}) {
  const [confirming, setConfirming] = useState<'transfer' | 'remove' | 'unfriend' | null>(null);

  const isCommishRow = member.role === 'commissioner';
  const canRemove = isCommish ? !isCommishRow : canModerate && member.role === 'member';
  const showRoleActions = isCommish ? !isCommishRow : canRemove;
  const showMenu = showRoleActions || isFriend;
  if (!showMenu) return null;

  return (
    <>
      {/* modal={false}: without it, the dropdown leaves pointer-events:none on
          <body> when it closes to open the AlertDialog, freezing the page. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="outline" className="size-10 shrink-0" aria-label="Member actions">
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {isCommish && !isCommishRow && (
            <DropdownMenuItem
              disabled={busy}
              onClick={() => onSetRole(member.role === 'moderator' ? 'member' : 'moderator')}
            >
              {member.role === 'moderator' ? 'Remove moderator' : 'Make moderator'}
            </DropdownMenuItem>
          )}
          {isCommish && !isCommishRow && (
            <DropdownMenuItem disabled={busy} onClick={() => setConfirming('transfer')}>
              Transfer commissioner
            </DropdownMenuItem>
          )}
          {isFriend && (
            <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => setConfirming('unfriend')}>
              <UserMinus className="size-4" /> Unfriend
            </DropdownMenuItem>
          )}
          {canRemove && (
            <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => setConfirming('remove')}>
              Remove from league
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => { if (!o) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === 'transfer' ? 'Transfer commissioner?' : confirming === 'unfriend' ? 'Unfriend?' : 'Remove member?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === 'transfer'
                ? `${member.display_name} will become the league commissioner and you'll become a moderator. You can only get it back if they transfer it to you.`
                : confirming === 'unfriend'
                  ? `Remove ${member.display_name} from your friends?`
                  : `Remove ${member.display_name} from this league? They'll lose access to it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming === 'transfer') onTransfer();
                else if (confirming === 'unfriend') onUnfriend();
                else onRemove();
                setConfirming(null);
              }}
            >
              {confirming === 'transfer' ? 'Transfer' : confirming === 'unfriend' ? 'Unfriend' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function LeagueMembers() {
  const lg = useLeague();
  const qc = useQueryClient();
  const { user } = useAuth();
  const router = useRouter();
  const me = String(user?.id ?? '');
  const isCommish = lg.my_role === 'commissioner';
  const canModerate = isCommish || lg.my_role === 'moderator';

  const friendsQ = useQuery({ queryKey: ['friends'], queryFn: friendsApi.list });
  const reqsQ = useQuery({ queryKey: ['friend-requests'], queryFn: friendsApi.requests });
  const friendIds = new Set((friendsQ.data ?? []).map((f) => String(f.user_id)));
  const pendingIds = new Set([
    ...(reqsQ.data?.outgoing ?? []).map((r) => String(r.user_id)),
    ...(reqsQ.data?.incoming ?? []).map((r) => String(r.user_id)),
  ]);

  const onErr = (e: Error) => toast.error(e.message);
  const remove = useMutation({
    mutationFn: (uid: string) => leaguesApi.removeMember(lg.id, uid),
    onSuccess: () => { toast.success('Member removed'); qc.invalidateQueries({ queryKey: ['league', lg.id] }); },
    onError: onErr,
  });
  const setRole = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: 'moderator' | 'member' }) =>
      leaguesApi.setMemberRole(lg.id, uid, role),
    onSuccess: (_d, v) => {
      toast.success(v.role === 'moderator' ? 'Moderator added' : 'Moderator removed');
      qc.invalidateQueries({ queryKey: ['league', lg.id] });
    },
    onError: onErr,
  });
  const transfer = useMutation({
    mutationFn: (uid: string) => leaguesApi.transferCommissioner(lg.id, uid),
    onSuccess: () => { toast.success('Commissioner transferred'); qc.invalidateQueries({ queryKey: ['league', lg.id] }); },
    onError: onErr,
  });
  const addFriend = useMutation({
    mutationFn: (uid: string) => friendsApi.addByUserId(uid),
    onSuccess: () => { toast.success('Friend request sent'); qc.invalidateQueries({ queryKey: ['friend-requests'] }); },
    onError: onErr,
  });
  const openMessage = useMutation({
    mutationFn: (uid: string) => messagingApi.openDirect(uid),
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      router.push('/messages/' + conv.id);
    },
    onError: onErr,
  });
  const removeFriend = useMutation({
    mutationFn: (uid: string) => friendsApi.remove(uid),
    onSuccess: () => { toast.success('Friend removed'); qc.invalidateQueries({ queryKey: ['friends'] }); },
    onError: onErr,
  });

  // Filter is client-side — the full roster already ships in the league payload.
  // Only surface the box once the list is long enough to be worth scanning.
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const members = query
    ? lg.members.filter((m) => m.display_name.toLowerCase().includes(query))
    : lg.members;
  const showSearch = lg.members.length > 8;

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle title={`Members (${lg.members.length})`} />
      {showSearch && <ListSearch value={q} onChange={setQ} placeholder="Search members" />}
      {members.length === 0 ? (
        <CenterCard>
          <Search className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No members match “{q.trim()}”.</p>
        </CenterCard>
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {members.map((m) => {
          const uid = String(m.user_id);
          const isMe = uid === me;
          return (
            <UserMiniCard
              key={m.user_id}
              userId={m.user_id}
              name={m.display_name}
              imageUrl={m.avatar_key}
              badge={isMe ? <Badge size="sm" appearance="light">You</Badge> : null}
              subtitle={memberRoleLabel(m.role)}
              actions={
                !isMe && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={openMessage.isPending}
                      onClick={() => openMessage.mutate(uid)}
                    >
                      <MessageCircle className="size-4" />
                      <span className="hidden sm:inline">Message</span>
                    </Button>
                    {friendIds.has(uid) ? (
                      <Button size="sm" variant="outline" className="text-brand" disabled>
                        <UserCheck className="size-4" />
                        <span className="hidden sm:inline">Friends</span>
                      </Button>
                    ) : pendingIds.has(uid) ? (
                      <Button size="sm" variant="outline" className="text-muted-foreground" disabled>
                        <Clock className="size-4" />
                        <span className="hidden sm:inline">Pending</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-primary"
                        disabled={addFriend.isPending}
                        onClick={() => addFriend.mutate(uid)}
                      >
                        <UserPlus className="size-4" />
                        <span className="hidden sm:inline">Add friend</span>
                      </Button>
                    )}
                    <MemberActionsMenu
                      member={m}
                      isCommish={isCommish}
                      canModerate={canModerate}
                      isFriend={friendIds.has(uid)}
                      busy={remove.isPending || setRole.isPending || transfer.isPending || removeFriend.isPending}
                      onSetRole={(role) => setRole.mutate({ uid, role })}
                      onTransfer={() => transfer.mutate(uid)}
                      onRemove={() => remove.mutate(uid)}
                      onUnfriend={() => removeFriend.mutate(uid)}
                    />
                  </>
                )
              }
            />
          );
        })}
      </div>
      )}
    </div>
  );
}
