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

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-sm gap-5 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/logo.png" alt="Waygerz" className="h-20 w-auto" />
          <h1 className="text-2xl font-bold text-primary">Waygerz</h1>
        </div>
        <PendingLinkBanner returnPath={next} />

        {step === 'phone' && (
          <form onSubmit={onSendCode} className="flex flex-col gap-3">
            <Input
              value={phone}
              onChange={(e) => setPhone(formatUsPhone(e.target.value))}
              placeholder="(904) 555-1234"
              autoComplete="tel"
              inputMode="tel"
              maxLength={14}
            />
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" variant="primary" disabled={busy || !phone.trim()}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
            <span className="text-center text-xs text-muted-foreground">
              We’ll text you a one-time code to sign in or create your account.
            </span>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={onVerify} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Enter the code</Label>
              <Input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" disabled={busy || !otp.trim()}>
              {busy ? 'Verifying…' : 'Continue'}
            </Button>
            <Button
              type="button"
              variant="ghost"
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
          <form onSubmit={onCreate} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Choose a display name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex"
                autoComplete="nickname"
                maxLength={64}
              />
              <span className="text-xs text-muted-foreground">
                This is a new number — pick a name to finish setting up.
              </span>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-input p-3">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="consent-tos"
                  size="sm"
                  checked={agreeTos}
                  onCheckedChange={(v) => setAgreeTos(v === true)}
                  className="mt-0.5"
                  aria-label="I agree to the Terms of Service and Privacy Policy"
                />
                <span className="text-xs leading-relaxed text-muted-foreground">
                  I agree to the <LegalLink doc="terms">Terms of Service</LegalLink> and{' '}
                  <LegalLink doc="privacy">Privacy Policy</LegalLink>.
                </span>
              </div>

              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="consent-sms-tx"
                  size="sm"
                  checked={smsTx}
                  onCheckedChange={(v) => setSmsTx(v === true)}
                  className="mt-0.5"
                />
                <label htmlFor="consent-sms-tx" className="text-xs leading-relaxed text-muted-foreground">
                  {SMS_TRANSACTIONAL_CONSENT}
                </label>
              </div>

              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="consent-sms-mkt"
                  size="sm"
                  checked={smsMkt}
                  onCheckedChange={(v) => setSmsMkt(v === true)}
                  className="mt-0.5"
                />
                <label htmlFor="consent-sms-mkt" className="text-xs leading-relaxed text-muted-foreground">
                  {SMS_MARKETING_CONSENT} <span className="text-muted-foreground/60">(optional)</span>
                </label>
              </div>
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" disabled={busy || !displayName.trim() || !agreeTos || !smsTx}>
              {busy ? 'Creating…' : 'Create account'}
            </Button>
          </form>
        )}
      </Card>

      {devOtp && (
        <div className="w-full max-w-sm rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4 text-center">
          <p className="text-sm text-foreground">
            Testing code: <strong className="text-base tracking-widest">{devOtp}</strong>
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Temporary — SMS delivery isn’t set up yet, so your one-time code shows here instead of a text message.
          </p>
        </div>
      )}
    </div>
  );
}
