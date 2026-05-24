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
  readonly capabilityFlags?: Readonly<
    Record<
      keyof Omit<PlatformCapabilities, 'runtime'>,
      boolean
    >
  >;
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
    createObjectUrl(data: ArrayBuffer, mimeType: string): Promise<AppResult<string>>;
    revokeObjectUrl(url: string): Promise<AppResult<void>>;
  };
  readonly network: {
    fetchBytes(url: string): Promise<AppResult<PlatformNetworkFetchResult | undefined>>;
  };
}

export interface DesktopPlatformBridge {
  getCapabilities(): Promise<AppResult<PlatformCapabilities>>;
  clipboardReadText(): Promise<AppResult<string>>;
  clipboardWriteText(text: string): Promise<AppResult<void>>;
  fileOpenText(options: PlatformFileOpenOptions): Promise<AppResult<PlatformFileResult>>;
  fileSaveText(options: PlatformFileSaveOptions): Promise<AppResult<PlatformFileResult>>;
  fullscreenEnter(): Promise<AppResult<void>>;
  fullscreenExit(): Promise<AppResult<void>>;
  fullscreenIsActive(): Promise<AppResult<boolean>>;
  protocolGetPendingInstallUrl(): Promise<AppResult<string | null>>;
  externalLinkOpen(url: string): Promise<AppResult<void>>;
  secureStorageGet(key: string): Promise<AppResult<string | undefined>>;
  secureStorageSet(key: string, value: string): Promise<AppResult<void>>;
  secureStorageDelete(key: string): Promise<AppResult<void>>;
  diagnosticsGetSnapshot(): Promise<AppResult<PlatformDiagnosticsSnapshot>>;
  localServiceGetInfo(): Promise<AppResult<LocalServiceInfo>>;
  networkFetchBytes(url: string): Promise<AppResult<PlatformNetworkFetchResult | undefined>>;
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
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
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
