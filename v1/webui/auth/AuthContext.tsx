'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { authApi, tryRefreshSession, type AuthUser } from '@/lib/auth';
import { hasSessionMarker } from '@/lib/session';

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
  /** Finish a new signup with the ticket + display name. */
  completeProfile: (ticket: string, displayName: string) => Promise<void>;
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
      setUser(me);
    } catch {
      const ok = await tryRefreshSession();
      if (ok) {
        try {
          const { user: me } = await authApi.me();
          setUser(me);
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
      setUser(res.user);
      return { needsProfile: false };
    }
    return { needsProfile: true, ticket: res.ticket };
  }

  async function completeProfile(ticket: string, displayName: string) {
    const { user: u } = await authApi.otpComplete(ticket, displayName);
    setUser(u);
  }

  async function setAvatar(avatarKey: string | null) {
    const { user: u } = await authApi.setAvatar(avatarKey);
    setUser(u);
  }

  async function updateProfile(patch: { display_name?: string }) {
    const { user: u } = await authApi.updateProfile(patch);
    setUser(u);
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
