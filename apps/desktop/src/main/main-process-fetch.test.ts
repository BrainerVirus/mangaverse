import { EventEmitter } from 'node:events';
import type { ClientRequest, ClientRequestConstructorOptions, IncomingMessage } from 'electron';
import { describe, expect, it, vi, type MockInstance } from 'vitest';
import { fetchMainProcessBytes } from './main-process-fetch.js';

type FakeRequest = EventEmitter & {
  end: () => void;
  abort: () => void;
  followRedirect?: () => void;
  destroy?: () => void;
};

type FakeResponse = EventEmitter & {
  statusCode: number;
  headers: Record<string, string | string[]>;
};

function requestFactory(
  script: (options: ClientRequestConstructorOptions, req: FakeRequest) => void,
) {
  return vi.fn<(options: ClientRequestConstructorOptions) => ClientRequest>((options) => {
    const req = new EventEmitter() as FakeRequest;
    req.end = () => {
      queueMicrotask(() => script(options, req));
    };
    req.abort = () => {
      req.emit('close');
    };
    req.followRedirect = vi.fn<() => void>();
    return req as unknown as ClientRequest;
  });
}

/** Electron 44 emits finish then close right after end(), before response/redirect. */
function sent(req: FakeRequest): void {
  req.emit('finish');
  req.emit('close');
}

function response(
  req: FakeRequest,
  status: number,
  headers: Record<string, string | string[]>,
): FakeResponse {
  const res = new EventEmitter() as FakeResponse;
  res.statusCode = status;
  res.headers = headers;
  req.emit('response', res as unknown as IncomingMessage);
  return res;
}

function body(req: FakeRequest, mimeType = 'image/png'): void {
  sent(req);
  const res = response(req, 200, { 'content-type': mimeType });
  res.emit('data', Buffer.from([1, 2, 3]));
  res.emit('end');
}

function redirect(req: FakeRequest, location: string): void {
  sent(req);
  req.emit('redirect', 302, 'GET', location, {});
  // Electron cancels a manual redirect when followRedirect() is not called.
  req.emit('error', new Error('Redirect was cancelled'));
  req.emit('close');
}

const initialUrl = 'https://example.com/page.png';

