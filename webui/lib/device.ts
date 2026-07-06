/** Stable per-browser id sent as X-Device-UUID for session tracking. */
const DEVICE_KEY = 'waygerz_device_uuid';

export function getDeviceUuid(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}