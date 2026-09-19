'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLeague } from '../league-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { leaguesApi, type LeagueMember } from '@/lib/leagues';
import { useAuth } from '@/auth/AuthContext';
import { CenterCard } from '@/components/ui/center-card';
import { SectionTitle } from '@/components/section-title';
import { UserAvatar } from '@/components/user-avatar';
import { useProfileDialog } from '@/components/profile-dialog-context';
import { ListSearch } from '@/components/list-search';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
import { UserPlus, UserMinus, Clock, Check, EllipsisVertical, MessageCircle, Search } from 'lucide-react';
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

// Friend status badges the avatar's corner (blue check / grey clock), matching
// the confirm badge on the Standings row. "Add" is the only tappable state —
// unfriending stays behind the ⋮ menu's confirm dialog, since it's the more
// consequential direction.
function FriendBadge({ state, onAdd, pending }: { state: 'friend' | 'pending' | 'add'; onAdd: () => void; pending: boolean }) {
  if (state === 'friend') {
    return (
      <span className="absolute -end-1 -bottom-1 flex size-[17px] items-center justify-center rounded-full bg-blue-500 text-white ring-2 ring-card" title="Friends" aria-label="Friends">
        <Check className="size-2.5" />
      </span>
    );
  }
  if (state === 'pending') {
    return (
      <span className="absolute -end-1 -bottom-1 flex size-[17px] items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-card" title="Friend request pending" aria-label="Friend request pending">
        <Clock className="size-2.5" />
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onAdd}
      aria-label="Add friend"
      title="Add friend"
      className="absolute -end-1 -bottom-1 flex size-[17px] items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card"
    >
      <UserPlus className="size-2.5" />
    </button>
  );
}

// A member row at the Standings row's size (40px avatar, same card padding):
// friend status badges the avatar's corner, name + role, then Message and the
// ⋮ menu as two small icon buttons. Tapping the name opens their profile.
function MemberRow({
  member, isMe, friendState, onAddFriend, addPending, onMessage, messagePending, menu,
}: {
  member: LeagueMember;
  isMe: boolean;
  friendState: 'friend' | 'pending' | 'add';
  onAddFriend: () => void;
  addPending: boolean;
  onMessage: () => void;
  messagePending: boolean;
  menu: ReactNode;
}) {
  const profile = useProfileDialog();
  const canOpen = !!profile && !isMe;
  const name = (
    <span className="min-w-0 truncate text-sm font-semibold text-foreground">{member.display_name}</span>
  );

  return (
    <Card className="flex-row items-center gap-2.5 p-2.5">
      <div className="relative shrink-0">
        <UserAvatar userId={member.user_id} name={member.display_name} imageUrl={member.avatar_key} className="size-10" clickable={false} />
        {!isMe && <FriendBadge state={friendState} onAdd={onAddFriend} pending={addPending} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {canOpen ? (
            <button
              type="button"
              onClick={() => profile?.openProfile({ userId: member.user_id, name: member.display_name, avatarKey: member.avatar_key })}
              className={cn('min-w-0 truncate rounded text-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:underline')}
            >
              {member.display_name}
            </button>
          ) : name}
          {isMe && <Badge size="sm" appearance="light">You</Badge>}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{memberRoleLabel(member.role)}</p>
      </div>
      {!isMe && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="icon" variant="outline" aria-label="Message" disabled={messagePending} onClick={onMessage}>
            <MessageCircle className="size-4" />
          </Button>
          {menu}
        </div>
      )}
    </Card>
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
      <div className="flex flex-col gap-2.5">
        {members.map((m) => {
          const uid = String(m.user_id);
          const isMe = uid === me;
          const friendState: 'friend' | 'pending' | 'add' = friendIds.has(uid) ? 'friend' : pendingIds.has(uid) ? 'pending' : 'add';
          return (
            <MemberRow
              key={m.user_id}
              member={m}
              isMe={isMe}
              friendState={friendState}
              onAddFriend={() => addFriend.mutate(uid)}
              addPending={addFriend.isPending}
              onMessage={() => openMessage.mutate(uid)}
              messagePending={openMessage.isPending}
              menu={
                !isMe && (
                  <MemberActionsMenu
                    member={m}
                    isCommish={isCommish}
                    canModerate={canModerate}
                    isFriend={friendState === 'friend'}
                    busy={remove.isPending || setRole.isPending || transfer.isPending || removeFriend.isPending}
                    onSetRole={(role) => setRole.mutate({ uid, role })}
                    onTransfer={() => transfer.mutate(uid)}
                    onRemove={() => remove.mutate(uid)}
                    onUnfriend={() => removeFriend.mutate(uid)}
                  />
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
