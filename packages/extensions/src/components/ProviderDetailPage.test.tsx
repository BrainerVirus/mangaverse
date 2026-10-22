/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ProviderDetailPage } from './ProviderDetailPage.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderProviderDetail(data: Parameters<typeof ProviderDetailPage>[0]['data']) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onBack = vi.fn<() => void>();

  act(() => {
    root?.render(
      <ProviderDetailPage
        providerId="missing-provider"
        data={data}
        isLoading={false}
        isError={false}
        onBack={onBack}
        onToggleEnabled={() => {}}
        onRemove={() => {}}
      />,
    );
  });

  return { container, onBack };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('ProviderDetailPage', () => {
  it('Given an unknown provider id, Then it says the provider is not installed instead of none is', () => {
    const { container: view } = renderProviderDetail(null);

    expect(view.textContent).toContain('Provider not found');
    expect(view.textContent).toContain('is not installed on this device');
    expect(view.textContent).not.toContain('No provider installed');
  });

  it('Given an unknown provider id, When Back is pressed, Then the extensions list returns', () => {
    const { container: view, onBack } = renderProviderDetail(null);

    act(() => {
      [...view.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Back to extensions')
        ?.click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
