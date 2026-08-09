'use client';

import { ReactNode } from 'react';
import { LogOut, Sun, Moon, Users, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { UserAvatar } from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/auth/AuthContext';

/**
 * The account menu (identity, Account, Friends, theme, sign out). Shared by the
 * desktop header toolbar and the mobile bottom nav; pass the trigger as
 * `children`. Radix flips the menu upward when anchored to the bottom bar.
 */
export function ProfileMenu({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" side="top" align="end" sideOffset={11}>
        <div className="flex items-center gap-3 px-3 py-2">
          <UserAvatar userId={user.id} name={user.display_name} imageUrl={user.avatar_key} />
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold text-foreground">{user.display_name}</span>
            <span className="text-xs text-muted-foreground">{user.phone}</span>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound className="size-4" />
            <span>Account</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/friends">
            <Users className="size-4" />
            <span>Friends</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={toggleTheme}>
          {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
          <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => {
            void logout().then(() => router.push('/'));
          }}
        >
          <LogOut />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
