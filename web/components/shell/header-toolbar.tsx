'use client';

import Link from 'next/link';
import { Bell, MessageCircle } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthContext';
import { useUnreadMessages } from '@/lib/messaging';
import { useUnreadNotifications } from '@/lib/notifications';
import { ProfileMenu } from './profile-menu';

function IconBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
      {count > 9 ? '9+' : count}
    </span>
  );
}

export function HeaderToolbar() {
  const { user } = useAuth();
  const msgUnread = useUnreadMessages();
  const notifUnread = useUnreadNotifications();

  return (
    <nav className="flex min-w-0 items-center justify-end gap-1 shrink-0 sm:gap-2.5 lg:w-[200px]">
      {!user ? (
        <Button asChild variant="primary" size="sm">
          <Link href="/login">Log in</Link>
        </Button>
      ) : (
        <>
          {/* Messages, Alerts + Profile all live in the bottom nav on mobile; keep them here on desktop. */}
          <div className="hidden items-center gap-1 sm:gap-2.5 lg:flex">
            <Button asChild variant="ghost" size="icon" className="relative text-white/90 hover:text-white">
              <Link href="/messages" aria-label="Messages">
                <MessageCircle className="size-5" />
                <IconBadge count={msgUnread} />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="relative text-white/90 hover:text-white">
              <Link href="/notifications" aria-label="Notifications">
                <Bell className="size-5" />
                <IconBadge count={notifUnread} />
              </Link>
            </Button>
            <ProfileMenu>
              <button type="button" className="cursor-pointer" aria-label="Account menu">
                <UserAvatar
                  userId={user.id}
                  name={user.display_name}
                  imageUrl={user.avatar_key}
                  className="size-8"
                  clickable={false}
                />
              </button>
            </ProfileMenu>
          </div>
        </>
      )}
    </nav>
  );
}