describe('fetchMainProcessBytes', () => {
  it('reads a body when finish and close arrive before the response', async () => {
    const request = requestFactory((_options, req) => body(req));
    const isAllowed = vi.fn<(url: string) => Promise<boolean>>(async () => true);

    const result = await fetchMainProcessBytes(request as never, initialUrl, isAllowed);

    expect(result?.mimeType).toBe('image/png');
    expect(new Uint8Array(result!.data)).toEqual(new Uint8Array([1, 2, 3]));
    expect(isAllowed).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
  });

  it('follows a redirect that arrives after close, without following it inline', async () => {
    let followRedirect: (() => void) | undefined;
    const request = requestFactory((options, req) => {
      if (options.url === initialUrl) {
        followRedirect = req.followRedirect;
        redirect(req, 'https://cdn.example.com/page.png');
        return;
      }
      body(req);
    });
    const isAllowed = vi.fn<(url: string) => Promise<boolean>>(
      async (url) => !url.includes('127.0.0.1'),
    );

    const result = await fetchMainProcessBytes(request as never, initialUrl, isAllowed);

    expect(result?.mimeType).toBe('image/png');
    expect(new Uint8Array(result!.data)).toEqual(new Uint8Array([1, 2, 3]));
    expect(followRedirect).not.toHaveBeenCalled();
    expect(isAllowed.mock.calls.map(([url]) => url)).toEqual([
      initialUrl,
      'https://cdn.example.com/page.png',
    ]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      url: 'https://cdn.example.com/page.png',
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      useSessionCookies: false,
      referrerPolicy: 'no-referrer',
    });
  });

  it('rejects a redirect to a private host before requesting it', async () => {
    const request = requestFactory((_options, req) => {
      redirect(req, 'http://127.0.0.1/secret');
    });
    const isAllowed = vi.fn<(url: string) => Promise<boolean>>(
      async (url) => !url.includes('127.0.0.1'),
    );

    const result = await fetchMainProcessBytes(request as never, initialUrl, isAllowed);

    expect(result).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    expect(isAllowed.mock.calls.map(([url]) => url)).toEqual([
      initialUrl,
      'http://127.0.0.1/secret',
    ]);
  });

  it('stops after five redirects', async () => {
    let hop = 0;
    const request = requestFactory((_options, req) => {
      hop += 1;
      redirect(req, `https://example.com/${hop}`);
    });

    const result = await fetchMainProcessBytes(
      request as never,
      'https://example.com/0',
      async () => true,
    );

    expect(result).toBeUndefined();
    // Initial request plus five followed redirects; the sixth is rejected.
    expect(request).toHaveBeenCalledTimes(6);
  });

  it('rejects a redirect without a usable location', async () => {
    const request = requestFactory((_options, req) => {
      sent(req);
      req.emit('redirect', 302, 'GET', 'http://[::1', {});
      req.emit('error', new Error('Redirect was cancelled'));
    });

    const result = await fetchMainProcessBytes(request as never, initialUrl, async () => true);

    expect(result).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('fails on a transport error', async () => {
    const request = requestFactory((_options, req) => {
      sent(req);
      req.emit('error', new Error('net::ERR_CONNECTION_REFUSED'));
    });

    const result = await fetchMainProcessBytes(request as never, initialUrl, async () => true);

    expect(result).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('aborts a response larger than the byte cap', async () => {
    const request = requestFactory((_options, req) => {
      sent(req);
      const res = response(req, 200, { 'content-type': 'image/png' });
      res.emit('data', { byteLength: 64 * 1024 * 1024 + 1 });
    });

    const result = await fetchMainProcessBytes(request as never, initialUrl, async () => true);

    expect(result).toBeUndefined();
  });

  it('still caps the body after a redirect hop', async () => {
    const request = requestFactory((options, req) => {
      if (options.url === initialUrl) {
        redirect(req, 'https://cdn.example.com/page.png');
        return;
      }
      sent(req);
      const res = response(req, 200, { 'content-type': 'image/png' });
      res.emit('data', { byteLength: 64 * 1024 * 1024 + 1 });
    });

    const result = await fetchMainProcessBytes(request as never, initialUrl, async () => true);

    expect(result).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('returns undefined for an empty or failed response', async () => {
    const empty = requestFactory((_options, req) => {
      sent(req);
      const res = response(req, 200, {});
      res.emit('end');
    });
    const failed = requestFactory((_options, req) => {
      sent(req);
      response(req, 404, {});
    });

    expect(
      await fetchMainProcessBytes(empty as never, initialUrl, async () => true),
    ).toBeUndefined();
    expect(
      await fetchMainProcessBytes(failed as never, initialUrl, async () => true),
    ).toBeUndefined();
  });

  it('does not settle on an early close; the bounded timeout fails the hop', async () => {
    vi.useFakeTimers();
    try {
      const request = requestFactory((_options, req) => {
        sent(req);
      });
      let resolved = false;
      const pending = fetchMainProcessBytes(request as never, initialUrl, async () => true).then(
        (value) => {
          resolved = true;
          return value;
        },
      );

      await vi.advanceTimersByTimeAsync(1_000);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts the in-flight request when a hop times out', async () => {
    vi.useFakeTimers();
    try {
      let abort: MockInstance<() => void> | undefined;
      const request = requestFactory((_options, req) => {
        sent(req);
        abort = vi.spyOn(req, 'abort');
      });
      const pending = fetchMainProcessBytes(request as never, initialUrl, async () => true);

      await vi.advanceTimersByTimeAsync(0);
      const abortSpy = abort;
      expect(abortSpy).toBeDefined();

      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pending).resolves.toBeUndefined();
      expect(abortSpy).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles a fetch whose validation never resolves', async () => {
    vi.useFakeTimers();
    try {
      const request = requestFactory((_options, req) => body(req));
      let settled: unknown = 'pending';
      const pending = fetchMainProcessBytes(
        request as never,
        initialUrl,
        () => new Promise<boolean>(() => {}),
      ).then((value) => {
        settled = value;
        return value;
      });

      await vi.advanceTimersByTimeAsync(59_999);
      expect(settled).toBe('pending');

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeUndefined();
      expect(request).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a rejected validation as disallowed', async () => {
    const request = requestFactory((_options, req) => body(req));

    const result = await fetchMainProcessBytes(request as never, initialUrl, async () => {
      throw new Error('lookup failed');
    });

    expect(result).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it('charges a slow validation against the deadline', async () => {
    vi.useFakeTimers();
    try {
      const request = requestFactory((_options, req) => {
        sent(req); // The hop stalls.
      });
      let settled: unknown = 'pending';
      const pending = fetchMainProcessBytes(request as never, initialUrl, async () => {
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 40_000));
        return true;
      }).then((value) => {
        settled = value;
        return value;
      });

      await vi.advanceTimersByTimeAsync(40_000);
      expect(request).toHaveBeenCalledOnce();

      // 40s of validation leaves 20s, not a fresh 30s hop timeout.
      await vi.advanceTimersByTimeAsync(19_999);
      expect(settled).toBe('pending');

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores data and end that arrive after the hop timeout', async () => {
    vi.useFakeTimers();
    const concat = vi.spyOn(Buffer, 'concat');
    try {
      let late: FakeResponse | undefined;
      const request = requestFactory((_options, req) => {
        sent(req);
        late = response(req, 200, { 'content-type': 'image/png' });
        // Buffered before the timeout: a late end would concat it.
        late.emit('data', Buffer.from([1, 2, 3]));
      });
      const pending = fetchMainProcessBytes(request as never, initialUrl, async () => true);

      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pending).resolves.toBeUndefined();
      expect(late).toBeDefined();

      let lateReads = 0;
      late!.emit('data', {
        get byteLength() {
          lateReads += 1;
          return 1;
        },
      });
      late!.emit('end');

      expect(lateReads).toBe(0);
      expect(concat).not.toHaveBeenCalled();
    } finally {
      concat.mockRestore();
      vi.useRealTimers();
    }
  });

  it('enforces the overall deadline across slow hops', async () => {
    vi.useFakeTimers();
    try {
      const request = requestFactory((options, req) => {
        sent(req);
        if (options.url === 'https://example.com/final') {
          return; // Third hop stalls.
        }
        const next =
          options.url === initialUrl ? 'https://example.com/second' : 'https://example.com/final';
        setTimeout(() => {
          req.emit('redirect', 302, 'GET', next, {});
          req.emit('error', new Error('Redirect was cancelled'));
        }, 20_000);
      });
      let settled: unknown = 'pending';
      const pending = fetchMainProcessBytes(request as never, initialUrl, async () => true).then(
        (value) => {
          settled = value;
          return value;
        },
      );

      await vi.advanceTimersByTimeAsync(40_000);
      expect(request).toHaveBeenCalledTimes(3);

      // Two 20s hops leave 20s of the 60s deadline, so the third hop must fail at
      // 60s rather than after its own 30s hop timeout at 70s.
      await vi.advanceTimersByTimeAsync(21_000);
      expect(settled).toBeUndefined();

      await vi.runOnlyPendingTimersAsync();
      await expect(pending).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
