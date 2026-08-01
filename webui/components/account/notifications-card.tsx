'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  // `opted_out` is the App-notifications SMS master: when true, transactional
  // SMS is paused. It does NOT touch the in-app bell or marketing.
  const smsMuted = data?.opted_out ?? false;

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
        <div className="flex flex-col gap-5">
          {/* ===== App notifications (transactional) ===== */}
          <div className="flex flex-col gap-1">
            {/* Master: opting out pauses ALL app SMS (in-app bell stays on). */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex flex-col gap-0.5 pr-2">
                <span className="text-sm font-medium text-foreground">Text me app notifications</span>
                <span className="text-xs text-muted-foreground">
                  Account &amp; bet texts. Turn off to stop all app text messages — the in-app bell still
                  works, and sign-in codes are always sent.
                </span>
              </div>
              <Switch
                aria-label="Text me app notifications"
                checked={!smsMuted}
                disabled={isPending}
                onCheckedChange={(v) => set({ opted_out: !v })}
              />
            </div>

            <div className="mt-2">
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
                  <div key={cat.key} className={cn(GRID, 'py-3')}>
                    <div className="flex flex-col gap-0.5 pr-2">
                      <span className="text-sm font-medium text-foreground">{cat.title}</span>
                      <span className="text-xs text-muted-foreground">{cat.desc}</span>
                    </div>
                    {CHANNELS.map((ch) => {
                      // The master pauses the SMS column only; in-app stays live.
                      const smsOff = ch.key === 'sms' && smsMuted;
                      return (
                        <div key={ch.key} className="justify-self-center">
                          <Switch
                            size="sm"
                            aria-label={`${cat.title} — ${ch.label}`}
                            checked={smsOff ? false : !!data?.channels?.[cat.key]?.[ch.key]}
                            disabled={isPending || smsOff}
                            onCheckedChange={(v) => toggleChannel(cat.key, ch.key, v)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ===== Promotions (marketing) — a SEPARATE opt-in, never affected by
              the app-notifications master above. ===== */}
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Promotional · optional · separate from app notifications
            </span>
            <div className={cn(GRID, 'py-1')}>
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
                    disabled={isPending}
                    onCheckedChange={(v) => toggleChannel(MARKETING.key, ch.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* SMS disclosures — required for carrier/toll-free verification. */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Waygerz text messages.</span> You’ll only receive
              SMS for the options you switch on above — each sends the messages described next to it. Message
              frequency varies by your activity. Msg &amp; data rates may apply. Reply{' '}
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
        </div>
      )}
    </Card>
  );
}
