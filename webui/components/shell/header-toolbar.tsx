'use client';

import { useRef, useState } from 'react';
import { LogOut, Sun, Moon, Users, ImagePlus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import { imageToWebp } from '@/lib/imageToWebp';
import { mediaApi } from '@/lib/media';

export function HeaderToolbar() {
  const { theme, setTheme } = useTheme();
  const { user, logout, setAvatar } = useAuth();
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setAvatarBusy(true);
    try {
      const webp = await imageToWebp(file, { size: 256, square: true });
      const asset = await mediaApi.upload('avatar', webp);
      await setAvatar(asset.s3_key);
      toast.success('Avatar updated');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onRemoveAvatar() {
    setAvatarBusy(true);
    try {
      await setAvatar(null);
      toast.success('Avatar removed');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

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
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickAvatar}
          />
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer">
              <UserAvatar userId={user.id} name={user.display_name} imageUrl={user.avatar_key} className="size-8" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" side="bottom" align="end" sideOffset={11}>
              <div className="flex items-center gap-3 px-3 py-2">
                <UserAvatar userId={user.id} name={user.display_name} imageUrl={user.avatar_key} />
                <div className="flex flex-col items-start">
                  <span className="text-sm font-semibold text-foreground">
                    {user.display_name}
                  </span>
                  <span className="text-xs text-muted-foreground">{user.phone}</span>
                </div>
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                disabled={avatarBusy}
                onSelect={(e) => { e.preventDefault(); avatarInputRef.current?.click(); }}
              >
                <ImagePlus className="size-4" />
                <span>{avatarBusy ? 'Uploading…' : user.avatar_key ? 'Change avatar' : 'Add avatar'}</span>
              </DropdownMenuItem>
              {user.avatar_key && (
                <DropdownMenuItem disabled={avatarBusy} onSelect={(e) => { e.preventDefault(); void onRemoveAvatar(); }}>
                  <Trash2 className="size-4" />
                  <span>Remove avatar</span>
                </DropdownMenuItem>
              )}

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
