'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import type { BlockingLeague, DeleteAccountError } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const CONFIRM_WORD = 'DELETE';

export function DeleteAccountCard() {
  const { deleteAccount } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  // Non-null when deletion is blocked because the user commissions leagues.
  const [blocking, setBlocking] = useState<BlockingLeague[] | null>(null);

  function reset() {
    setConfirm('');
    setBlocking(null);
  }

  async function onConfirm() {
    setBusy(true);
    try {
      await deleteAccount();
      // Cookies are cleared server-side; go to the marketing root. The proxy
      // rewrites '/' → '/welcome' now that no session cookie remains.
      toast.success('Your account has been deleted');
      router.push('/');
    } catch (e) {
      const err = e as DeleteAccountError;
      if (err.status === 409 && err.data?.leagues?.length) {
        setBlocking(err.data.leagues);
      } else {
        toast.error(err.message || 'Could not delete your account');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-4 border-destructive/30 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-destructive">Delete account</h2>
        <p className="text-xs text-muted-foreground">
          Permanently deletes your account and personal data. Any active bets are
          voided and stakes returned. This can’t be undone.
        </p>
      </div>
      <Button
        variant="destructive"
        size="lg"
        className="h-11 self-start"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Delete account
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return; // don't let a tap-outside cancel mid-delete
          setOpen(o);
          if (!o) reset();
        }}
      >
        <AlertDialogContent>
          {blocking ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Transfer or close your leagues first</AlertDialogTitle>
                <AlertDialogDescription>
                  You’re the commissioner of{' '}
                  {blocking.length === 1 ? 'a league' : `${blocking.length} leagues`}. Hand
                  the commissioner role to another member, or archive the league, then delete
                  your account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="flex flex-col gap-2">
                {blocking.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-foreground">{l.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.member_count} member{l.member_count === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
              <AlertDialogFooter>
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                >
                  Close
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <TriangleAlert className="size-5" />
                  Delete your account?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes your account and personal data and signs you out
                  on every device. Active bets are voided and stakes returned. Your messages
                  and past bets stay in other members’ history, shown as “Deleted user.” This
                  can’t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-2.5">
                <Label htmlFor="confirm-delete">
                  Type <span className="font-semibold text-foreground">{CONFIRM_WORD}</span> to
                  confirm
                </Label>
                <Input
                  id="confirm-delete"
                  variant="lg"
                  className="h-12 text-base"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={CONFIRM_WORD}
                  disabled={busy}
                />
              </div>
              <AlertDialogFooter>
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={busy}
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="h-11"
                  disabled={busy || confirm.trim().toUpperCase() !== CONFIRM_WORD}
                  onClick={onConfirm}
                >
                  {busy ? 'Deleting…' : 'Delete account'}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
