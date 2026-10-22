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
import type { ExtensionRegistryImportResult } from '@app/extensions-core';
import { useState } from 'react';

export interface RegistryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jsonText: string;
  onJsonTextChange: (value: string) => void;
  url: string;
  onUrlChange: (value: string) => void;
  preview: ExtensionRegistryImportResult | null;
  isLoading: boolean;
  errorMessage: string | null;
  onPreviewText: () => void;
  onPreviewUrl: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function RegistryPreview({ preview }: { preview: ExtensionRegistryImportResult }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-control border border-border p-4"
      data-testid="registry-import-preview"
    >
      <div>
        <p className="font-medium">{preview.registry.name}</p>
        <p className="break-all text-sm text-muted-foreground">{preview.registry.registryUrl}</p>
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
      {preview.warnings.length > 0 ? (
        <Alert>
          <AlertTitle>Entries skipped</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {preview.warnings.map((warning) => (
                <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">Review only</Badge>
        <span className="text-sm text-muted-foreground">
          Importing adds registry entries; it installs no provider code.
        </span>
      </div>
    </div>
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
          <DialogTitle>Import registry</DialogTitle>
          <DialogDescription>
            Paste a registry document, load a JSON file, or fetch one by URL. Entries and warnings
            are previewed before anything is saved.
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
            <Label htmlFor="registry-json">Registry JSON</Label>
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
            <Label htmlFor="registry-file">Registry file</Label>
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
            <Label htmlFor="registry-url">Registry URL</Label>
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
                Load
              </Button>
            </div>
          </div>

          {preview !== null ? <RegistryPreview preview={preview} /> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          {preview !== null ? (
            <Button type="button" onClick={onConfirm} disabled={isLoading}>
              {isLoading ? 'Importing…' : 'Import registry'}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onPreviewText}
              disabled={isLoading || jsonText.trim().length === 0}
            >
              {isLoading ? 'Checking…' : 'Preview registry'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
