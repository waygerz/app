import * as React from 'react';

const subscribeNoop = () => () => {};

/** False during SSR and hydration, true once rendering on the client. */
export function useMounted() {
  return React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}
