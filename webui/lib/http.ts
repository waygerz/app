import { getDeviceUuid } from './device';

export type ApiFetchOptions = RequestInit & {
  /** Attach X-Device-UUID (auth refresh/logout). Default true for mutating auth calls only when set by caller. */
  device?: boolean;
};

/** Fetch with session cookies; optional device header for auth session endpoints. */
export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { device, headers: extra, ...rest } = options;
  const headers = new Headers(extra);
  if (!headers.has('Content-Type') && rest.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (device) {
    headers.set('X-Device-UUID', getDeviceUuid());
  }
  return fetch(url, {
    ...rest,
    headers,
    credentials: 'include',
  });
}

export async function apiJson<T>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const res = await apiFetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}