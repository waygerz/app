import { useEffect, useState } from 'react';

/**
 * The current time (ms since epoch), refreshed every `intervalMs`. Reading
 * Date.now() during render is impure — this keeps "now" in state so time-based
 * UI (lock times, "started" checks, rolling windows) stays render-pure and also
 * re-renders on its own as the clock crosses a boundary.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
