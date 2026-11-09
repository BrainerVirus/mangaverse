import { useSyncExternalStore } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { UpdatesPage } from '@/features/updates';
import {
  checkForUpdatesNow,
  getServerUpdateBridgeSnapshot,
  getServerUpdateStateSnapshot,
  hasUpdateBridgeSnapshot,
  getUpdateStateSnapshot,
  installUpdateNow,
  subscribeUpdateBridge,
  subscribeUpdateState,
} from '../lib/update-state-store.js';

export const Route = createFileRoute('/settings/updates')({
  component: SettingsUpdatesRoute,
});

function SettingsUpdatesRoute() {
  // The platform context's runtime is a web detection; the bridge is what a desktop window has.
  const isDesktop = useSyncExternalStore(
    subscribeUpdateBridge,
    hasUpdateBridgeSnapshot,
    getServerUpdateBridgeSnapshot,
  );
  const state = useSyncExternalStore(
    subscribeUpdateState,
    getUpdateStateSnapshot,
    getServerUpdateStateSnapshot,
  );

  return (
    <UpdatesPage
      state={state}
      isDesktop={isDesktop}
      onCheck={() => void checkForUpdatesNow()}
      onInstall={installUpdateNow}
    />
  );
}
