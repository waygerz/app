'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthContext';
import { ProfileMenu } from './profile-menu';

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
          {/* The account menu, always top right. Messages + Alerts are in the bottom nav. */}
          <ProfileMenu>
            <button type="button" className="flex size-11 cursor-pointer items-center justify-center lg:size-auto" aria-label="Account menu">
              <UserAvatar
                userId={user.id}
                name={user.display_name}
                imageUrl={user.avatar_key}
                className="size-8"
                clickable={false}
              />
            </button>
          </ProfileMenu>
        </>
      )}
    </nav>
  );
}
