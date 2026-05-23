import { describe, expect, it } from 'vitest';
import { createDesktopLocalService } from './local-service.js';

describe('createDesktopLocalService', () => {
  it('serves health and diagnostics on localhost and stops cleanly', async () => {
    const service = createDesktopLocalService({
      getDiagnosticsPayload: () => ({ hello: 'world' }),
    });
    await service.start();
    const info = service.getInfo();
    expect(info.running).toBe(true);
    expect(info.host).toBe('127.0.0.1');
    expect(typeof info.port).toBe('number');

    const base = `http://127.0.0.1:${info.port}`;
    const health = await fetch(`${base}/health`);
    expect(health.ok).toBe(true);
    expect(await health.json()).toEqual({ ok: true });

    const diag = await fetch(`${base}/diagnostics`);
    expect(await diag.json()).toEqual({ hello: 'world' });

    const missing = await fetch(`${base}/nope`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: 'not_found' });

    await service.stop();
    expect(service.getInfo().running).toBe(false);
  });
});
