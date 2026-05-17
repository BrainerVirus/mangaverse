import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { detectWebCapabilities, type PlatformCapabilities, type PlatformRuntime } from '@app/platform';

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

function getInitialCapabilities(detectFn?: () => PlatformCapabilities): PlatformCapabilities | null {
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
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(() =>
    getInitialCapabilities(detectFn)
  );

  useEffect(() => {
    if (detectFn) {
      setCapabilities(detectFn());
    } else {
      setCapabilities(detectWebCapabilities());
    }
  }, [detectFn]);

  if (!capabilities) {
    return null;
  }

  return (
    <PlatformContext.Provider value={{ capabilities, runtime: capabilities.runtime }}>
      {children}
    </PlatformContext.Provider>
  );
}