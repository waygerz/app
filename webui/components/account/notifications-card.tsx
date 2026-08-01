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
import { LegalLink } from '@/components/legal/legal-dialog';
import { cn } from '@/lib/utils';

const PREFS_KEY = ['notification-prefs'] as const;

// Transactional / account categories — on by default (except the digest).
const CATEGORIES: { key: NotificationCategory; title: string; desc: string }[] = [
  { key: 'wager_alert', title: 'Wager alerts', desc: 'Bets proposed, accepted, or settled.' },
  { key: 'league_invite', title: 'League invites', desc: 'When someone invites you to a league.' },
  { key: 'friend_request', title: 'Friend requests', desc: 'New and accepted friend requests.' },
  { key: 'weekly_digest', title: 'Weekly digest', desc: 'A weekly recap of your leagues.' },
];

// Marketing is a separate, optional consent — kept apart from the transactional
// categories above so it's never bundled with account texts.
const MARKETING: { key: NotificationCategory; title: string; desc: string } = {
  key: 'marketing',
  title: 'Promotions & offers',
  desc: 'Occasional promos, news, and special offers.',
};

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
          Choose how you hear about each thing — a text message (SMS) and/or the in-app bell. Turning on{' '}
          <span className="font-medium text-foreground">SMS</span> for a category means you agree to receive
          those specific text messages from Waygerz at your verified number.
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

          {/* Marketing — a distinct, opt-in promotional consent kept separate
              from the transactional categories above so the two are never
              bundled. */}
          <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Promotional · optional
            </span>
            <div className={cn(GRID, paused && 'opacity-50')}>
              <div className="flex flex-col gap-0.5 pr-2">
                <span className="text-sm font-medium text-foreground">{MARKETING.title}</span>
                <span className="text-xs text-muted-foreground">{MARKETING.desc}</span>
              </div>
              {CHANNELS.map((ch) => (
                <div key={ch.key} className="justify-self-center">
                  <Switch
                    size="sm"
                    aria-label={`${MARKETING.title} — ${ch.label}`}
                    checked={!!data?.channels?.[MARKETING.key]?.[ch.key]}
                    disabled={isPending || paused}
                    onCheckedChange={(v) => toggleChannel(MARKETING.key, ch.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* SMS disclosures — required for carrier/toll-free verification. Kept
              directly beneath the SMS toggles so consent + terms sit next to the
              control. */}
          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Waygerz text messages.</span> You’ll only receive
              SMS for the categories you switch on above — each sends the messages described next to it.
              Message frequency varies by your activity. Msg &amp; data rates may apply. Reply{' '}
              <span className="font-medium text-foreground">STOP</span> to opt out or{' '}
              <span className="font-medium text-foreground">HELP</span> for help. See our{' '}
              <LegalLink doc="terms">Terms of Service</LegalLink> and{' '}
              <LegalLink doc="privacy">Privacy Policy</LegalLink>.
            </p>
            <p className="mt-1.5">
              Account security texts (one-time sign-in codes) are always sent to verify it’s you and aren’t
              controlled here.
            </p>
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
