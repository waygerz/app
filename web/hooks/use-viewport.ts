import { useSyncExternalStore } from 'react';

type UseViewport = [number, number];

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

export function useViewport(): UseViewport {
  // Return safe defaults during SSR (server snapshot)
  const height = useSyncExternalStore(subscribe, () => window.innerHeight, () => 0);
  const width = useSyncExternalStore(subscribe, () => window.innerWidth, () => 0);
  return [height, width];
}
