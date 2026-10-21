import { describe, expect, it, vi } from 'vitest';

const { config } = vi.hoisted(() => ({ config: vi.fn<(value: { jitless?: boolean }) => void>() }));

vi.mock('zod', () => ({ config }));

describe('zod-jitless', () => {
  it('disables Zod eval when the renderer entry loads', async () => {
    await import('../lib/zod-jitless.js');
    expect(config).toHaveBeenCalledWith({ jitless: true });
  });
});
