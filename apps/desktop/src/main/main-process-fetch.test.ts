import { EventEmitter } from 'node:events';
import type { ClientRequest, ClientRequestConstructorOptions, IncomingMessage } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { fetchMainProcessBytes } from './main-process-fetch.js';

type FakeRequest = EventEmitter & {
  end: () => void;
  abort: () => void;
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
    return req as unknown as ClientRequest;
  });
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

function redirect(req: FakeRequest, location: string): void {
  req.emit('redirect', 302, 'GET', location, {});
  // Electron cancels a manual redirect when followRedirect() is not called.
  req.emit('error', new Error('Redirect was cancelled'));
  req.emit('close');
}

const initialUrl = 'https://example.com/page.png';

describe('fetchMainProcessBytes', () => {
  it('follows a public redirect only after validating the new host', async () => {
    const request = requestFactory((options, req) => {
      if (options.url === initialUrl) {
        redirect(req, 'https://cdn.example.com/page.png');
        return;
      }
      const res = response(req, 200, { 'content-type': 'image/png' });
      res.emit('data', Buffer.from([1, 2, 3]));
      res.emit('end');
    });
    const isAllowed = vi.fn<(url: string) => Promise<boolean>>(
      async (url) => !url.includes('127.0.0.1'),
    );

    const result = await fetchMainProcessBytes(request as never, initialUrl, isAllowed);

    expect(result?.mimeType).toBe('image/png');
    expect(new Uint8Array(result!.data)).toEqual(new Uint8Array([1, 2, 3]));
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
      req.emit('redirect', 302, 'GET', 'http://[::1', {});
      req.emit('error', new Error('Redirect was cancelled'));
      req.emit('close');
    });

    const result = await fetchMainProcessBytes(request as never, initialUrl, async () => true);

    expect(result).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('aborts a response larger than the byte cap', async () => {
    const request = requestFactory((_options, req) => {
      const res = response(req, 200, { 'content-type': 'image/png' });
      res.emit('data', { byteLength: 64 * 1024 * 1024 + 1 });
    });

    const result = await fetchMainProcessBytes(request as never, initialUrl, async () => true);

    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty or failed response', async () => {
    const empty = requestFactory((_options, req) => {
      const res = response(req, 200, {});
      res.emit('end');
    });
    const failed = requestFactory((_options, req) => {
      response(req, 404, {});
    });

    expect(
      await fetchMainProcessBytes(empty as never, initialUrl, async () => true),
    ).toBeUndefined();
    expect(
      await fetchMainProcessBytes(failed as never, initialUrl, async () => true),
    ).toBeUndefined();
  });
});
