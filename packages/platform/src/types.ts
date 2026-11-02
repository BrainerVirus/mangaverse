import type { AppResult } from '@app/shared';
import type { RendererImportReport } from './ipc-schemas.js';

export type PlatformRuntime = 'web' | 'pwa' | 'electron' | 'unknown';

export interface PlatformStorageEstimate {
  readonly quota?: number;
  readonly usage?: number;
  readonly persisted?: boolean;
}

export interface PlatformBlobRecord {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
}

export interface PlatformNetworkFetchResult {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
}

export type PlatformProviderRequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/**
 * One provider HTTP request the renderer asks main to make. The provider id selects
 * main's allowlist; the URL is checked against it before every hop. Bodies are text
 * because every current provider speaks JSON.
 */
export interface PlatformProviderRequest {
  readonly providerId: string;
  readonly url: string;
  readonly method?: PlatformProviderRequestMethod;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  /** Bounded by main to 60 s; the caller's own abort only stops waiting. */
  readonly timeoutMs?: number;
}

/** Ask main to fetch an image under the provider's allowlist and store it itself. */
export interface PlatformProviderStoreRequest {
  readonly providerId: string;
  readonly url: string;
  /** A page-store key; main writes the bytes and returns a `page://` URL. */
  readonly key: string;
}

/**
 * Ask main to fetch a user-supplied image (a custom cover) and store it itself.
 * No provider or allowlist is involved, but the same SSRF, redirect, size and
 * time checks run: only public images can be stored.
 */
export interface PlatformProviderUserStoreRequest {
  readonly url: string;
  /** A page-store key; main writes the bytes and returns a `page://` URL. */
  readonly key: string;
}

/** One provider's declared domains in the full snapshot the renderer sends main. */
export interface ProviderNetworkRegistration {
  readonly providerId: string;
  readonly domains: readonly string[];
}

export interface PlatformProviderStoreResult {
  readonly url: string;
  readonly mimeType: string;
  readonly byteSize: number;
}

export interface PlatformProviderResponse {
  readonly status: number;
  /** Filtered to the headers a provider client may see; never cookies or auth echoes. */
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyText: string;
  readonly finalUrl: string;
}

export interface PlatformBlobStorageEnvironment {
  readonly indexedDB?: IDBFactory;
  readonly createObjectUrl?: (blob: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
}

export interface PlatformCapabilities {
  readonly runtime: PlatformRuntime;
  readonly clipboardRead: boolean;
  readonly clipboardWrite: boolean;
  readonly nativeFileOpen: boolean;
  readonly nativeFileSave: boolean;
  readonly nativeFullscreen: boolean;
  readonly externalLinks: boolean;
  readonly protocolInstallHandoff: boolean;
  readonly installPrompt: boolean;
  readonly secureStorage: boolean;
  readonly persistentStorage: boolean;
  readonly storageEstimate: boolean;
  readonly diagnostics: boolean;
  readonly localService: boolean;
  readonly sqliteRuntime: boolean;
}

export interface PlatformFileOpenOptions {
  readonly suggestedName?: string;
  readonly acceptDescription?: string;
}

export interface PlatformFileSaveOptions {
  readonly suggestedName?: string;
  readonly defaultPath?: string;
  readonly content: string;
}

export interface PlatformFileResult {
  readonly path?: string;
  readonly content: string;
  readonly cancelled?: boolean;
}

export interface LocalServiceInfo {
  readonly running: boolean;
  readonly host: string | null;
  readonly port: number | null;
}

export interface PlatformDiagnosticsSnapshot {
  readonly appVersion?: string;
  readonly electronVersion?: string;
  readonly chromeVersion?: string;
  readonly nodeVersion?: string;
  readonly platform?: string;
  readonly arch?: string;
  readonly userDataConfigured?: boolean;
  readonly localService?: LocalServiceInfo;
  readonly capabilityFlags?: Readonly<Record<keyof Omit<PlatformCapabilities, 'runtime'>, boolean>>;
}

/**
 * A release electron-updater has already downloaded and verified in the background. The
 * renderer only ever sees this once the bytes are on disk, so offering "Restart and install"
 * is honest; nothing installs until the user asks for it, and main defers that install while
 * any window is mid-chapter.
 */
export interface PlatformUpdateInfo {
  readonly version: string;
}

export type PlatformInstallPromptState =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'available' }
  | { readonly kind: 'installed' }
  | { readonly kind: 'dismissed' };

