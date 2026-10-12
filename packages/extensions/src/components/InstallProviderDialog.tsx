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
import type { ExtensionInstallPreview, ExtensionInstallSession } from '@app/extensions-core';

export interface InstallProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifestUrl: string;
  onManifestUrlChange: (value: string) => void;
  session: ExtensionInstallSession | null;
  isLoading: boolean;
  errorMessage: string | null;
  onFetchManifest: () => void;
  onConfirmInstall: () => void;
  onCancel: () => void;
}

function PreviewPanel({ preview }: { preview: ExtensionInstallPreview }) {
  const enabledCapabilities = Object.entries(preview.capabilities)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-[var(--border)] p-4">
      <div>
        <p className="font-medium">{preview.providerName}</p>
        <p className="text-sm text-muted-foreground">
          {preview.providerId} · v{preview.version}
        </p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="break-all">{preview.sourceUrl}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Platforms</dt>
          <dd>{preview.platforms.join(', ')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Languages</dt>
          <dd>{preview.languages.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Permissions</dt>
          <dd>{preview.permissions.join(', ')}</dd>
        </div>
      </dl>
      {enabledCapabilities.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {enabledCapabilities.map((capability) => (
            <Badge key={capability} variant="secondary">
              {capability}
            </Badge>
          ))}
        </div>
      ) : null}
      {preview.warnings.length > 0 ? (
        <Alert>
          <AlertTitle>Review warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {preview.warnings.map((warning) => (
                <li key={warning.code}>{warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function InstallProviderDialog({
  open,
  onOpenChange,
  manifestUrl,
  onManifestUrlChange,
  session,
  isLoading,
  errorMessage,
  onFetchManifest,
  onConfirmInstall,
  onCancel,
}: InstallProviderDialogProps) {
  const awaitingConfirmation = session?.step === 'awaitingConfirmation' && session.preview !== undefined;
  const installing = session?.step === 'installing';

  if (!open) {
    return null;
  }

  return (
    <Dialog
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-provider-title"
      data-testid="install-provider-dialog"
      onClick={() => onOpenChange(false)}
    >
      <DialogContent className="max-w-xl" onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle id="install-provider-title">Install provider</DialogTitle>
          <DialogDescription>
            Enter a manifest URL to review capabilities, permissions, and content flags before installing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="manifest-url">Manifest URL</Label>
            <Input
              id="manifest-url"
              type="url"
              placeholder="https://example.com/provider/manifest.json"
              value={manifestUrl}
              onChange={(event) => onManifestUrlChange(event.target.value)}
              disabled={isLoading || installing}
            />
          </div>

          {errorMessage !== null ? (
            <Alert variant="destructive">
              <AlertTitle>Install failed</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          {awaitingConfirmation ? <PreviewPanel preview={session.preview!} /> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading || installing}>
            Cancel
          </Button>
          {awaitingConfirmation ? (
            <Button type="button" onClick={onConfirmInstall} disabled={isLoading || installing}>
              Confirm install
            </Button>
          ) : (
            <Button type="button" onClick={onFetchManifest} disabled={isLoading || manifestUrl.trim().length === 0}>
              {isLoading ? 'Fetching…' : 'Review manifest'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}