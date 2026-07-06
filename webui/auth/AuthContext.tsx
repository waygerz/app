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

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  startSignup: (phone: string) => Promise<string | undefined>;
  verifySignup: (
    phone: string,
    otp: string,
    pin: string,
    displayName: string,
  ) => Promise<void>;
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
    bootstrap().finally(() => setLoading(false));
  }, []);

  async function login(phone: string, pin: string) {
    const { user: u } = await authApi.login(phone, pin);
    setUser(u);
  }

  async function startSignup(phone: string) {
    const res = await authApi.signupStart(phone);
    return res.dev_otp;
  }

  async function verifySignup(
    phone: string,
    otp: string,
    pin: string,
    displayName: string,
  ) {
    const { user: u } = await authApi.signupVerify(phone, otp, pin, displayName);
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
      value={{ user, loading, login, startSignup, verifySignup, logout }}
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