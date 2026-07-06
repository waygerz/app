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
      await completeProfile(ticket, displayName);
      router.push(next);
    });
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-4">
      <Card className="w-full max-w-sm gap-5 p-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">Waygerz</h1>
          <p className="text-sm text-muted-foreground">Play-money bets with friends.</p>
        </div>
        <PendingLinkBanner returnPath={next} />

        {step === 'phone' && (
          <form onSubmit={onSendCode} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Phone number</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(formatUsPhone(e.target.value))}
                placeholder="(904) 555-1234"
                autoComplete="tel"
                inputMode="tel"
                maxLength={14}
              />
              <span className="text-xs text-muted-foreground">
                We’ll text you a one-time code to sign in or create your account.
              </span>
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" disabled={busy || !phone.trim()}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
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
              {devOtp && (
                <p className="mt-1 rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-1.5 text-xs">
                  Testing code (no SMS yet): <strong>{devOtp}</strong>
                </p>
              )}
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
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" disabled={busy || !displayName.trim()}>
              {busy ? 'Creating…' : 'Create account'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
