import { describe, expect, it, vi } from 'vitest';
import { ok, type AppResult } from '@app/shared';

import { prepareProtocolExtensionInstall } from './prepare-install';

const validJson = {
  id: 'demo',
  name: 'Demo Provider',
  version: '1.0.0',
  source: { url: 'https://example.com' },
  compatibility: { platforms: ['web', 'desktop'] },
  capabilities: { 'discovery.search': true, 'metadata.details': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

describe('prepareProtocolExtensionInstall', () => {
  it('parses mangaverse handoff url', async () => {
    const fetch = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response(JSON.stringify(validJson), { status: 200 }),
    );
    const platformAdapter = {
      protocol: {
        getPendingInstallUrl: vi.fn<() => Promise<AppResult<string>>>(async () =>
          ok(
            'mangaverse://install-extension?url=' +
              encodeURIComponent('https://example.com/m.json'),
          ),
        ),
        canHandleInstallLinks: vi.fn<() => Promise<AppResult<boolean>>>(async () => ok(true)),
      },
    };
    const r = await prepareProtocolExtensionInstall(platformAdapter as never, { fetch });
    expect(r.ok).toBe(true);
    if (!r.ok) {
      throw new Error('expected r.ok to be true');
    }
    expect(r.value.step).toBe('awaitingConfirmation');
  });
});
