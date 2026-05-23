import { ok, type AppResult } from '@app/shared';
import { parseMangaverseInstallExtensionProviderUrl } from '@app/platform';

export function createInstallProtocolStore() {
  let pending: string | null = null;

  return {
    ingestFromRawUrl(raw: string): AppResult<void> {
      const r = parseMangaverseInstallExtensionProviderUrl(raw);
      if (!r.ok) {
        return r;
      }
      pending = r.value;
      return ok(undefined);
    },
    peek(): string | null {
      return pending;
    },
    take(): string | null {
      const v = pending;
      pending = null;
      return v;
    },
  };
}

export type InstallProtocolStore = ReturnType<typeof createInstallProtocolStore>;

export function ingestArgvForInstallUrls(argv: readonly string[], store: InstallProtocolStore): void {
  for (const arg of argv) {
    if (arg.startsWith('mangaverse://')) {
      store.ingestFromRawUrl(arg);
    }
  }
}

export function registerInstallProtocolAppEvents(deps: {
  readonly app: {
    on(event: 'open-url', listener: (event: { preventDefault: () => void }, url: string) => void): void;
    on(event: 'second-instance', listener: (event: unknown, argv: string[]) => void): void;
  };
  readonly store: InstallProtocolStore;
}): void {
  deps.app.on('open-url', (event, url) => {
    event.preventDefault();
    deps.store.ingestFromRawUrl(url);
  });

  deps.app.on('second-instance', (_event, argv) => {
    ingestArgvForInstallUrls(argv, deps.store);
  });
}
