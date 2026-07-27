'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellOff } from 'lucide-react';
import {
  notificationsApi,
  type NotificationPreferences,
} from '@/lib/notifications';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const PREFS_KEY = ['notification-prefs'] as const;

export function NotificationsCard() {
  const qc = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: PREFS_KEY,
    queryFn: () => notificationsApi.getPreferences().then((r) => r.preferences),
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) =>
      notificationsApi.updatePreferences(patch).then((r) => r.preferences),
    // Optimistic: flip the switch immediately, roll back if the call fails.
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: PREFS_KEY });
      const prev = qc.getQueryData<NotificationPreferences>(PREFS_KEY);
      if (prev) qc.setQueryData<NotificationPreferences>(PREFS_KEY, { ...prev, ...patch });
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(PREFS_KEY, ctx.prev);
      toast.error("Couldn't save that — try again.");
    },
    onSuccess: (fresh) => qc.setQueryData(PREFS_KEY, fresh),
  });

  const set = (patch: Partial<NotificationPreferences>) => mutation.mutate(patch);
  const paused = data?.opted_out ?? false;

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Notifications</h2>
        <p className="text-xs text-muted-foreground">
          Choose which text alerts you get. You can pause everything at any time.
        </p>
      </div>

      {isError ? (
        <p className="text-sm text-muted-foreground">Couldn’t load your preferences.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          <PrefRow
            id="pref-wager"
            title="Wager alerts"
            desc="Texts when bets are proposed, accepted, or settled."
            checked={!!data?.wager_alerts}
            disabled={isPending || paused}
            onChange={(v) => set({ wager_alerts: v })}
          />
          <PrefRow
            id="pref-digest"
            title="Weekly digest"
            desc="A weekly text recap of your leagues."
            checked={!!data?.weekly_digest}
            disabled={isPending || paused}
            onChange={(v) => set({ weekly_digest: v })}
          />
          <PrefRow
            id="pref-pause"
            title={
              <span className="inline-flex items-center gap-1.5">
                <BellOff className="size-4 text-muted-foreground" />
                Pause all notifications
              </span>
            }
            desc="Silences texts and the in-app bell until you turn it back on."
            checked={paused}
            disabled={isPending}
            onChange={(v) => set({ opted_out: v })}
          />
        </div>
      )}
    </Card>
  );
}

function PrefRow({
  id,
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: React.ReactNode;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', disabled && 'opacity-60')}>
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {title}
        </Label>
        <span className="text-xs text-muted-foreground">{desc}</span>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
