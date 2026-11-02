import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@app/design-system';
import type { ExtensionImportPreview, ExtensionListImportPreparation } from '../core/index.js';
import type { ExtensionInstallWarning } from '@app/shared';
import { useState } from 'react';

import { InstallPreviewPanel } from './InstallProviderDialog.js';

export interface RegistryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jsonText: string;
  onJsonTextChange: (value: string) => void;
  url: string;
  onUrlChange: (value: string) => void;
  preview: ExtensionImportPreview | null;
  preparation: ExtensionListImportPreparation | null;
  isLoading: boolean;
  errorMessage: string | null;
  onPreviewText: () => void;
  onPreviewUrl: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function WarningList({ warnings }: { warnings: readonly ExtensionInstallWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <Alert>
      <AlertTitle>Skipped or review</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          {warnings.map((warning) => (
            <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function RegistryPreview({ preview }: { preview: ExtensionImportPreview }) {
  const registry = preview.registries[0];
  return (
    <div
      className="flex flex-col gap-3 rounded-control border border-border p-4"
      data-testid="registry-import-preview"
    >
      <div>
        <p className="font-medium">{registry?.name ?? 'Registry'}</p>
        <p className="break-all text-sm text-muted-foreground">{registry?.registryUrl}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {preview.entries.length === 1
          ? '1 provider entry'
          : `${preview.entries.length} provider entries`}
      </p>
      {preview.entries.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm">
          {preview.entries.map((entry) => (
            <li key={entry.manifestUrl} className="flex flex-col gap-1">
              <span className="font-medium">{entry.name}</span>
              <span className="break-all text-muted-foreground">{entry.manifestUrl}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <WarningList warnings={preview.warnings} />
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">Registry only</Badge>
        <span className="text-sm text-muted-foreground">
          Saving stores this registry&apos;s name and URL. It adds no provider entries and installs
          no provider code.
        </span>
      </div>
    </div>
  );
}

function ExtensionListPreview({
  preview,
  preparation,
}: {
  preview: ExtensionImportPreview;
  preparation: ExtensionListImportPreparation | null;
}) {
  const sessions = preparation?.sessions ?? [];
  const warnings = [
    ...preview.warnings,
    ...(preparation?.warnings.filter(
      (warning) => !preview.warnings.some((existing) => existing.message === warning.message),
    ) ?? []),
  ];

  return (
    <div
      className="flex flex-col gap-4 rounded-control border border-border p-4"
      data-testid="extension-list-import-preview"
    >
      <div>
        <p className="font-medium">
          {preparation === null
            ? 'Checking provider manifests…'
            : sessions.length === 1
              ? '1 provider to install'
              : `${sessions.length} providers to install`}
        </p>
        <p className="text-sm text-muted-foreground">
          {preparation === null
            ? 'Fetching and validating each manifest before anything is saved.'
            : 'Manifests were fetched and validated. Nothing is installed until you confirm.'}
        </p>
      </div>
      {preview.registries.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Registries to save: {preview.registries.map((registry) => registry.name).join(', ')}
        </p>
      ) : null}
      {sessions.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {sessions.map(({ entry, session }) => (
            <li key={entry.manifestUrl ?? entry.name} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={entry.enabled ? 'default' : 'outline'}>
                  {entry.enabled ? 'Enabled after import' : 'Disabled after import'}
                </Badge>
                {entry.installedVersion !== undefined &&
                entry.installedVersion !== session.manifest?.version ? (
                  <span className="text-sm text-muted-foreground">
                    Updates {entry.installedVersion} → {session.manifest?.version}
                  </span>
                ) : null}
              </div>
              {session.preview !== undefined ? (
                <InstallPreviewPanel preview={session.preview} />
              ) : (
                <span className="font-medium">{entry.name}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <WarningList warnings={warnings} />
    </div>
  );
}

function ImportFooter({
  preview,
  preparation,
  isLoading,
  jsonText,
  onPreviewText,
  onConfirm,
  onCancel,
}: {
  preview: ExtensionImportPreview | null;
  preparation: ExtensionListImportPreparation | null;
  isLoading: boolean;
  jsonText: string;
  onPreviewText: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isExtensionList = preview?.kind === 'extension-list';
  const confirmDisabled =
    isLoading || (isExtensionList && (preparation === null || preparation.sessions.length === 0));
  const confirmLabel = preview?.kind === 'registry' ? 'Import registry' : 'Import extensions';

  return (
    <DialogFooter className="gap-2 sm:gap-0">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {preview !== null ? (
        <Button type="button" onClick={onConfirm} disabled={confirmDisabled}>
          {isLoading && isExtensionList ? 'Checking…' : confirmLabel}
        </Button>
      ) : (
        <Button
          type="button"
          onClick={onPreviewText}
          disabled={isLoading || jsonText.trim().length === 0}
        >
          {isLoading ? 'Checking…' : 'Preview'}
        </Button>
      )}
    </DialogFooter>
  );
}

export function RegistryImportDialog({
  open,
  onOpenChange,
  jsonText,
  onJsonTextChange,
  url,
  onUrlChange,
  preview,
  preparation,
  isLoading,
  errorMessage,
  onPreviewText,
  onPreviewUrl,
  onConfirm,
  onCancel,
}: RegistryImportDialogProps) {
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="registry-import-dialog">
        <DialogHeader>
          <DialogTitle>Import registry or extensions</DialogTitle>
          <DialogDescription>
            Paste a registry document, an exported extension list, a JSON file, or a URL. Everything
            is previewed before anything is saved, and no provider code runs on import.
          </DialogDescription>
        </DialogHeader>

        <div
          data-testid="registry-import-body"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        >
          {errorMessage !== null ? (
            <Alert variant="destructive">
              <AlertTitle>Import failed</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          {fileError !== null ? (
            <Alert variant="destructive">
              <AlertTitle>Could not read file</AlertTitle>
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="registry-json">Registry or extension JSON</Label>
            <textarea
              id="registry-json"
              value={jsonText}
              onChange={(event) => onJsonTextChange(event.target.value)}
              spellCheck={false}
              placeholder={
                '{"name":"My registry","registryUrl":"https://example.com/index.json","entries":[]}'
              }
              className="min-h-32 w-full rounded-control border border-border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="registry-file">JSON file</Label>
            <Input
              id="registry-file"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file === undefined) return;
                setFileError(null);
                void file
                  .text()
                  .then(onJsonTextChange)
                  .catch(() => setFileError('The selected file could not be read as text.'));
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="registry-url">Document URL</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="registry-url"
                type="url"
                className="min-w-48 flex-1"
                placeholder="https://example.com/registry.json"
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={onPreviewUrl}
                disabled={isLoading || url.trim().length === 0}
              >
                {isLoading ? 'Loading…' : 'Load'}
              </Button>
            </div>
          </div>

          {preview?.kind === 'registry' ? <RegistryPreview preview={preview} /> : null}
          {preview?.kind === 'extension-list' ? (
            <ExtensionListPreview preview={preview} preparation={preparation} />
          ) : null}
        </div>

        <ImportFooter
          preview={preview}
          preparation={preparation}
          isLoading={isLoading}
          jsonText={jsonText}
          onPreviewText={onPreviewText}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </DialogContent>
    </Dialog>
  );
}
