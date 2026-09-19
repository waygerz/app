'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthContext';
import { ProfileMenu } from './profile-menu';

export function HeaderToolbar() {
  const { user } = useAuth();
  const pathname = usePathname();

  return (
    <nav className="flex min-w-0 items-center justify-end gap-1 shrink-0 sm:gap-2.5 lg:w-[200px]">
      {!user ? (
        <Button asChild variant="primary" size="sm">
          <Link href="/login">Log in</Link>
        </Button>
      ) : (
        <>
          {/* My Leagues: create a league from the top bar. */}
          {pathname === '/' && (
            <Button asChild variant="outline" size="icon" className="size-11 border-white/20 bg-transparent text-white hover:bg-white/10 lg:size-9">
              <Link href="/leagues/new" aria-label="Create league">
                <Plus className="size-5" />
              </Link>
            </Button>
          )}
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
