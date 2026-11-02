import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { resolveGlassProfile } from '@app/design-system';
import {
  getReducedMotionPreference,
  setInAppReducedMotionPreference,
  useReducedMotion,
} from '@app/design-system/motion';
import { appSettingsQueryOptions } from '../queries/settings-query-options.js';
import { useLocalDb, useLocalDbStatus } from './local-db-provider.js';

export function ShellAppearanceBridge() {
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const { data } = useQuery({
    ...appSettingsQueryOptions(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = data?.settings.reduceMotion ?? false;
  const reduceTransparency = data?.settings.reduceTransparency ?? false;

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-shell-appearance: app settings and OS media changes must synchronize the motion external store and root CSS attributes after commit; render cannot safely mutate either external system.
  useEffect(() => {
    setInAppReducedMotionPreference(reduceMotion);

    const root = document.documentElement;
    const device = navigator as Navigator & { deviceMemory?: number };
    root.dataset.glass = resolveGlassProfile({
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: device.deviceMemory,
      reducedMotion: getReducedMotionPreference(),
    });
    if (reduceTransparency) {
      root.dataset.transparency = 'solid';
    } else {
      delete root.dataset.transparency;
    }
  }, [prefersReducedMotion, reduceMotion, reduceTransparency]);

  return null;
}
