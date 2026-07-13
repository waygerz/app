// Client for the Waygerz auth service (passwordless phone + OTP, cookie sessions).
import { API } from './api-paths';
import { getDeviceUuid } from './device';
import { apiJson } from './http';

const AUTH_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface AuthUser {
  id: string;
  phone: string;
  display_name: string;
  avatar_key: string | null;
  created_at: string;
}

/** otp/verify: existing user → {user}; new user → {needs_profile, ticket}. */
export interface OtpVerifyResult {
  user?: AuthUser;
  needs_profile?: boolean;
  ticket?: string;
}

export const authApi = {
  otpStart: (phone: string) =>
    apiJson<{ message: string; phone: string; dev_otp?: string }>(`${AUTH_URL}${API.auth}/otp/start`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  otpVerify: (phone: string, otp: string) =>
    apiJson<OtpVerifyResult>(`${AUTH_URL}${API.auth}/otp/verify`, {
      method: 'POST',
      body: JSON.stringify({ phone, otp, device_uuid: getDeviceUuid() }),
      device: true,
    }),

  otpComplete: (ticket: string, display_name: string) =>
    apiJson<{ user: AuthUser }>(`${AUTH_URL}${API.auth}/otp/complete`, {
      method: 'POST',
      body: JSON.stringify({ ticket, display_name, device_uuid: getDeviceUuid() }),
      device: true,
    }),

  me: () => apiJson<{ user: AuthUser }>(`${AUTH_URL}${API.auth}/me`),

  setAvatar: (avatar_key: string | null) =>
    apiJson<{ user: AuthUser }>(`${AUTH_URL}${API.auth}/me/avatar`, {
      method: 'PATCH',
      body: JSON.stringify({ avatar_key }),
    }),

  refresh: () =>
    apiJson<{ message: string }>(`${AUTH_URL}${API.auth}/refresh`, {
      method: 'POST',
      body: JSON.stringify({ device_uuid: getDeviceUuid() }),
      device: true,
    }),

  logout: () =>
    apiJson<{ message: string }>(`${AUTH_URL}${API.auth}/logout`, {
      method: 'POST',
      body: JSON.stringify({ device_uuid: getDeviceUuid() }),
      device: true,
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
