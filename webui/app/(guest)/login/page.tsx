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

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeReturnPath(params.get('next'));

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(phone, pin);
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
        <div>
          <h1 className="text-2xl font-bold text-primary">Waygerz</h1>
          <p className="text-sm text-muted-foreground">Play-money bets with friends.</p>
        </div>
        <PendingLinkBanner returnPath={next} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
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
          <div className="flex flex-col gap-1.5">
            <Label>4-digit PIN</Label>
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
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">
          New here?{' '}
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
}
