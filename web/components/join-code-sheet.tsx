'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inviteCodeFrom } from '@/lib/leagues';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';

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
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="pb-[env(safe-area-inset-bottom)]">
        <form onSubmit={submit} className="flex flex-col gap-4 px-4 pb-6 pt-4">
          <div className="flex flex-col gap-1">
            <DrawerTitle className="text-lg font-bold">Join with code</DrawerTitle>
            <DrawerDescription>Enter the code or paste the invite link a friend sent you.</DrawerDescription>
          </div>
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
      </DrawerContent>
    </Drawer>
  );
}
