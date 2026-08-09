'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/auth/AuthContext';
import { safeReturnPath } from '@/auth/return-path';
import { PendingLinkBanner } from '@/components/pending-link-banner';
import { formatUsPhone } from '@/lib/phone';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { LegalLink } from '@/components/legal/legal-dialog';
import { LEGAL_VERSION, SMS_TRANSACTIONAL_CONSENT, SMS_MARKETING_CONSENT } from '@/components/legal/legal-content';

type Step = 'phone' | 'code' | 'profile';

export default function LoginPage() {
  const { startOtp, verifyOtp, completeProfile } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeReturnPath(params.get('next'));

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [agreeTos, setAgreeTos] = useState(false);
  const [smsTx, setSmsTx] = useState(false);
  const [smsMkt, setSmsMkt] = useState(false);
  const [ticket, setTicket] = useState('');
  const [devOtp, setDevOtp] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const onSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const code = await startOtp(phone);
      setDevOtp(code);
      if (code) setOtp(code); // testing mode: prefill the revealed code
      setStep('code');
    });
  };

  const onVerify = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await verifyOtp(phone, otp);
      if (res.needsProfile) {
        setTicket(res.ticket ?? '');
        setStep('profile');
      } else {
        router.push(next);
      }
    });
  };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await completeProfile(ticket, displayName, {
        tos_version: LEGAL_VERSION,
        tos_accepted: agreeTos,
        sms_transactional: smsTx,
        sms_marketing: smsMkt,
      });
      router.push(next);
    });
  };

  const subtitle =
    step === 'phone'
      ? 'Sign in or create your account'
      : step === 'code'
        ? 'Check your phone'
        : 'One last thing';

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-md gap-6 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/logo.png" alt="Waygerz" className="h-20 w-auto" />
          <h1 className="text-3xl font-bold text-primary">Waygerz</h1>
          <p className="text-base text-foreground">{subtitle}</p>
        </div>
        <PendingLinkBanner returnPath={next} />

        {step === 'phone' && (
          <form onSubmit={onSendCode} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone" className="text-base">
                Phone number
              </Label>
              <Input
                id="phone"
                variant="lg"
                className="h-14 text-lg"
                value={phone}
                onChange={(e) => setPhone(formatUsPhone(e.target.value))}
                placeholder="(904) 555-1234"
                autoComplete="tel"
                inputMode="tel"
                maxLength={14}
              />
            </div>
            {error && <div className="text-base text-destructive">{error}</div>}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="h-14 text-base"
              disabled={busy || !phone.trim()}
            >
              {busy ? 'Sending…' : 'Text me a code'}
            </Button>
            <p className="text-center text-sm leading-relaxed text-muted-foreground">
              We’ll text you a one-time code to sign in — no password needed. New here? This creates
              your account. Message and data rates may apply. By continuing you agree to our{' '}
              <LegalLink doc="terms">Terms</LegalLink> and{' '}
              <LegalLink doc="privacy">Privacy Policy</LegalLink>.
            </p>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={onVerify} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="otp" className="text-base">
                Enter your code
              </Label>
              {phone && (
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to <span className="font-medium text-foreground">{phone}</span>.
                </p>
              )}
              <Input
                id="otp"
                variant="lg"
                className="h-16 text-center text-3xl tracking-[0.5em]"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
              />
            </div>
            {error && <div className="text-base text-destructive">{error}</div>}
            <Button type="submit" size="lg" className="h-14 text-base" disabled={busy || !otp.trim()}>
              {busy ? 'Verifying…' : 'Continue'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-12 text-base"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setDevOtp(undefined);
                setError(null);
              }}
            >
              ← Use a different number
            </Button>
          </form>
        )}

        {step === 'profile' && (
          <form onSubmit={onCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="display-name" className="text-base">
                What should we call you?
              </Label>
              <Input
                id="display-name"
                variant="lg"
                className="h-14 text-lg"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex"
                autoComplete="nickname"
                maxLength={64}
              />
              <span className="text-sm text-muted-foreground">
                This is the name your leaguemates will see.
              </span>
            </div>

            <div className="flex flex-col gap-4 rounded-lg border border-input p-4">
              {/* Required: the legal agreement. Kept as a span (not a label) because it
                  wraps the Terms/Privacy links — a label would toggle the box on link tap. */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent-tos"
                  size="md"
                  checked={agreeTos}
                  onCheckedChange={(v) => setAgreeTos(v === true)}
                  className="mt-0.5"
                  aria-label="I agree to the Terms of Service and Privacy Policy"
                />
                <span className="text-sm leading-relaxed text-foreground">
                  I agree to the <LegalLink doc="terms">Terms of Service</LegalLink> and{' '}
                  <LegalLink doc="privacy">Privacy Policy</LegalLink>.
                </span>
              </div>

              {/* Optional, and clearly separate from the agreement above: text-alert
                  opt-ins. Neither is required to create or use the account. */}
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    Text messages (optional)
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    These are separate from the agreement above — you can create and use your account
                    without them, and sign-in codes are sent either way.
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent-sms-tx"
                    size="md"
                    checked={smsTx}
                    onCheckedChange={(v) => setSmsTx(v === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="consent-sms-tx" className="text-sm leading-relaxed text-muted-foreground">
                    {SMS_TRANSACTIONAL_CONSENT} <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent-sms-mkt"
                    size="md"
                    checked={smsMkt}
                    onCheckedChange={(v) => setSmsMkt(v === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="consent-sms-mkt" className="text-sm leading-relaxed text-muted-foreground">
                    {SMS_MARKETING_CONSENT} <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                </div>
              </div>
            </div>

            {error && <div className="text-base text-destructive">{error}</div>}
            <Button
              type="submit"
              size="lg"
              className="h-14 text-base"
              disabled={busy || !displayName.trim() || !agreeTos}
            >
              {busy ? 'Creating…' : 'Create my account'}
            </Button>
          </form>
        )}
      </Card>

      {devOtp && (
        <div className="w-full max-w-md rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4 text-center">
          <p className="text-base text-foreground">
            Testing code: <strong className="text-lg tracking-widest">{devOtp}</strong>
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Temporary — SMS delivery isn’t set up yet, so your one-time code shows here instead of a text message.
          </p>
        </div>
      )}
    </div>
  );
}
