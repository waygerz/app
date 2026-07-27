'use client';

// Pure context for the app-wide "click a person to see their profile" dialog.
// Kept free of component imports so UserAvatar can consume it without an import
// cycle (the Provider, which renders the dialog, lives in a separate file).
import { createContext, useContext } from 'react';

export interface ProfileTarget {
  userId: string;
  name: string;
  avatarKey?: string | null;
}

export interface ProfileDialogCtx {
  /** The signed-in user's id — avatars for `me` are not made clickable. */
  me: string;
  openProfile: (target: ProfileTarget) => void;
}

export const ProfileDialogContext = createContext<ProfileDialogCtx | null>(null);

/** Null when rendered outside the provider (e.g. public/guest pages). */
export function useProfileDialog(): ProfileDialogCtx | null {
  return useContext(ProfileDialogContext);
}