export interface PlatformAdapter {
  capabilities(): Promise<AppResult<PlatformCapabilities>>;
  readonly clipboard: {
    readText(): Promise<AppResult<string>>;
    writeText(text: string): Promise<AppResult<void>>;
  };
  readonly files: {
    openTextFile(options: PlatformFileOpenOptions): Promise<AppResult<PlatformFileResult>>;
    saveTextFile(options: PlatformFileSaveOptions): Promise<AppResult<PlatformFileResult>>;
  };
  readonly fullscreen: {
    enter(): Promise<AppResult<void>>;
    exit(): Promise<AppResult<void>>;
    isActive(): Promise<AppResult<boolean>>;
  };
  readonly protocol: {
    getPendingInstallUrl(): Promise<AppResult<string | null>>;
    canHandleInstallLinks(): Promise<AppResult<boolean>>;
  };
  readonly externalLinks: {
    open(url: string): Promise<AppResult<void>>;
  };
  readonly installPrompt: {
    getState(): Promise<AppResult<PlatformInstallPromptState>>;
    prompt(): Promise<AppResult<void>>;
  };
  readonly secureStorage: {
    get(key: string): Promise<AppResult<string | undefined>>;
    set(key: string, value: string): Promise<AppResult<void>>;
    delete(key: string): Promise<AppResult<void>>;
  };
  readonly diagnostics: {
    getSnapshot(): Promise<AppResult<PlatformDiagnosticsSnapshot>>;
  };
  readonly localService: {
    getInfo(): Promise<AppResult<LocalServiceInfo>>;
  };
  readonly storage: {
    getItem(key: string): Promise<AppResult<string | undefined>>;
    setItem(key: string, value: string): Promise<AppResult<void>>;
    deleteItem(key: string): Promise<AppResult<void>>;
    estimate(): Promise<AppResult<PlatformStorageEstimate>>;
    persist(): Promise<AppResult<boolean>>;
  };
  readonly blobStorage: {
    put(key: string, data: ArrayBuffer, mimeType: string): Promise<AppResult<void>>;
    get(key: string): Promise<AppResult<PlatformBlobRecord | undefined>>;
    delete(key: string): Promise<AppResult<void>>;
    /** Enumerates stored keys so cache maintenance can reclaim blobs whose row is gone. */
    listKeys(): Promise<AppResult<readonly string[]>>;
    createObjectUrl(data: ArrayBuffer, mimeType: string): Promise<AppResult<string>>;
    revokeObjectUrl(url: string): Promise<AppResult<void>>;
    /**
     * A URL that serves a stored blob without its bytes reaching this process, where the
     * store has one: `ok(url)` when stored, `ok(undefined)` when not. An error, or no
     * method at all, means this key is read with `get` and shown with `createObjectUrl`.
     */
    resolveUrl?(key: string): Promise<AppResult<string | undefined>>;
    /**
     * Desktop only: the digest and size the main store actually wrote, so an import can
     * compare the stored file to the bytes it read. `ok(undefined)` means not stored.
     */
    verify?(
      key: string,
    ): Promise<AppResult<{ readonly sha256: string; readonly byteSize: number } | undefined>>;
  };
  readonly network: {
    fetchBytes(url: string): Promise<AppResult<PlatformNetworkFetchResult | undefined>>;
  };
  /**
   * Desktop only: tell main the complete set of enabled providers and their
   * declared hosts. Main replaces its table with exactly this snapshot, so an id
   * missing from it loses access; `revision` orders overlapping syncs.
   */
  readonly providerNetwork: {
    replaceProviders(
      providers: readonly ProviderNetworkRegistration[],
      revision: number,
    ): Promise<AppResult<void>>;
    /**
     * Drop one provider from main's table immediately. Disable and uninstall await
     * this before they commit, so a failure leaves the provider enabled and visible
     * rather than enabled in main only. Ordered with `replaceProviders` by `revision`.
     */
    revokeProvider(providerId: string, revision: number): Promise<AppResult<void>>;
    /**
     * Main's monotonic revision for the next snapshot or revoke. Main assigns it so
     * a renderer reload (or a backward clock) cannot reuse a fenced revision.
     */
    nextRevision(): Promise<AppResult<number>>;
    request(input: PlatformProviderRequest): Promise<AppResult<PlatformProviderResponse>>;
    /**
     * Desktop only: fetch and store in one main-process call, returning metadata and a
     * `page://` URL but never the bytes. Absent where the page store has no URL form.
     */
    fetchAndStore?: (
      input: PlatformProviderStoreRequest,
    ) => Promise<AppResult<PlatformProviderStoreResult | undefined>>;
    /** Desktop only: the same fetch-and-store without a provider allowlist, for user URLs. */
    fetchAndStoreUserInitiated?: (
      input: PlatformProviderUserStoreRequest,
    ) => Promise<AppResult<PlatformProviderStoreResult | undefined>>;
  };
  /**
   * Desktop only (spec 04 X7/X8): the packaged app's update offer. `setReaderActive` is the
   * renderer's signal that a chapter is open, so main holds both the prompt and an accepted
   * install until reading ends.
   */
  readonly updates?: {
    setReaderActive(active: boolean): Promise<AppResult<void>>;
    /**
     * Restart into the already-downloaded release. If a chapter is open the request is kept
     * and the install runs as soon as the last one closes.
     */
    install(): Promise<AppResult<void>>;
    /** "Later": main will not offer this version again this session. */
    dismiss(): Promise<AppResult<void>>;
    /** Subscribes to main's ready-to-install events; returns the unsubscribe function. */
    onAvailable(listener: (info: PlatformUpdateInfo) => void): () => void;
  };
}

