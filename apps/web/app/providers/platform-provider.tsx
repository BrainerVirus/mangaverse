import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  detectWebCapabilities,
  type PlatformCapabilities,
  type PlatformRuntime,
} from '@app/platform';

interface PlatformContextValue {
  capabilities: PlatformCapabilities;
  runtime: PlatformRuntime;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}

interface PlatformProviderProps {
  children: ReactNode;
  detectFn?: (() => PlatformCapabilities) | undefined;
}

function getInitialCapabilities(
  detectFn?: () => PlatformCapabilities,
): PlatformCapabilities | null {
  if (detectFn) {
    try {
      return detectFn();
    } catch {
      return null;
    }
  }
  try {
    return detectWebCapabilities();
  } catch {
    return null;
  }
}

export function PlatformProvider({ children, detectFn }: PlatformProviderProps) {
  // Capabilities are detected during render, which is what both the SSR snapshot
  // and the first client render use. Re-detecting in an effect would cascade a
  // render (react/set-state-in-effect), so a changed detector is a render-phase
  // state update instead.
  const [detected, setDetected] = useState(() => ({
    detector: detectFn,
    capabilities: getInitialCapabilities(detectFn),
  }));
  if (detected.detector !== detectFn) {
    setDetected({ detector: detectFn, capabilities: getInitialCapabilities(detectFn) });
  }
  const capabilities = detected.capabilities;
  // Memoized above the `!capabilities` bail-out so the hook order never changes.
  const contextValue = useMemo<PlatformContextValue | null>(
    () => (capabilities ? { capabilities, runtime: capabilities.runtime } : null),
    [capabilities],
  );

  if (contextValue === null) {
    return null;
  }

  return <PlatformContext.Provider value={contextValue}>{children}</PlatformContext.Provider>;
}
