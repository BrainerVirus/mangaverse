import type { AppResult } from '@app/shared';

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
  };
  readonly network: {
    fetchBytes(url: string): Promise<AppResult<PlatformNetworkFetchResult | undefined>>;
  };
  /**
   * Desktop only: tell main which hosts a provider's manifest declares. Main keeps
   * that table, refuses unknown providers and unregistered hosts, and never takes a
   * domain list with a request.
   */
  readonly providerNetwork: {
    registerProvider(providerId: string, domains: readonly string[]): Promise<AppResult<void>>;
    unregisterProvider(providerId: string): Promise<AppResult<void>>;
    request(input: PlatformProviderRequest): Promise<AppResult<PlatformProviderResponse>>;
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
  providerNetworkRegister: (
    providerId: string,
    domains: readonly string[],
  ) => Promise<AppResult<void>>;
  providerNetworkUnregister: (providerId: string) => Promise<AppResult<void>>;
  providerNetworkRequest: (
    input: PlatformProviderRequest,
  ) => Promise<AppResult<PlatformProviderResponse>>;
  /** Main's page store (spec 04 X13): bytes become a file, served back as `page://` URLs. */
  pageStorePut: (key: string, data: ArrayBuffer, mimeType: string) => Promise<AppResult<string>>;
  pageStoreUrl: (key: string) => Promise<AppResult<string | undefined>>;
  pageStoreDelete: (key: string) => Promise<AppResult<void>>;
  pageStoreListKeys: () => Promise<AppResult<readonly string[]>>;
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