// Property-style function types, not methods: callers read these off the bridge
// (mocks, `expect(bridge.x)`), and method signatures would carry a `this` binding.
export interface DesktopPlatformBridge {
  getCapabilities: () => Promise<AppResult<PlatformCapabilities>>;
  clipboardReadText: () => Promise<AppResult<string>>;
  clipboardWriteText: (text: string) => Promise<AppResult<void>>;
  fileOpenText: (options: PlatformFileOpenOptions) => Promise<AppResult<PlatformFileResult>>;
  fileSaveText: (options: PlatformFileSaveOptions) => Promise<AppResult<PlatformFileResult>>;
  fullscreenEnter: () => Promise<AppResult<void>>;
  fullscreenExit: () => Promise<AppResult<void>>;
  fullscreenIsActive: () => Promise<AppResult<boolean>>;
  protocolGetPendingInstallUrl: () => Promise<AppResult<string | null>>;
  externalLinkOpen: (url: string) => Promise<AppResult<void>>;
  secureStorageGet: (key: string) => Promise<AppResult<string | undefined>>;
  secureStorageSet: (key: string, value: string) => Promise<AppResult<void>>;
  secureStorageDelete: (key: string) => Promise<AppResult<void>>;
  diagnosticsGetSnapshot: () => Promise<AppResult<PlatformDiagnosticsSnapshot>>;
  localServiceGetInfo: () => Promise<AppResult<LocalServiceInfo>>;
  networkFetchBytes: (url: string) => Promise<AppResult<PlatformNetworkFetchResult | undefined>>;
  providerNetworkReplace: (
    providers: readonly ProviderNetworkRegistration[],
    revision: number,
  ) => Promise<AppResult<void>>;
  providerNetworkRevoke: (providerId: string, revision: number) => Promise<AppResult<void>>;
  providerNetworkNextRevision: () => Promise<AppResult<number>>;
  providerNetworkRequest: (
    input: PlatformProviderRequest,
  ) => Promise<AppResult<PlatformProviderResponse>>;
  providerNetworkStore: (
    input: PlatformProviderStoreRequest,
  ) => Promise<AppResult<PlatformProviderStoreResult | undefined>>;
  providerNetworkStoreUserInitiated: (
    input: PlatformProviderUserStoreRequest,
  ) => Promise<AppResult<PlatformProviderStoreResult | undefined>>;
  /** Main's page store (spec 04 X13): bytes become a file, served back as `page://` URLs. */
  pageStorePut: (key: string, data: ArrayBuffer, mimeType: string) => Promise<AppResult<string>>;
  pageStoreUrl: (key: string) => Promise<AppResult<string | undefined>>;
  pageStoreVerify: (
    key: string,
  ) => Promise<AppResult<{ readonly sha256: string; readonly byteSize: number } | undefined>>;
  pageStoreDelete: (key: string) => Promise<AppResult<void>>;
  pageStoreListKeys: () => Promise<AppResult<readonly string[]>>;
  /** Whether the one-way renderer-data import (#213) already finished, and its DB report. */
  rendererImportState: () => Promise<
    AppResult<{
      readonly completed: boolean;
      readonly completedAt?: string;
      readonly database: {
        readonly tables: Readonly<Record<string, number>>;
        readonly totalRows: number;
        readonly checksum: string;
      } | null;
      /** Digests the completed import verified, by page-store key. */
      readonly blobChecksums: Readonly<Record<string, string>>;
    }>
  >;
  /** Records the verified renderer-data import beside the native database. */
  rendererImportComplete: (report: RendererImportReport) => Promise<AppResult<void>>;
  /** Desktop only: a chapter is open, so main holds the update prompt until it closes. */
  updateSetReaderActive: (active: boolean) => Promise<AppResult<void>>;
  updateInstall: () => Promise<AppResult<void>>;
  updateDismiss: () => Promise<AppResult<void>>;
  /** Main→renderer: a release downloaded and is ready to install. */
  onUpdateAvailable: (listener: (info: PlatformUpdateInfo) => void) => () => void;
}

