import type { PlatformUpdateState } from '@app/platform';
import {
  Button,
  LoadingState,
  PageContainer,
  PageHeader,
  SettingsSection,
} from '@app/design-system';

import {
  describeUpdate,
  formatLastChecked,
  updateAction,
  updateChannel,
} from '../describe-update.js';

export interface UpdatesPageProps {
  /** `null` while main has not answered yet, or in a build with no desktop bridge. */
  readonly state: PlatformUpdateState | null;
  readonly isDesktop: boolean;
  onCheck: () => void;
  onInstall: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </div>
  );
}

const DESCRIPTION = 'Keep MangaVerse current. Updates download in the background.';

export function UpdatesPage({ state, isDesktop, onCheck, onInstall }: UpdatesPageProps) {
  if (!isDesktop) {
    return (
      <PageContainer variant="read">
        <section aria-label="Updates" className="flex flex-col gap-6">
          <PageHeader title="Updates" description={DESCRIPTION} />
          <p className="text-sm text-muted-foreground">
            Updates are handled by the desktop app. In a browser you always run the current version.
          </p>
        </section>
      </PageContainer>
    );
  }

  if (state === null) {
    return (
      <PageContainer variant="read">
        <section aria-label="Updates" className="flex flex-col gap-6">
          <PageHeader title="Updates" description={DESCRIPTION} />
          <LoadingState type="sections" count={2} />
        </section>
      </PageContainer>
    );
  }

  const description = describeUpdate(state);
  const action = updateAction(state);

  return (
    <PageContainer variant="read">
      <section aria-label="Updates" className="flex flex-col gap-6">
        <PageHeader
          title="Updates"
          description={DESCRIPTION}
          actions={
            <Button
              disabled={action.kind === 'off'}
              aria-disabled={action.kind === 'busy' ? true : undefined}
              onClick={
                action.kind === 'check'
                  ? onCheck
                  : action.kind === 'install'
                    ? onInstall
                    : undefined
              }
            >
              {action.label}
            </Button>
          }
        />

        <SettingsSection title="Status">
          <output className="block text-sm font-medium text-foreground">{description.title}</output>
          <p className="mt-1 text-sm text-muted-foreground">{description.detail}</p>
        </SettingsSection>

        <SettingsSection title="This version">
          <dl className="divide-y divide-border">
            <InfoRow label="Version" value={state.currentVersion} />
            <InfoRow label="Channel" value={updateChannel(state.currentVersion)} />
            <InfoRow label="Last checked" value={formatLastChecked(state.lastCheckedAt)} />
          </dl>
        </SettingsSection>
      </section>
    </PageContainer>
  );
}
