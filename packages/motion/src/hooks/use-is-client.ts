import { useSyncExternalStore } from 'react';

// There is nothing to subscribe to: hydration itself is the change, and React
// swaps the server snapshot for the client one after it.
const subscribeNothing = () => () => {};
const readIsClient = () => true;
const readServerIsClient = () => false;

export function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNothing, readIsClient, readServerIsClient);
}
