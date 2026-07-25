'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { notificationsApi, type FeedNotification } from '@/lib/notifications';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/utils';

// A left-edge accent per category so the list triages at a glance.
const ACCENT: Record<string, string> = {
  wager_alert: 'border-s-primary',
  league_invite: 'border-s-brand',
  friend_request: 'border-s-[var(--color-violet-500,var(--color-primary))]',
  weekly_digest: 'border-s-[var(--color-yellow-500,var(--color-primary))]',
};

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsSheet() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // The unified server feed: everything that fanned out to a notification (and,
  // where applicable, an SMS) lands here.
  const feedQ = useQuery({
    queryKey: ['notifications-feed'],
    queryFn: () => notificationsApi.list(50),
    enabled: !!user,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  const items = feedQ.data?.notifications ?? [];
  const unread = feedQ.data?.unread ?? 0;

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-feed'] }),
  });

  // Opening an item marks it read and jumps to where the live action lives.
  const openItem = (n: FeedNotification) => {
    if (!n.read) markRead.mutate([n.id]);
    if (n.deep_link) {
      setOpen(false);
      router.push(n.deep_link);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-white/90 hover:text-white"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      {/* w-full on mobile; the variant's sm:max-w-sm keeps it narrow on desktop. */}
      <SheetContent side="right" className="w-full gap-0 p-0">
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b border-border p-4">
          <SheetTitle>Notifications</SheetTitle>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(undefined)}
            >
              Mark all read
            </Button>
          )}
        </SheetHeader>
        <SheetBody className="p-0">
          <ScrollArea className="h-[calc(100vh-4.5rem)]">
            {feedQ.isLoading ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </p>
            ) : (
              <div className="flex flex-col">
                {items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      'flex items-start gap-2.5 border-s-2 border-b border-b-border px-4 py-3 text-left transition-colors hover:bg-muted/40',
                      ACCENT[n.category] ?? 'border-s-border',
                      !n.read && 'bg-primary/[0.04]',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        n.read ? 'bg-transparent' : 'bg-primary',
                      )}
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className={cn('text-sm text-foreground', !n.read && 'font-medium')}>{n.title}</div>
                      {n.body && n.body !== n.title && (
                        <div className="text-xs text-muted-foreground">{n.body}</div>
                      )}
                      <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
