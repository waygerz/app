'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Ticket, Bell, type LucideIcon } from 'lucide-react';
import { NotificationsSheet } from '@/components/notifications-sheet';
import { UserAvatar } from '@/components/user-avatar';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/utils';
import { ProfileMenu } from './profile-menu';

// Persistent mobile tab bar (hidden at lg+). Mirrors the native app's tabs so
// web + mobile feel like one product. "Alerts" and "Profile" reuse the existing
// notifications sheet + account menu via their trigger slots — one instance
// each, no duplicated queries. Sits above the home indicator (safe-area).

const tabBase =
  'flex flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1 min-h-14 text-[11px] font-medium';

function TabInner({
  icon: Icon,
  label,
  active,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
}) {
  return (
    <>
      <span className="relative">
        <Icon className={cn('size-6', active ? 'text-primary' : 'text-muted-foreground')} />
        {badge != null && badge > 0 && (
          <span className="absolute -end-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span className={active ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  if (!user) return null;

  const isLeagues = pathname === '/' || pathname.startsWith('/leagues');
  const isBets = pathname.startsWith('/bets');

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <Link href="/" className={tabBase} aria-current={isLeagues ? 'page' : undefined}>
        <TabInner icon={Home} label="Leagues" active={isLeagues} />
      </Link>

      <Link href="/bets" className={tabBase} aria-current={isBets ? 'page' : undefined}>
        <TabInner icon={Ticket} label="Bets" active={isBets} />
      </Link>

      <NotificationsSheet
        renderTrigger={(unread) => (
          <button type="button" className={tabBase} aria-label="Alerts">
            <TabInner icon={Bell} label="Alerts" badge={unread} />
          </button>
        )}
      />

      <ProfileMenu>
        <button type="button" className={tabBase} aria-label="Profile">
          <UserAvatar
            userId={user.id}
            name={user.display_name}
            imageUrl={user.avatar_key}
            className="size-6"
            clickable={false}
          />
          <span className="text-muted-foreground">Profile</span>
        </button>
      </ProfileMenu>
    </nav>
  );
}
