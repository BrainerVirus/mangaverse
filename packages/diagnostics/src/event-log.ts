export type DiagnosticEventKind = 'error' | 'slow-provider-call' | 'reader-timing';

export interface DiagnosticEventInput {
  readonly kind: DiagnosticEventKind;
  readonly message: string;
  readonly code?: string;
  readonly providerId?: string;
  readonly durationMs?: number;
}

export interface DiagnosticEvent extends DiagnosticEventInput {
  readonly id: string;
  readonly at: string;
}

export interface EventLog {
  /** Never rejects: a logging failure must not break the work that produced the event. */
  record(event: DiagnosticEventInput): Promise<void>;
  /** Newest first. */
  list(): Promise<readonly DiagnosticEvent[]>;
  clear(): Promise<void>;
  /** The redacted log as JSON text. */
  export(): Promise<string>;
}

export interface EventLogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CreateEventLogOptions {
  /** Applied to all event text before it is kept and again when it is read back from storage. */
  readonly redact: (text: string) => string;
  /** Defaults to browser localStorage; any failure falls back to memory. */
  readonly storage?: EventLogStorage;
  readonly cap?: number;
  readonly now?: () => Date;
}

export const EVENT_LOG_CAP = 200;
/** Versioned so a future shape change can start clean instead of reading old records. */
export const EVENT_LOG_STORAGE_KEY = 'mangaverse.diagnostics.event-log.v1';

const KINDS: ReadonlySet<string> = new Set<DiagnosticEventKind>([
  'error',
  'slow-provider-call',
  'reader-timing',
]);

const browserStorage: EventLogStorage = {
  getItem: (key) => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  removeItem: (key) => globalThis.localStorage.removeItem(key),
};

type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/** Storage access throws when blocked, full or absent; the executor turns that into a value. */
function attempt<T>(operation: () => T): Promise<Attempt<T>> {
  return new Promise<T>((resolve) => resolve(operation())).then(
    (value): Attempt<T> => ({ ok: true, value }),
    (): Attempt<T> => ({ ok: false }),
  );
}

function redactEvent(event: DiagnosticEvent, redact: (text: string) => string): DiagnosticEvent {
  return {
    id: redact(event.id),
    at: event.at,
    kind: event.kind,
    message: redact(event.message),
    ...(event.code !== undefined ? { code: redact(event.code) } : {}),
    ...(event.providerId !== undefined ? { providerId: redact(event.providerId) } : {}),
    ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
  };
}

function isOptional(value: unknown, type: 'string' | 'number'): boolean {
  return value === undefined || typeof value === type;
}

function isStoredEvent(value: unknown): value is DiagnosticEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event['id'] === 'string' &&
    typeof event['at'] === 'string' &&
    !Number.isNaN(Date.parse(event['at'])) &&
    typeof event['kind'] === 'string' &&
    KINDS.has(event['kind']) &&
    typeof event['message'] === 'string' &&
    isOptional(event['code'], 'string') &&
    isOptional(event['providerId'], 'string') &&
    isOptional(event['durationMs'], 'number')
  );
}

/**
 * A bounded, redacted log that lives on this device only. It keeps at most
 * `cap` events oldest-first and never sends anything anywhere.
 */
export function createEventLog(options: CreateEventLogOptions): EventLog {
  const { redact, storage = browserStorage, cap = EVENT_LOG_CAP } = options;
  const now = options.now ?? (() => new Date());

  // Oldest first. Holds the log while storage cannot be trusted to hold it.
  let memory: readonly DiagnosticEvent[] = [];
  let storageBehind = false;
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = queue.then(work);
    queue = run.catch(() => undefined);
    return run;
  }

  async function load(): Promise<readonly DiagnosticEvent[]> {
    if (storageBehind) return memory;
    // Read on every operation so another tab's events are kept.
    const read = await attempt(() => {
      const raw = storage.getItem(EVENT_LOG_STORAGE_KEY);
      const parsed: unknown = raw === null ? [] : JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter(isStoredEvent).map((event) => redactEvent(event, redact))
        : [];
    });
    if (read.ok) memory = read.value.slice(-cap);
    return memory;
  }

  async function save(events: readonly DiagnosticEvent[]): Promise<void> {
    memory = events;
    const write = await attempt(() =>
      storage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(events)),
    );
    storageBehind = !write.ok;
  }

  const list = () =>
    enqueue(async () => {
      const events = await load();
      return [...events].reverse();
    });

  return {
    record: (input) =>
      enqueue(async () => {
        const at = now().toISOString();
        const id = `${at}-${Math.random().toString(36).slice(2, 10)}`;
        const event = redactEvent({ ...input, id, at }, redact);
        const events = await load();
        await save([...events, event].slice(-cap));
      }).catch(() => undefined),
    list,
    clear: () =>
      enqueue(async () => {
        memory = [];
        const removal = await attempt(() => storage.removeItem(EVENT_LOG_STORAGE_KEY));
        storageBehind = !removal.ok;
      }),
    export: async () => JSON.stringify({ events: await list() }, null, 2),
  };
}
