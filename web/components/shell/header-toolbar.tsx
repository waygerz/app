'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { MessagesSheet } from '@/components/messages-sheet';
import { NotificationsSheet } from '@/components/notifications-sheet';
import { ProfileMenu } from './profile-menu';
import { useAuth } from '@/auth/AuthContext';

export function HeaderToolbar() {
  const { user } = useAuth();

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
            <MessagesSheet />
            <NotificationsSheet />
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
