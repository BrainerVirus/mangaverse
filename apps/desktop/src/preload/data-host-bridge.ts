import { contextBridge, ipcRenderer } from 'electron';
import type { AppResult } from '@app/shared';

// Literals rather than an import from main: the preload bundle must not pull main's modules.
const CONNECT = 'data-host:connect';
const PORT = 'data-host:port';
/** The window message that carries the port into the page's world. */
const PORT_MESSAGE = 'mangaverse:data-host-port';

export interface DesktopDataHostBridge {
  /**
   * Asks main for a port to the data host. On success the port arrives as a window message
   * whose data is `mangaverse:data-host-port`; a frame main did not create is refused.
   */
  connect(): Promise<AppResult<void>>;
}

// A MessagePort cannot cross contextBridge; window.postMessage is Electron's documented route.
ipcRenderer.on(PORT, (event) => {
  window.postMessage(PORT_MESSAGE, window.location.origin, event.ports);
});

const bridge: DesktopDataHostBridge = {
  connect: () => ipcRenderer.invoke(CONNECT),
};

contextBridge.exposeInMainWorld('mangaverseDataHost', bridge);
