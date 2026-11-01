import {
  Badge,
  Button,
  SettingsSection,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@app/design-system';

import type { DiagnosticEvent, DiagnosticEventKind } from '../event-log.js';

export interface EventLogSectionProps {
  readonly events: readonly DiagnosticEvent[];
  onClear: () => void | Promise<void>;
  onExport: () => Promise<string>;
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'error', label: 'Errors' },
  { value: 'slow-provider-call', label: 'Slow calls' },
  { value: 'reader-timing', label: 'Reader timing' },
] as const satisfies readonly { value: 'all' | DiagnosticEventKind; label: string }[];

const REVOKE_DELAY_MS = 1000;

/**
 * Downloads the exported log. Safari ignores a detached anchor and aborts a
 * download whose object URL is revoked in the click's task, so the anchor is
 * attached and the revocation deferred, as with every other JSON export.
 */
function downloadEventLog(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'mangaverse-event-log.json';
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

function EventRow({ event }: { event: DiagnosticEvent }) {
  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={event.kind === 'error' ? 'destructive' : 'secondary'}>{event.kind}</Badge>
        <time dateTime={event.at} className="font-mono text-xs text-muted-foreground">
          {event.at}
        </time>
        {event.providerId !== undefined ? (
          <span className="font-mono text-xs text-muted-foreground">{event.providerId}</span>
        ) : null}
        {event.durationMs !== undefined ? (
          <span className="font-mono text-xs text-muted-foreground">
            {Math.round(event.durationMs)} ms
          </span>
        ) : null}
      </div>
      <p className="break-words text-foreground">{event.message}</p>
      {event.code !== undefined ? (
        <p className="font-mono text-xs break-all text-muted-foreground">{event.code}</p>
      ) : null}
    </li>
  );
}

export function EventLogSection({ events, onClear, onExport }: EventLogSectionProps) {
  return (
    <section aria-label="Event log" className="mx-auto w-full max-w-3xl px-6 pb-6">
      <SettingsSection
        title="Event log"
        description="Recent errors and timings, with credentials removed. Stored only on this device and never sent anywhere."
      >
        <div className="mb-3 flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={events.length === 0}
            onClick={() => void onExport().then(downloadEventLog)}
          >
            Export log
          </Button>
          <Button variant="outline" disabled={events.length === 0} onClick={() => void onClear()}>
            Clear log
          </Button>
        </div>
        <Tabs defaultValue="all">
          <TabsList aria-label="Filter events by kind">
            {FILTERS.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value}>
                {filter.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {FILTERS.map((filter) => {
            const shown =
              filter.value === 'all'
                ? events
                : events.filter((event) => event.kind === filter.value);
            return (
              <TabsContent key={filter.value} value={filter.value}>
                {shown.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">No events recorded.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {shown.map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))}
                  </ul>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </SettingsSection>
    </section>
  );
}
