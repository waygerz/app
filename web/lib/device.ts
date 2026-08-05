/** Stable per-browser id sent as X-Device-UUID for session tracking. */
const DEVICE_KEY = 'waygerz_device_uuid';

let memoryId: string | null = null;

/**
 * RFC4122-ish v4 uuid. Resilient to browsers without `crypto.randomUUID`
 * (older iOS Safari, some in-app webviews) or outside a secure context —
 * where calling it throws and previously broke auth on mobile.
 */
function generateUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to manual generation */
  }
  const bytes = new Uint8Array(16);
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
  } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Stable device id. Persists in localStorage when available; otherwise falls
 * back to an in-memory id so auth still works (private mode / disabled storage).
 * Never throws — a throw here used to strand mobile clients in a login loop.
 */
export function getDeviceUuid(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = generateUuid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return (memoryId ??= generateUuid());
  }
}
