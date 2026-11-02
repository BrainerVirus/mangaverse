import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type * as RouterModule from '@tanstack/react-router';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModule>()),
  useLocation: () => ({ pathname: '/reader/chapter-1' }),
}));

vi.mock('@app/design-system/motion', () => ({
  useReducedMotion: () => true,
  routeEnter: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('@gsap/react', () => ({
  useGSAP: (callback: () => void) => callback(),
}));

describe('ReaderLayout', () => {
  it('owns the reader main landmark on the full-bleed fixed surface', async () => {
    const { ReaderLayout } = await import('../ReaderLayout.js');
    const html = renderToString(
      <ReaderLayout>
        <div>Reader surface</div>
      </ReaderLayout>,
    );

    expect(html.match(/<main[\s>]/g) ?? []).toHaveLength(1);
    // The landmark is the fixed full-bleed box itself, so nothing about the
    // reader's sizing or scroll container changed.
    expect(html).toContain('fixed inset-0 overflow-hidden');
    expect(html).toContain('Reader surface');
  });
});
