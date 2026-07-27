'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellOff } from 'lucide-react';
import {
  notificationsApi,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferences,
  type NotificationPreferencesPatch,
} from '@/lib/notifications';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const PREFS_KEY = ['notification-prefs'] as const;

const CATEGORIES: { key: NotificationCategory; title: string; desc: string }[] = [
  { key: 'wager_alert', title: 'Wager alerts', desc: 'Bets proposed, accepted, or settled.' },
  { key: 'league_invite', title: 'League invites', desc: 'When someone invites you to a league.' },
  { key: 'friend_request', title: 'Friend requests', desc: 'New and accepted friend requests.' },
  { key: 'weekly_digest', title: 'Weekly digest', desc: 'A weekly recap of your leagues.' },
];

const CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: 'sms', label: 'SMS' },
  { key: 'inapp', label: 'In-app' },
];

const GRID = 'grid grid-cols-[1fr_3rem_3rem] items-center gap-x-3 sm:grid-cols-[1fr_4rem_4rem]';

function applyPatch(
  prev: NotificationPreferences,
  patch: NotificationPreferencesPatch,
): NotificationPreferences {
  const next: NotificationPreferences = { ...prev, channels: { ...prev.channels } };
  if (patch.opted_out !== undefined) next.opted_out = patch.opted_out;
  for (const [cat, chans] of Object.entries(patch.channels ?? {})) {
    next.channels[cat as NotificationCategory] = {
      ...next.channels[cat as NotificationCategory],
      ...chans,
    };
  }
  return next;
}

export function NotificationsCard() {
  const qc = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: PREFS_KEY,
    queryFn: () => notificationsApi.getPreferences().then((r) => r.preferences),
  });

  const mutation = useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) =>
      notificationsApi.updatePreferences(patch).then((r) => r.preferences),
    // Optimistic: flip the switch immediately, roll back if the call fails.
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: PREFS_KEY });
      const prev = qc.getQueryData<NotificationPreferences>(PREFS_KEY);
      if (prev) qc.setQueryData<NotificationPreferences>(PREFS_KEY, applyPatch(prev, patch));
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(PREFS_KEY, ctx.prev);
      toast.error("Couldn't save that — try again.");
    },
    onSuccess: (fresh) => qc.setQueryData(PREFS_KEY, fresh),
  });

  const set = (patch: NotificationPreferencesPatch) => mutation.mutate(patch);
  const toggleChannel = (cat: NotificationCategory, ch: NotificationChannel, v: boolean) => {
    // cat/ch are typed literals; cast avoids computed-key inference widening to a string index.
    const channels = { [cat]: { [ch]: v } } as NonNullable<NotificationPreferencesPatch['channels']>;
    set({ channels });
  };
  const paused = data?.opted_out ?? false;

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Notifications</h2>
        <p className="text-xs text-muted-foreground">
          Pick how you hear about each thing — a text (SMS) and/or the in-app bell.
        </p>
      </div>

      {isError ? (
        <p className="text-sm text-muted-foreground">Couldn’t load your preferences.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Column headers */}
          <div className={cn(GRID, 'pb-1')}>
            <span />
            {CHANNELS.map((c) => (
              <span
                key={c.key}
                className="justify-self-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {c.label}
              </span>
            ))}
          </div>

          <div className="flex flex-col divide-y divide-border">
            {CATEGORIES.map((cat) => (
              <div key={cat.key} className={cn(GRID, 'py-3', paused && 'opacity-50')}>
                <div className="flex flex-col gap-0.5 pr-2">
                  <span className="text-sm font-medium text-foreground">{cat.title}</span>
                  <span className="text-xs text-muted-foreground">{cat.desc}</span>
                </div>
                {CHANNELS.map((ch) => (
                  <div key={ch.key} className="justify-self-center">
                    <Switch
                      size="sm"
                      aria-label={`${cat.title} — ${ch.label}`}
                      checked={!!data?.channels?.[cat.key]?.[ch.key]}
                      disabled={isPending || paused}
                      onCheckedChange={(v) => toggleChannel(cat.key, ch.key, v)}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Global pause */}
          <div className="mt-2 flex items-center justify-between gap-4 border-t border-border pt-4">
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                <BellOff className="size-4 text-muted-foreground" />
                Pause all notifications
              </span>
              <span className="text-xs text-muted-foreground">
                Silences every text and the in-app bell until you turn it back on.
              </span>
            </div>
            <Switch
              aria-label="Pause all notifications"
              checked={paused}
              disabled={isPending}
              onCheckedChange={(v) => set({ opted_out: v })}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