export interface WebCapabilityEnvironment {
  readonly hasClipboardRead?: boolean;
  readonly hasClipboardWrite?: boolean;
  readonly fullscreenEnabled?: boolean;
  readonly hasRegisterProtocolHandler?: boolean;
  readonly installPromptObservable?: boolean;
  readonly isSecureContext?: boolean;
  readonly hasLocalStorage?: boolean;
  readonly hasStorageEstimate?: boolean;
  readonly hasStoragePersist?: boolean;
  readonly hasDownload?: boolean;
}

export interface WebPlatformEnvironment {
  readonly capabilityProbe?: WebCapabilityEnvironment;
  readonly navigatorClipboard?: {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<void>;
  };
  readonly getDocumentElement?: () => Element | null;
  readonly requestFullscreen?: (element: Element) => Promise<void>;
  readonly exitFullscreen?: () => Promise<void>;
  readonly getFullscreenElement?: () => Element | null;
  readonly windowOpen?: (url: string, target?: string) => void;
  readonly locationAssign?: (url: string) => void;
  readonly createObjectUrl?: (blob: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
  readonly createDownload?: (filename: string, href: string) => void;
  readonly getRegisterProtocolHandler?: () =>
    | ((scheme: string, url: string, title: string) => void)
    | undefined;
  readonly subscribeBeforeInstallPrompt?: (
    listener: (event: { prompt: () => Promise<void> }) => void,
  ) => () => void;
  readonly getInstallPromptAvailable?: () => boolean;
  readonly localStorage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  readonly storageManager?: {
    estimate?: () => Promise<{ quota?: number; usage?: number }>;
    persist?: () => Promise<boolean>;
    persisted?: () => Promise<boolean>;
  };
  readonly indexedDB?: IDBFactory;
}

export interface ElectronCapabilityInput extends Partial<PlatformCapabilities> {
  readonly runtime?: PlatformRuntime;
}
