import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

export interface DesktopLocalService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getInfo(): { running: boolean; host: string | null; port: number | null };
}

export function createDesktopLocalService(deps: {
  readonly getDiagnosticsPayload: () => Record<string, unknown>;
}): DesktopLocalService {
  let server: Server | null = null;
  let port: number | null = null;
  let host: string | null = null;

  return {
    async start(): Promise<void> {
      const expressApp = express();
      expressApp.disable('x-powered-by');

      expressApp.get('/health', (_req, res) => {
        res.json({ ok: true });
      });

      expressApp.get('/diagnostics', (_req, res) => {
        res.json(deps.getDiagnosticsPayload());
      });

      expressApp.use((_req, res) => {
        res.status(404).json({ error: 'not_found' });
      });

      await new Promise<void>((resolve, reject) => {
        const httpServer = expressApp.listen(0, '127.0.0.1', () => {
          const addr = httpServer.address() as AddressInfo;
          port = addr.port;
          host = addr.address;
          server = httpServer;
          resolve();
        });
        httpServer.on('error', reject);
      });
    },

    async stop(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        const s = server;
        server = null;
        port = null;
        host = null;
        s.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    getInfo(): { running: boolean; host: string | null; port: number | null } {
      return {
        running: server !== null,
        host,
        port,
      };
    },
  };
}
