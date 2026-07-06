'use client';

import { LogOut, Sun, Moon, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserAvatar } from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MessagesSheet } from '@/components/messages-sheet';
import { NotificationsSheet } from '@/components/notifications-sheet';
import { useTheme } from 'next-themes';
import { useAuth } from '@/auth/AuthContext';

export function HeaderToolbar() {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  return (
    <nav className="flex min-w-0 items-center justify-end gap-1 shrink-0 sm:gap-2.5 lg:w-[200px]">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="text-white/90 hover:text-white"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? <Moon className="size-5" /> : <Sun className="size-5" />}
      </Button>

      {!user ? (
        <Button asChild variant="primary" size="sm">
          <Link href="/login">Log in</Link>
        </Button>
      ) : (
        <>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-white/90 hover:text-white"
            aria-label="Friends"
          >
            <Link href="/friends"><Users className="size-5" /></Link>
          </Button>
          <MessagesSheet />
          <NotificationsSheet />
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer">
              <UserAvatar userId={user.id} name={user.display_name} className="size-8" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" side="bottom" align="end" sideOffset={11}>
              <div className="flex items-center gap-3 px-3 py-2">
                <UserAvatar userId={user.id} name={user.display_name} />
                <div className="flex flex-col items-start">
                  <span className="text-sm font-semibold text-foreground">
                    {user.display_name}
                  </span>
                  <span className="text-xs text-muted-foreground">{user.phone}</span>
                </div>
              </div>

              <DropdownMenuSeparator />

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
        </>
      )}
    </nav>
  );
}
