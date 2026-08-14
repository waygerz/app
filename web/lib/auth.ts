// Client for the Waygerz auth service (passwordless phone + OTP, cookie sessions).
import { API } from './api-paths';
import { getDeviceUuid } from './device';
import { apiJson } from './http';
import type { FavoriteTeam } from './users';

const AUTH_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface AuthUser {
  id: string;
  phone: string;
  // display_name/avatar_key are sourced from the users (profile) service and
  // merged onto this object in AuthContext; auth still returns them until the
  // split's contract phase (A3) drops them.
  display_name: string;
  avatar_key: string | null;
  /** Favorite teams, merged in from the users (profile) service. */
  favorite_teams?: FavoriteTeam[];
  created_at: string;
  /** Read-only consent record from signup (null for pre-consent accounts). */
  tos_accepted_at?: string | null;
  tos_version?: string | null;
}

/** otp/verify: existing user → {user}; new user → {needs_profile, ticket}. */
export interface OtpVerifyResult {
  user?: AuthUser;
  needs_profile?: boolean;
  ticket?: string;
}

/** Consent captured on the create-account step and recorded server-side.
 *  `tos_accepted` (Terms + Privacy) and `sms_transactional` are required;
 *  `sms_marketing` is optional (TCPA — marketing can't be required for service). */
export interface SignupConsent {
  tos_version: string;
  tos_accepted: boolean;
  sms_transactional: boolean;
  sms_marketing: boolean;
}

export const authApi = {
  otpStart: (phone: string) =>
    apiJson<{ message: string; phone: string; dev_otp?: string }>(`${AUTH_URL}${API.auth}/otp/start`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
      skipAuthRetry: true,
    }),

  otpVerify: (phone: string, otp: string) =>
    apiJson<OtpVerifyResult>(`${AUTH_URL}${API.auth}/otp/verify`, {
      method: 'POST',
      body: JSON.stringify({ phone, otp, device_uuid: getDeviceUuid() }),
      device: true,
      skipAuthRetry: true,
    }),

  otpComplete: (ticket: string, display_name: string, consent?: SignupConsent) =>
    apiJson<{ user: AuthUser }>(`${AUTH_URL}${API.auth}/otp/complete`, {
      method: 'POST',
      body: JSON.stringify({ ticket, display_name, device_uuid: getDeviceUuid(), ...consent }),
      device: true,
      skipAuthRetry: true,
    }),

  // /me returns identity/credentials only now (id, phone, created_at, tos_*);
  // display_name/avatar are fetched from the users service and merged in
  // AuthContext. Profile writes live on usersApi (see lib/users.ts).
  me: () => apiJson<{ user: AuthUser }>(`${AUTH_URL}${API.auth}/me`),

  refresh: () =>
    apiJson<{ message: string }>(`${AUTH_URL}${API.auth}/refresh`, {
      method: 'POST',
      body: JSON.stringify({ device_uuid: getDeviceUuid() }),
      device: true,
      skipAuthRetry: true,
    }),

  logout: () =>
    apiJson<{ message: string }>(`${AUTH_URL}${API.auth}/logout`, {
      method: 'POST',
      body: JSON.stringify({ device_uuid: getDeviceUuid() }),
      device: true,
      skipAuthRetry: true,
    }),
};

/** Proactive refresh when the session marker is present (best-effort). */
export async function tryRefreshSession(): Promise<boolean> {
  try {
    await authApi.refresh();
    return true;
  } catch {
    return false;
  }
}
