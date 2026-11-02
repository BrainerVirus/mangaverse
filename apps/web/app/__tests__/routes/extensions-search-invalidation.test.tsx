/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ExtensionsModule from '@app/extensions';
import type {
  ExtensionListImportResult,
  ExtensionRegistryImportResult,
  ExtensionsPageData,
} from '@app/extensions';
import { extensionsQueryKeys } from '@app/extensions';
import { searchQueryKeys } from '@/features/search';
import type { AppResult } from '@app/shared';

const mocks = vi.hoisted(() => ({
  fetchExtensionsPage: vi.fn<() => Promise<ExtensionsPageData>>(),
  setProviderEnabled:
    vi.fn<(db: unknown, providerId: string, enabled: boolean) => Promise<AppResult<void>>>(),
  importExtensionRegistry:
    vi.fn<(input: unknown, deps: unknown) => Promise<AppResult<ExtensionRegistryImportResult>>>(),
  confirmExtensionImport:
    vi.fn<(preparation: unknown, deps: unknown) => Promise<AppResult<ExtensionListImportResult>>>(),
  navigate: vi.fn<(options: unknown) => void>(),
  search: {} as { install?: boolean },
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => mocks.search }),
  useLocation: (options?: { select?: (location: { pathname: string }) => unknown }) => {
    const location = { pathname: '/extensions' };
    return options?.select === undefined ? location : options.select(location);
  },
  useNavigate: () => mocks.navigate,
}));

vi.mock('@app/extensions', async (importOriginal) => {
  const actual = await importOriginal<typeof ExtensionsModule>();
  return {
    ...actual,
    fetchExtensionsPage: mocks.fetchExtensionsPage,
    setProviderEnabled: mocks.setProviderEnabled,
    importExtensionRegistry: mocks.importExtensionRegistry,
    confirmExtensionImport: mocks.confirmExtensionImport,
  };
});

vi.mock('../../lib/local-db.js', () => ({
  flushLocalDb: () => Promise.resolve(),
}));

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({}),
  useLocalDbStatus: () => 'ready',
  useLocalDbRetry: () => vi.fn<() => void>(),
}));

import { Route } from '../../routes/extensions.js';

const ExtensionsRoute = Route.options.component;

if (ExtensionsRoute === undefined) {
  throw new Error('The /extensions route must expose its component.');
}

const page: ExtensionsPageData = {
  providers: [
    {
      id: 'prov-a',
      name: 'Provider A',
      version: '1.0.0',
      enabled: true,
      health: 'ok',
      sourceUrl: 'https://example.test/extension.js',
      languages: ['en'],
      capabilityCount: 1,
    },
  ],
};

const manifest = {
  id: 'audit-provider',
  name: 'Audit Provider',
  version: '1.0.0',
  source: { url: 'https://audit.example', publisher: 'Audit Studio' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

const extensionExport = JSON.stringify({
  version: 2,
  providers: [
    {
      name: 'Audit Provider',
      manifestUrl: 'https://audit.example/manifest.json',
      enabled: true,
    },
  ],
});

function buttonByText(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  );
}

function waitForButton(label: string): Promise<HTMLButtonElement> {
  return vi.waitFor(() => {
    const button = buttonByText(label);
    expect(button).toBeDefined();
    return button!;
  });
}

async function click(label: string): Promise<void> {
  const button = await waitForButton(label);
  await act(async () => {
    button.click();
  });
}

function setFieldValue(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

async function openImportDialog(): Promise<HTMLTextAreaElement> {
  await click('Import');
  return vi.waitFor(() => {
    const field = document.getElementById('registry-json');
    expect(field).toBeInstanceOf(HTMLTextAreaElement);
    return field as HTMLTextAreaElement;
  });
}

function stubManifestResponse(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: () => Promise.resolve(JSON.stringify(manifest)),
      } as unknown as Response),
    ),
  );
}

function stubPendingFetch(): AbortSignal[] {
  const signals: AbortSignal[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal != null) signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }),
  );
  return signals;
}

describe('/extensions route provider list invalidation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = {};
    mocks.fetchExtensionsPage.mockResolvedValue(page);
    mocks.setProviderEnabled.mockResolvedValue({ ok: true, value: undefined });
    mocks.importExtensionRegistry.mockResolvedValue({
      ok: true,
      value: {
        registry: { name: 'Audit Registry', registryUrl: 'https://reg.example/index.json' },
        entries: [],
        warnings: [],
      },
    });
    mocks.confirmExtensionImport.mockResolvedValue({
      ok: true,
      value: { installed: ['prov-a'], registries: 0, warnings: [] },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ExtensionsRoute />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('Given a provider is disabled, Then the search provider fan-out list is invalidated', async () => {
    await vi.waitFor(() =>
      expect(
        [...container.querySelectorAll('button')].map((button) => button.textContent),
      ).toContain('Disable'),
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Disable')
        ?.click();
    });

    await vi.waitFor(() =>
      expect(mocks.setProviderEnabled).toHaveBeenCalledWith(expect.anything(), 'prov-a', false),
    );
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: searchQueryKeys.providers() }),
    );
  });

  it('Given a registry import, Then the extension list and search providers are invalidated', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const textarea = await openImportDialog();

    await act(async () => {
      setFieldValue(
        textarea,
        JSON.stringify({
          name: 'Audit Registry',
          registryUrl: 'https://reg.example/index.json',
          entries: [],
        }),
      );
    });
    await click('Preview');
    await click('Import registry');

    await vi.waitFor(() => expect(mocks.importExtensionRegistry).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: extensionsQueryKeys.all });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: searchQueryKeys.providers() });
    });
  });

  it('Given a bulk extension import, Then the extension list and search providers are invalidated', async () => {
    stubManifestResponse();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const textarea = await openImportDialog();

    await act(async () => {
      setFieldValue(textarea, extensionExport);
    });
    await click('Preview');
    await vi.waitFor(() => expect(buttonByText('Import extensions')?.disabled).toBe(false));
    await click('Import extensions');

    await vi.waitFor(() => expect(mocks.confirmExtensionImport).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: extensionsQueryKeys.all });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: searchQueryKeys.providers() });
    });
  });

  it('Given an in-flight manifest review, When the import is cancelled, Then the prepare fetch is aborted', async () => {
    const signals = stubPendingFetch();
    const textarea = await openImportDialog();

    await act(async () => {
      setFieldValue(textarea, extensionExport);
    });
    await click('Preview');
    await vi.waitFor(() => expect(signals.length).toBeGreaterThan(0));

    await click('Cancel');

    await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true));
  });

  it('Given an in-flight manual manifest fetch, When the install dialog closes, Then the fetch is aborted', async () => {
    mocks.search = { install: true };
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ExtensionsRoute />
        </QueryClientProvider>,
      );
    });
    const input = await vi.waitFor(() => {
      const field = document.getElementById('manifest-url');
      expect(field).toBeInstanceOf(HTMLInputElement);
      return field as HTMLInputElement;
    });
    const signals = stubPendingFetch();

    await act(async () => {
      setFieldValue(input, 'https://audit.example/manifest.json');
    });
    await click('Review manifest');
    await vi.waitFor(() => expect(signals.length).toBeGreaterThan(0));

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true));
  });
});
