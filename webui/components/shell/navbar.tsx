'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useLayout } from './context';
import { Home, Ticket, Trophy, Users, type LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

const navItems: NavItem[] = [
  { label: 'Leagues', href: '/', icon: Home },
  { label: 'Bets', href: '/bets', icon: Ticket },
  { label: 'Sports', href: '/sports', icon: Trophy },
  { label: 'Friends', href: '/friends', icon: Users },
];

function isItemActive(pathname: string, href: string) {
  // Exact match for root; prefix match for everything else.
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function Navbar({ isVertical = false }: { isVertical?: boolean }) {
  const { isMobile } = useLayout();
  const pathname = usePathname();
  const isVerticalLayout = isVertical || isMobile;

  return (
    <nav
      className={cn(
        'lg:border lg:border-input text-sm text-muted-foreground bg-background rounded-xl gap-2.5 overflow-auto p-5',
        isVerticalLayout ? 'flex flex-col p-2 w-full' : 'inline-flex p-1.5',
      )}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = isItemActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-normal transition-colors text-white/90 text-sm',
              'hover:bg-muted hover:text-foreground',
              isActive && 'bg-white/10 text-foreground font-semibold',
              isVerticalLayout ? 'w-full justify-start' : 'h-[30px]',
            )}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
            {item.badge && (
              <Badge variant="success" size="sm" appearance="outline">
                {item.badge}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
