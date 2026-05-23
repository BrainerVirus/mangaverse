import { contextBridge, ipcRenderer } from 'electron';
import { PLATFORM_IPC } from '@app/platform';
import type { DesktopPlatformBridge } from '@app/platform';

const bridge: DesktopPlatformBridge = {
  getCapabilities: () => ipcRenderer.invoke(PLATFORM_IPC.CAPABILITIES_GET),
  clipboardReadText: () => ipcRenderer.invoke(PLATFORM_IPC.CLIPBOARD_READ_TEXT),
  clipboardWriteText: (text: string) =>
    ipcRenderer.invoke(PLATFORM_IPC.CLIPBOARD_WRITE_TEXT, text),
  fileOpenText: (options) => ipcRenderer.invoke(PLATFORM_IPC.FILE_OPEN_TEXT, options),
  fileSaveText: (options) => ipcRenderer.invoke(PLATFORM_IPC.FILE_SAVE_TEXT, options),
  fullscreenEnter: () => ipcRenderer.invoke(PLATFORM_IPC.FULLSCREEN_ENTER),
  fullscreenExit: () => ipcRenderer.invoke(PLATFORM_IPC.FULLSCREEN_EXIT),
  fullscreenIsActive: () => ipcRenderer.invoke(PLATFORM_IPC.FULLSCREEN_IS_ACTIVE),
  protocolGetPendingInstallUrl: () =>
    ipcRenderer.invoke(PLATFORM_IPC.PROTOCOL_GET_PENDING_INSTALL_URL),
  externalLinkOpen: (url: string) =>
    ipcRenderer.invoke(PLATFORM_IPC.EXTERNAL_LINK_OPEN, url),
  secureStorageGet: (key: string) =>
    ipcRenderer.invoke(PLATFORM_IPC.SECURE_STORAGE_GET, key),
  secureStorageSet: (key: string, value: string) =>
    ipcRenderer.invoke(PLATFORM_IPC.SECURE_STORAGE_SET, key, value),
  secureStorageDelete: (key: string) =>
    ipcRenderer.invoke(PLATFORM_IPC.SECURE_STORAGE_DELETE, key),
  diagnosticsGetSnapshot: () => ipcRenderer.invoke(PLATFORM_IPC.DIAGNOSTICS_GET),
  localServiceGetInfo: () => ipcRenderer.invoke(PLATFORM_IPC.LOCAL_SERVICE_GET_INFO),
};

contextBridge.exposeInMainWorld('mangaversePlatform', bridge);

export {};
