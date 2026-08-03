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
import { SMS_TRANSACTIONAL_CONSENT, SMS_MARKETING_CONSENT } from '@/components/legal/legal-content';
import { cn } from '@/lib/utils';

const PREFS_KEY = ['notification-prefs'] as const;

// Transactional / account categories — on by default (except the digest).
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

// Shared prefs read + optimistic write, used by both cards (they hit the same
// query key, so TanStack Query dedupes the fetch and shares the cache).
function useNotifPrefs() {
  const qc = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: PREFS_KEY,
    queryFn: () => notificationsApi.getPreferences().then((r) => r.preferences),
  });

  const mutation = useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) =>
      notificationsApi.updatePreferences(patch).then((r) => r.preferences),
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
    const channels = { [cat]: { [ch]: v } } as NonNullable<NotificationPreferencesPatch['channels']>;
    set({ channels });
  };

  return { data, isPending, isError, set, toggleChannel };
}

// The "Allow SMS" master switch plus its required carrier / toll-free
// disclosures, together in one bordered box (switch on top, fine print below
// the divider).
function SmsCard({
  desc,
  checked,
  disabled,
  onChange,
  ariaLabel,
  variant,
}: {
  desc: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  variant: 'notifications' | 'promotions';
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-4 bg-muted/20 p-3">
        <div className="flex flex-col gap-0.5 pr-2">
          <span className="text-sm font-medium text-foreground">Allow SMS</span>
          <span className="text-xs text-muted-foreground">{desc}</span>
        </div>
        <Switch aria-label={ariaLabel} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      </div>
      <div className="border-t border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <p>
          {variant === 'promotions' ? SMS_MARKETING_CONSENT : SMS_TRANSACTIONAL_CONSENT} See our{' '}
          <LegalLink doc="terms">Terms of Service</LegalLink> and{' '}
          <LegalLink doc="privacy">Privacy Policy</LegalLink>.
        </p>
        {variant === 'notifications' && (
          <p className="mt-1.5">
            Account security texts (one-time sign-in codes) are always sent to verify it’s you and aren’t
            controlled here.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Card 1: app notifications (transactional) ────────────────────────────────
export function NotificationsCard() {
  const { data, isPending, isError, set, toggleChannel } = useNotifPrefs();
  // `opted_out` is the Allow-SMS master: when true, transactional SMS is paused.
  const smsMuted = data?.opted_out ?? false;

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Notifications</h2>
        <p className="text-xs text-muted-foreground">
          How you hear about app activity — bets, invites, friends, and your weekly recap.
        </p>
      </div>

      <SmsCard
        variant="notifications"
        ariaLabel="Allow app notification SMS"
        desc="Text me app notifications. Off = no app texts — the in-app bell still works, and sign-in codes are always sent."
        checked={!smsMuted}
        disabled={isPending}
        onChange={(v) => set({ opted_out: !v })}
      />

      {isError ? (
        <p className="text-sm text-muted-foreground">Couldn’t load your preferences.</p>
      ) : (
        <div>
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
              <div key={cat.key} className={cn(GRID, 'py-3')}>
                <div className="flex flex-col gap-0.5 pr-2">
                  <span className="text-sm font-medium text-foreground">{cat.title}</span>
                  <span className="text-xs text-muted-foreground">{cat.desc}</span>
                </div>
                {CHANNELS.map((ch) => {
                  // The Allow-SMS master pauses the SMS column only; in-app stays live.
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
      )}
    </Card>
  );
}

// ── Card 2: promotions (marketing) — fully independent of the card above ─────
export function PromotionsCard() {
  const { data, isPending, isError, toggleChannel } = useNotifPrefs();
  const promoSms = !!data?.channels?.marketing?.sms;

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Promotions</h2>
        <p className="text-xs text-muted-foreground">
          Occasional promos, news, and offers — separate from your notifications, and never turned on or off
          by them.
        </p>
      </div>

      <SmsCard
        variant="promotions"
        ariaLabel="Allow promotional SMS"
        desc="Text me promotions and special offers."
        checked={promoSms}
        disabled={isPending}
        onChange={(v) => toggleChannel('marketing', 'sms', v)}
      />

      {isError ? (
        <p className="text-sm text-muted-foreground">Couldn’t load your preferences.</p>
      ) : (
        <div className="flex items-center justify-between gap-4 py-1">
          <div className="flex flex-col gap-0.5 pr-2">
            <span className="text-sm font-medium text-foreground">Show in the app</span>
            <span className="text-xs text-muted-foreground">
              Also show promotions and offers in your in-app bell.
            </span>
          </div>
          <Switch
            size="sm"
            aria-label="Show promotions in-app"
            checked={!!data?.channels?.marketing?.inapp}
            disabled={isPending}
            onCheckedChange={(v) => toggleChannel('marketing', 'inapp', v)}
          />
        </div>
      )}
    </Card>
  );
}
