'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { authApi, tryRefreshSession, type AuthUser, type SignupConsent } from '@/lib/auth';
import { usersApi } from '@/lib/users';
import { hasSessionMarker } from '@/lib/session';

/** Merge the profile (display name, avatar, favorites) from the users service
 *  onto the credentials object from auth. If the profile fetch fails, fall back
 *  to whatever auth returned (transition-safe until A3 drops those fields). */
async function withProfile(creds: AuthUser): Promise<AuthUser> {
  try {
    const { profile } = await usersApi.getMyProfile();
    return {
      ...creds,
      display_name: profile.display_name,
      avatar_key: profile.avatar_key,
      favorite_teams: profile.favorite_teams,
    };
  } catch {
    return creds;
  }
}

interface VerifyResult {
  needsProfile: boolean;
  ticket?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Send an OTP; returns the code only when the backend reveals it (dev/testing). */
  startOtp: (phone: string) => Promise<string | undefined>;
  /** Verify the OTP. Existing user → logged in; new user → needsProfile + ticket. */
  verifyOtp: (phone: string, otp: string) => Promise<VerifyResult>;
  /** Finish a new signup with the ticket + display name + consent record. */
  completeProfile: (ticket: string, displayName: string, consent: SignupConsent) => Promise<void>;
  /** Set (or clear) the current user's avatar to an uploaded S3 key. */
  setAvatar: (avatarKey: string | null) => Promise<void>;
  /** Update editable profile fields (currently display name). */
  updateProfile: (patch: { display_name?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function bootstrap() {
    if (!hasSessionMarker()) {
      setUser(null);
      return;
    }
    try {
      const { user: me } = await authApi.me();
      setUser(await withProfile(me));
    } catch {
      const ok = await tryRefreshSession();
      if (ok) {
        try {
          const { user: me } = await authApi.me();
          setUser(await withProfile(me));
          return;
        } catch {
          // fall through
        }
      }
      setUser(null);
    }
  }

  useEffect(() => {
    // Never let the loading screen hang: cap bootstrap so loading always clears
    // even if a request or refresh stalls (belt-and-suspenders for mobile).
    const cap = new Promise<void>((resolve) => setTimeout(resolve, 12000));
    Promise.race([bootstrap(), cap]).finally(() => setLoading(false));
  }, []);

  async function startOtp(phone: string) {
    const res = await authApi.otpStart(phone);
    return res.dev_otp;
  }

  async function verifyOtp(phone: string, otp: string): Promise<VerifyResult> {
    const res = await authApi.otpVerify(phone, otp);
    if (res.user) {
      setUser(await withProfile(res.user));
      return { needsProfile: false };
    }
    return { needsProfile: true, ticket: res.ticket };
  }

  async function completeProfile(ticket: string, displayName: string, consent: SignupConsent) {
    const { user: u } = await authApi.otpComplete(ticket, displayName, consent);
    setUser(await withProfile(u));
  }

  async function setAvatar(avatarKey: string | null) {
    // Avatar now lives in the users (profile) service; merge the result onto the
    // current credentials rather than replacing the whole user.
    const { profile } = await usersApi.setAvatar(avatarKey);
    setUser((u) => (u ? { ...u, avatar_key: profile.avatar_key, favorite_teams: profile.favorite_teams } : u));
  }

  async function updateProfile(patch: { display_name?: string }) {
    const { profile } = await usersApi.updateProfile(patch);
    setUser((u) => (u ? { ...u, display_name: profile.display_name, favorite_teams: profile.favorite_teams } : u));
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // still clear local user state if cookies were already gone
    }
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, startOtp, verifyOtp, completeProfile, setAvatar, updateProfile, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
