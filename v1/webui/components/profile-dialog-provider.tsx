'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  ProfileDialogContext,
  type ProfileTarget,
} from '@/components/profile-dialog-context';
import { UserProfileDialog } from '@/components/user-profile-dialog';

/**
 * Holds the single profile dialog for the whole authed app. Any UserAvatar (or
 * a name button) calls `openProfile` to show a person's details + head-to-head
 * bet history. Opening your own profile is a no-op.
 */
export function ProfileDialogProvider({ me, children }: { me: string; children: ReactNode }) {
  const [target, setTarget] = useState<ProfileTarget | null>(null);
  const [open, setOpen] = useState(false);

  const openProfile = useCallback(
    (t: ProfileTarget) => {
      if (!t.userId || t.userId === me) return;
      setTarget(t);
      setOpen(true);
    },
    [me],
  );

  const value = useMemo(() => ({ me, openProfile }), [me, openProfile]);

  return (
    <ProfileDialogContext.Provider value={value}>
      {children}
      {target && (
        <UserProfileDialog
          userId={target.userId}
          name={target.name}
          avatarKey={target.avatarKey}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </ProfileDialogContext.Provider>
  );
}
