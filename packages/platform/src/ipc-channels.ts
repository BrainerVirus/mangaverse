/** IPC channel names shared between Electron main and preload. */
export const PLATFORM_IPC = {
  CAPABILITIES_GET: 'platform:capabilities:get',
  CLIPBOARD_READ_TEXT: 'platform:clipboard:read-text',
  CLIPBOARD_WRITE_TEXT: 'platform:clipboard:write-text',
  FILE_OPEN_TEXT: 'platform:file:open-text',
  FILE_SAVE_TEXT: 'platform:file:save-text',
  FULLSCREEN_ENTER: 'platform:fullscreen:enter',
  FULLSCREEN_EXIT: 'platform:fullscreen:exit',
  FULLSCREEN_IS_ACTIVE: 'platform:fullscreen:is-active',
  EXTERNAL_LINK_OPEN: 'platform:external-link:open',
  PROTOCOL_GET_PENDING_INSTALL_URL: 'platform:protocol:get-pending-install-url',
  SECURE_STORAGE_GET: 'platform:secure-storage:get',
  SECURE_STORAGE_SET: 'platform:secure-storage:set',
  SECURE_STORAGE_DELETE: 'platform:secure-storage:delete',
  DIAGNOSTICS_GET: 'platform:diagnostics:get',
  LOCAL_SERVICE_GET_INFO: 'platform:local-service:get-info',
  NETWORK_FETCH_BYTES: 'platform:network:fetch-bytes',
} as const;

export type PlatformIpcChannel = (typeof PLATFORM_IPC)[keyof typeof PLATFORM_IPC];
