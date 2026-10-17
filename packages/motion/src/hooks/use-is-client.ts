import { useState, useEffect } from 'react';

export function useIsClient(): boolean {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the false -> true flip after mount IS this hook's contract; there is no client-only primitive in React that reports it without a state update
    setIsClient(true);
  }, []);

  return isClient;
}