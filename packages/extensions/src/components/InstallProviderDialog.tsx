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
  ListRow,
} from '@app/design-system';
import type { ExtensionInstallPreview, ExtensionInstallSession } from '../core/index.js';

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

const CONTENT_FLAGS = [
  { key: 'nsfw', label: 'NSFW' },
  { key: 'suggestive', label: 'Suggestive' },
  { key: 'violence', label: 'Violence' },
] as const;

export function InstallPreviewPanel({ preview }: { preview: ExtensionInstallPreview }) {
  const enabledCapabilities = Object.entries(preview.capabilities)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  const matureFlags = CONTENT_FLAGS.filter((flag) => preview.contentFlags[flag.key]).map(
    (flag) => flag.label,
  );

  return (
    <ListRow tone="outline" padding="md" className="flex flex-col gap-4">
      <div>
        <p className="font-medium">{preview.providerName}</p>
        <p className="text-sm text-muted-foreground">
          {preview.providerId} · v{preview.version}
        </p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Publisher</dt>
          <dd>{preview.publisher ?? 'Unknown'}</dd>
        </div>
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
        <div>
          <dt className="text-muted-foreground">Network domains</dt>
          <dd>
            {preview.domains.length === 0 ? (
              'No network access'
            ) : (
              <ul className="list-disc pl-5">
                {preview.domains.map((domain) => (
                  <li key={domain}>{domain}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
      <div>
        <p className="mb-2 text-sm text-muted-foreground">Content flags</p>
        <dl className="flex flex-wrap gap-2 text-sm">
          {CONTENT_FLAGS.map((flag) => (
            <ListRow
              key={flag.key}
              tone="outline"
              padding="row"
              className="flex items-center gap-2"
            >
              <dt>{flag.label}</dt>
              <dd className="font-medium">{preview.contentFlags[flag.key] ? 'Yes' : 'No'}</dd>
            </ListRow>
          ))}
        </dl>
      </div>
      {matureFlags.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Mature content</AlertTitle>
          <AlertDescription>
            This provider declares {matureFlags.join(', ')} content. Content from this provider may
            not be suitable for all readers.
          </AlertDescription>
        </Alert>
      ) : null}
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
    </ListRow>
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
  const awaitingConfirmation =
    session?.step === 'awaitingConfirmation' && session.preview !== undefined;
  const installing = session?.step === 'installing';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="install-provider-dialog">
        <DialogHeader>
          <DialogTitle>Install provider</DialogTitle>
          <DialogDescription>
            Enter a manifest URL to review capabilities, permissions, and content flags before
            installing.
          </DialogDescription>
        </DialogHeader>

        <div
          data-testid="install-provider-body"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1.5 scroll-p-2"
        >
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

          {awaitingConfirmation ? <InstallPreviewPanel preview={session.preview!} /> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading || installing}
          >
            Cancel
          </Button>
          {awaitingConfirmation ? (
            <Button type="button" onClick={onConfirmInstall} disabled={isLoading || installing}>
              Confirm install
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onFetchManifest}
              disabled={isLoading || manifestUrl.trim().length === 0}
            >
              {isLoading ? 'Fetching…' : 'Review manifest'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
