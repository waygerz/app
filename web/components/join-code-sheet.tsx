'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inviteCodeFrom } from '@/lib/leagues';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppSheet } from '@/components/ui/app-sheet';

/** "Join with code": type or paste an invite code or link, then open it at
 * /c/<code> — the same page a shared link lands on (league or bet). */
export function JoinCodeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const code = inviteCodeFrom(text);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    onOpenChange(false);
    setText('');
    router.push(`/c/${encodeURIComponent(code)}`);
  };

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Join with code"
      description="Enter the code or paste the invite link a friend sent you."
    >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Code or invite link"
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="Invite code or link"
          />
          <Button type="submit" disabled={!code}>Continue</Button>
        </form>
    </AppSheet>
  );
}
