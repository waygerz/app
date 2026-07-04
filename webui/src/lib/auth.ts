// Client for the Waygerz auth service (HttpOnly cookie sessions).
import { API, API_BASE } from './api-paths';
import { getDeviceUuid } from './device';
import { apiJson } from './http';

const AUTH_URL = API_BASE;

export interface AuthUser {
  id: string;
  phone: string;
  display_name: string;
  created_at: string;
}

export const authApi = {
  signupStart: (phone: string) =>
    apiJson<{ dev_otp?: string; message: string; phone: string }>(`${AUTH_URL}${API.auth}/signup/start`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  signupVerify: (phone: string, otp: string, pin: string, display_name: string) =>
    apiJson<{ user: AuthUser }>(`${AUTH_URL}${API.auth}/signup/verify`, {
      method: 'POST',
      body: JSON.stringify({
        phone,
        otp,
        pin,
        display_name,
        device_uuid: getDeviceUuid(),
      }),
      device: true,
    }),

  login: (phone: string, pin: string) =>
    apiJson<{ user: AuthUser }>(`${AUTH_URL}${API.auth}/login`, {
      method: 'POST',
      body: JSON.stringify({ phone, pin, device_uuid: getDeviceUuid() }),
      device: true,
    }),

  me: () => apiJson<{ user: AuthUser }>(`${AUTH_URL}${API.auth}/me`),

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