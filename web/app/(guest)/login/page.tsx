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
import { LEGAL_VERSION, SMS_ACCOUNT_CONSENT, SMS_MARKETING_CONSENT } from '@/components/legal/legal-content';
import { cn } from '@/lib/utils';

// Flow (see the login walkthrough):
//   phone → (existing number) code → logged in
//   phone → (new number) consent → code → name → terms → account created
// A NEW number never gets a text until it opts in on the consent card — the
// one-time code is itself an SMS, so consent must precede it.
type Step = 'phone' | 'consent' | 'code' | 'name' | 'terms';

export default function LoginPage() {
  const { startOtp, verifyOtp, completeProfile } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeReturnPath(params.get('next'));

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [displayName, setDisplayName] = useState('');
  // SMS consent, collected up-front on the consent card (new numbers only).
  // smsAccount is REQUIRED (gates the code send); smsMarketing is optional.
  const [smsAccount, setSmsAccount] = useState(false);
  const [smsMarketing, setSmsMarketing] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const agreedLegal = agreeTerms && agreePrivacy;
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

  function goToCode(devCode?: string) {
    setDevOtp(devCode);
    if (devCode) setOtp(devCode); // testing mode: prefill the revealed code
    setStep('code');
  }

  // Phone step: existing number → code sent now; new number → consent card first.
  const onSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await startOtp(phone);
      if (res.consentRequired) {
        setStep('consent');
        return;
      }
      goToCode(res.devOtp);
    });
  };

  // Consent card (new number): opt in, then the code is sent.
  const onAgreeConsent = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await startOtp(phone, true);
      goToCode(res.devOtp);
    });
  };

  const onVerify = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await verifyOtp(phone, otp);
      if (res.needsProfile) {
        setTicket(res.ticket ?? '');
        setStep('name');
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
        tos_accepted: agreedLegal,
        sms_transactional: smsAccount,
        sms_marketing: smsMarketing,
      });
      router.push(next);
    });
  };

  const subtitle =
    step === 'phone'
      ? 'Sign in or create your account'
      : step === 'code'
        ? 'Check your phone'
        : null;

  return (
    <div className="flex h-dvh w-full flex-col items-center overflow-y-auto p-4 py-8">
      {/* my-auto centers the card when it fits, and collapses to 0 when a step is
          taller than the viewport so it scrolls from the top — never clipped. */}
      <div className="my-auto flex w-full max-w-md flex-col items-center gap-4">
        <Card className="w-full max-w-md gap-6 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/logo.png" alt="Waygerz" className="h-20 w-auto" />
          <h1 className="text-3xl font-bold text-primary">Waygerz</h1>
          {subtitle && <p className="text-base text-foreground">{subtitle}</p>}
        </div>
        <PendingLinkBanner returnPath={next} />

        {step === 'phone' && (
          <form onSubmit={onSendCode} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone" className="text-center text-base">
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
              {busy ? 'Continuing…' : 'Continue'}
            </Button>
            <p className="text-center text-sm leading-relaxed text-foreground">
              We’ll text you a one-time code to sign in — no password needed. New here? This creates your
              account and we’ll confirm your text consent first.
            </p>
          </form>
        )}

        {/* Consent card — NEW numbers only. Carries the phone field + explicit SMS
            opt-in + branding + disclosure on one screen; the code is not sent
            until the required box is checked. */}
        {step === 'consent' && (
          <form onSubmit={onAgreeConsent} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
              <h2 className="text-lg font-semibold text-foreground">Create your account</h2>
              <p className="text-sm text-muted-foreground">
                Agree to receive texts and we’ll send your sign-in code.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="consent-phone" className="text-center text-base">
                Your mobile number
              </Label>
              <Input
                id="consent-phone"
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
            <div className="flex flex-col gap-4 rounded-lg border border-input p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent-sms-account"
                  size="md"
                  checked={smsAccount}
                  onCheckedChange={(v) => setSmsAccount(v === true)}
                  className="mt-0.5"
                />
                <label htmlFor="consent-sms-account" className="text-sm leading-relaxed text-foreground">
                  {SMS_ACCOUNT_CONSENT}
                </label>
              </div>
              <div className="flex items-start gap-3 border-t border-border pt-4">
                <Checkbox
                  id="consent-sms-mkt"
                  size="md"
                  checked={smsMarketing}
                  onCheckedChange={(v) => setSmsMarketing(v === true)}
                  className="mt-0.5"
                />
                <label htmlFor="consent-sms-mkt" className="text-sm leading-relaxed text-foreground">
                  {SMS_MARKETING_CONSENT}
                </label>
              </div>
            </div>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              By continuing you also agree to our <LegalLink doc="terms">Terms</LegalLink> and{' '}
              <LegalLink doc="privacy">Privacy Policy</LegalLink>.
            </p>
            {error && <div className="text-base text-destructive">{error}</div>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-14"
                onClick={() => {
                  setStep('phone');
                  setError(null);
                }}
              >
                ← Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="h-14 flex-1 text-base"
                disabled={busy || !smsAccount || !phone.trim()}
              >
                {busy ? 'Sending…' : 'Agree & text me my code'}
              </Button>
            </div>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={onVerify} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="otp" className="text-center text-base">
                Enter your code
              </Label>
              {phone && (
                <p className="text-center text-sm text-muted-foreground">
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

        {/* New signup, after the code — Step 1 of 2: Name. */}
        {step === 'name' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (displayName.trim()) setStep('terms');
            }}
            className="flex flex-col gap-5"
          >
            <StepProgress current={1} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="display-name" className="text-center text-lg font-semibold text-foreground">
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
                autoFocus
              />
              <span className="text-center text-sm text-muted-foreground">
                This is the name your leaguemates will see.
              </span>
            </div>
            <Button type="submit" size="lg" className="h-14 text-base" disabled={!displayName.trim()}>
              Next
            </Button>
          </form>
        )}

        {/* New signup — Step 2 of 2: Terms & Privacy (required). */}
        {step === 'terms' && (
          <form onSubmit={onCreate} className="flex flex-col gap-5">
            <StepProgress current={2} />
            <div className="flex flex-col gap-1 text-center">
              <h2 className="text-lg font-semibold text-foreground">Agree to continue</h2>
              <p className="text-sm text-muted-foreground">Please accept both to create your account.</p>
            </div>
            {/* Kept as divs (not labels) — a label would toggle the box when
                tapping the Terms / Privacy links. */}
            <div className="flex flex-col gap-4 rounded-lg border border-input p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent-terms"
                  size="md"
                  checked={agreeTerms}
                  onCheckedChange={(v) => setAgreeTerms(v === true)}
                  className="mt-0.5"
                  aria-label="I agree to the Terms of Service"
                />
                <span className="text-sm leading-relaxed text-foreground">
                  I agree to the <LegalLink doc="terms">Terms of Service</LegalLink>.
                </span>
              </div>
              <div className="flex items-start gap-3 border-t border-border pt-4">
                <Checkbox
                  id="consent-privacy"
                  size="md"
                  checked={agreePrivacy}
                  onCheckedChange={(v) => setAgreePrivacy(v === true)}
                  className="mt-0.5"
                  aria-label="I agree to the Privacy Policy"
                />
                <span className="text-sm leading-relaxed text-foreground">
                  I agree to the <LegalLink doc="privacy">Privacy Policy</LegalLink>.
                </span>
              </div>
            </div>
            {error && <div className="text-base text-destructive">{error}</div>}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="lg" className="h-14" onClick={() => setStep('name')}>
                ← Back
              </Button>
              <Button
                type="submit"
                size="lg"
                className="h-14 flex-1 text-base"
                disabled={busy || !displayName.trim() || !agreedLegal}
              >
                {busy ? 'Creating…' : 'Create my account'}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {devOtp && step === 'code' && (
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
    </div>
  );
}

// Step indicator for the post-code signup (name → terms).
function StepProgress({ current }: { current: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Step {current} of 2
      </span>
      <div className="flex items-center gap-1.5" aria-hidden>
        {[1, 2].map((n) => (
          <span
            key={n}
            className={cn(
              'h-1.5 rounded-full transition-all',
              n === current ? 'w-6 bg-primary' : n < current ? 'w-1.5 bg-primary/60' : 'w-1.5 bg-muted',
            )}
          />
        ))}
      </div>
    </div>
  );
}
