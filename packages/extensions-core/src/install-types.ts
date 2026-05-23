import type { AppError, ExtensionInstallWarning, ProviderManifest } from '@app/shared';

export type ExtensionInstallSource =
  | { readonly kind: 'manual'; readonly manifestUrl: string }
  | {
      readonly kind: 'registry';
      readonly registryUrl: string;
      readonly entryName: string;
      readonly manifestUrl: string;
    }
  | { readonly kind: 'protocol'; readonly manifestUrl: string; readonly rawHandoffUrl: string };

export type ExtensionInstallStep =
  | 'idle'
  | 'fetchingManifest'
  | 'manifestInvalid'
  | 'awaitingConfirmation'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'cancelled';

export interface ExtensionInstallPreview {
  readonly providerName: string;
  readonly providerId: string;
  readonly version: string;
  readonly publisher?: string;
  readonly sourceUrl: string;
  readonly manifestUrl?: string;
  readonly platforms: readonly string[];
  readonly capabilities: ProviderManifest['capabilities'];
  readonly capabilityDetails?: ProviderManifest['capabilityDetails'];
  readonly capabilityLimitations: readonly string[];
  readonly permissions: ProviderManifest['permissions'];
  readonly languages: readonly string[];
  readonly contentFlags: ProviderManifest['contentFlags'];
  readonly checksumStatus: 'absent' | 'present_unverified';
  readonly signatureStatus: 'absent' | 'present_unverified';
  readonly warnings: readonly ExtensionInstallWarning[];
}

export interface ExtensionInstallSession {
  readonly step: ExtensionInstallStep;
  readonly source?: ExtensionInstallSource;
  readonly manifest?: ProviderManifest;
  readonly preview?: ExtensionInstallPreview;
  readonly manifestFetchUrl?: string;
  readonly lastError?: AppError;
  readonly warnings: readonly ExtensionInstallWarning[];
}

export type ExtensionInstallAction =
  | { readonly type: 'startFromManualUrl'; readonly url: string }
  | {
      readonly type: 'startFromRegistryEntry';
      readonly registryUrl: string;
      readonly entryName: string;
      readonly manifestUrl: string;
    }
  | { readonly type: 'startFromProtocolHandoff'; readonly rawUrl: string; readonly resolvedManifestUrl: string }
  | {
      readonly type: 'manifestFetched';
      readonly manifest: ProviderManifest;
      readonly preview: ExtensionInstallPreview;
      readonly source: ExtensionInstallSource;
    }
  | { readonly type: 'manifestRejected'; readonly error: AppError }
  | { readonly type: 'confirm' }
  | { readonly type: 'cancel' }
  | { readonly type: 'installSucceeded' }
  | { readonly type: 'installFailed'; readonly error: AppError };

export type ExtensionInstallReducer = (
  session: ExtensionInstallSession,
  action: ExtensionInstallAction,
) => ExtensionInstallSession;
