'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/auth/AuthContext';
import { safeReturnPath } from '@/auth/return-path';
import { PendingLinkBanner } from '@/components/pending-link-banner';
import { formatUsPhone } from '@/lib/phone';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function SignupPage() {
  const { startSignup, verifySignup } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeReturnPath(params.get('next'));

  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [devOtp, setDevOtp] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const code = await startSignup(phone);
      setDevOtp(code);
      if (code) setOtp(code); // mock mode: prefill for a one-click demo
      setStep('verify');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifySignup(phone, otp, pin, displayName);
      router.push(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-4">
      <Card className="w-full max-w-sm gap-5 p-6">
        {step === 'phone' ? (
          <>
            <div>
              <h1 className="text-2xl font-bold text-primary">Join Waygerz</h1>
              <p className="text-sm text-muted-foreground">
                We’ll text you a code (mocked in dev).
              </p>
            </div>
            <PendingLinkBanner returnPath={next} />
            <form onSubmit={onStart} className="flex flex-col gap-3">
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
              </div>
              {error && <div className="text-sm text-destructive">{error}</div>}
              <Button type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send code'}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground">
              Have an account?{' '}
              <Link
                href={`/login?next=${encodeURIComponent(next)}`}
                className="text-primary hover:underline"
              >
                Log in
              </Link>
            </p>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold text-primary">Verify &amp; set up</h1>
              <PendingLinkBanner returnPath={next} />
              {devOtp && (
                <p className="mt-2 rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-1.5 text-xs">
                  Mock OTP (dev only): <strong>{devOtp}</strong>
                </p>
              )}
            </div>
            <form onSubmit={onVerify} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Verification code</Label>
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Display name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Choose a 4-digit PIN</Label>
                <Input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                />
              </div>
              {error && <div className="text-sm text-destructive">{error}</div>}
              <Button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create account'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep('phone')}
              >
                ← Use a different number
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
