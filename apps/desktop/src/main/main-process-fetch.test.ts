import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchMainProcessBytes,
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  NetworkFetchError,
  nodeRequestHop,
  settleByDeadline,
  type HopReply,
  type HopRequest,
  type RequestHop,
} from './main-process-fetch.js';

const initialUrl = 'https://example.com/page.png';

function hopFrom(script: (request: HopRequest) => HopReply | Promise<HopReply>): RequestHop & {
  mock: { calls: HopRequest[][] };
} {
  return vi.fn<RequestHop>(async (request) => script(request)) as never;
}

function body(status = 200): HopReply {
  return {
    kind: 'response',
    status,
    headers: { 'content-type': 'image/png' },
    body: Buffer.from([1, 2, 3]),
    finalUrl: initialUrl,
  };
}

function redirect(location: string): HopReply {
  return { kind: 'redirect', location };
}

const publicDns = async (): Promise<readonly string[]> => ['93.184.216.34'];
const allowAll = async (): Promise<boolean> => true;

function transport(
  requestHop: RequestHop,
  resolveHostAddresses: (hostname: string) => Promise<readonly string[]> = publicDns,
) {
  return { requestHop, resolveHostAddresses };
}

describe('fetchMainProcessBytes', () => {
  it('reads a body through the pinned address and returns its mime type', async () => {
    const requestHop = hopFrom(() => body());
    const isAllowed = vi.fn<(url: string) => Promise<boolean>>(allowAll);

    const result = await fetchMainProcessBytes(initialUrl, isAllowed, transport(requestHop));

    expect(result.mimeType).toBe('image/png');
    expect(new Uint8Array(result.data)).toEqual(new Uint8Array([1, 2, 3]));
    expect(isAllowed).toHaveBeenCalledOnce();
    expect(requestHop).toHaveBeenCalledOnce();
    expect(requestHop.mock.calls[0]?.[0]).toMatchObject({
      address: '93.184.216.34',
      family: 4,
    });
    expect(requestHop.mock.calls[0]?.[0]?.url.toString()).toBe(initialUrl);
  });

  it('follows a redirect and resolves the next address before the hop', async () => {
    const requestHop = hopFrom((request) =>
      request.url.hostname === 'example.com'
        ? redirect('https://cdn.example.com/page.png')
        : body(),
    );
    const resolveHostAddresses = vi.fn<(hostname: string) => Promise<readonly string[]>>(
      async (hostname) => (hostname === 'cdn.example.com' ? ['93.184.216.35'] : ['93.184.216.34']),
    );
    const isAllowed = vi.fn<(url: string) => Promise<boolean>>(allowAll);

    const result = await fetchMainProcessBytes(
      initialUrl,
      isAllowed,
      transport(requestHop, resolveHostAddresses),
    );

    expect(result.mimeType).toBe('image/png');
    expect(isAllowed.mock.calls.map(([url]) => url)).toEqual([
      initialUrl,
      'https://cdn.example.com/page.png',
    ]);
    expect(requestHop).toHaveBeenCalledTimes(2);
    expect(requestHop.mock.calls[1]?.[0]).toMatchObject({ address: '93.184.216.35' });
  });

  it.each([
    '127.0.0.1',
    '10.0.0.7',
    '169.254.169.254',
    '192.168.1.10',
    '0.0.0.0',
    '224.0.0.1',
    '100.64.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('refuses a host that resolves to %s', async (address) => {
    const requestHop = hopFrom(() => body());

    await expect(
      fetchMainProcessBytes(
        initialUrl,
        allowAll,
        transport(requestHop, async () => [address]),
      ),
    ).rejects.toMatchObject({ code: 'network.blocked-address' });
    expect(requestHop).not.toHaveBeenCalled();
  });

  it('refuses when any resolved address is private, even if another is public', async () => {
    const requestHop = hopFrom(() => body());

    await expect(
      fetchMainProcessBytes(
        initialUrl,
        allowAll,
        transport(requestHop, async () => ['93.184.216.34', '10.0.0.7']),
      ),
    ).rejects.toMatchObject({ code: 'network.blocked-address' });
    expect(requestHop).not.toHaveBeenCalled();
  });

  it('refuses a loopback hostname before resolving it', async () => {
    const resolveHostAddresses = vi.fn<(hostname: string) => Promise<readonly string[]>>(publicDns);
    const requestHop = hopFrom(() => body());

    await expect(
      fetchMainProcessBytes(
        'http://localhost/page.png',
        allowAll,
        transport(requestHop, resolveHostAddresses),
      ),
    ).rejects.toMatchObject({ code: 'network.blocked-url' });
    expect(resolveHostAddresses).not.toHaveBeenCalled();
    expect(requestHop).not.toHaveBeenCalled();
  });

  it('rejects a redirect to a private address before the hop', async () => {
    const requestHop = hopFrom(() => redirect('http://internal.example/secret'));

    await expect(
      fetchMainProcessBytes(
        initialUrl,
        allowAll,
        transport(requestHop, async (hostname) =>
          hostname === 'example.com' ? ['93.184.216.34'] : ['127.0.0.1'],
        ),
      ),
    ).rejects.toMatchObject({ code: 'network.blocked-address' });
    expect(requestHop).toHaveBeenCalledTimes(1);
  });

  it('closes a simulated rebind: the second answer is validated and refused', async () => {
    let lookups = 0;
    const requestHop = hopFrom(() => redirect('https://example.com/second'));
    const resolveHostAddresses = vi.fn<(hostname: string) => Promise<readonly string[]>>(
      async () => {
        lookups += 1;
        return lookups === 1 ? ['93.184.216.34'] : ['127.0.0.1'];
      },
    );

    await expect(
      fetchMainProcessBytes(initialUrl, allowAll, transport(requestHop, resolveHostAddresses)),
    ).rejects.toMatchObject({ code: 'network.blocked-address' });
    expect(requestHop).toHaveBeenCalledTimes(1);
  });

  it('stops after five redirects', async () => {
    let hop = 0;
    const requestHop = hopFrom(() => {
      hop += 1;
      return redirect(`https://example.com/${hop}`);
    });

    await expect(
      fetchMainProcessBytes('https://example.com/0', allowAll, transport(requestHop)),
    ).rejects.toMatchObject({ code: 'network.redirect-limit' });
    // Initial request plus five followed redirects; the sixth is rejected.
    expect(requestHop).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it('rejects a redirect without a usable location', async () => {
    const requestHop = hopFrom(() => redirect('http://[::1'));

    await expect(
      fetchMainProcessBytes(initialUrl, allowAll, transport(requestHop)),
    ).rejects.toMatchObject({ code: 'network.invalid-url' });
    expect(requestHop).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect the allowlist rejects, before resolving it', async () => {
    const requestHop = hopFrom(() => redirect('https://evil.example/page.png'));
    const isAllowed = async (url: string) => url === initialUrl;
    const resolveHostAddresses = vi.fn<(hostname: string) => Promise<readonly string[]>>(publicDns);

    await expect(
      fetchMainProcessBytes(initialUrl, isAllowed, transport(requestHop, resolveHostAddresses)),
    ).rejects.toMatchObject({ code: 'network.blocked-url' });
    expect(resolveHostAddresses).toHaveBeenCalledOnce();
    expect(requestHop).toHaveBeenCalledOnce();
  });

  it('fails on a transport error', async () => {
    const requestHop = hopFrom(() => {
      throw new NetworkFetchError('network.transport-error', 'refused');
    });

    await expect(
      fetchMainProcessBytes(initialUrl, allowAll, transport(requestHop)),
    ).rejects.toMatchObject({ code: 'network.transport-error' });
  });

  it('aborts a response larger than the byte cap', async () => {
    const requestHop = hopFrom(() => ({
      kind: 'response',
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: Buffer.alloc(MAX_RESPONSE_BYTES + 1),
      finalUrl: initialUrl,
    }));

    await expect(
      fetchMainProcessBytes(initialUrl, allowAll, transport(requestHop)),
    ).rejects.toMatchObject({ code: 'network.body-too-large' });
  });

  it('returns a typed error for an empty body and a failed status', async () => {
    const empty = hopFrom(() => ({
      kind: 'response',
      status: 200,
      headers: {},
      body: Buffer.alloc(0),
      finalUrl: initialUrl,
    }));
    const failed = hopFrom(() => body(404));

    await expect(
      fetchMainProcessBytes(initialUrl, allowAll, transport(empty)),
    ).rejects.toMatchObject({ code: 'network.empty-body' });
    await expect(
      fetchMainProcessBytes(initialUrl, allowAll, transport(failed)),
    ).rejects.toMatchObject({ code: 'network.http-status' });
  });

  it('fails a hop that outlives the deadline', async () => {
    const requestHop = hopFrom(
      (request) =>
        new Promise<HopReply>((resolve) => {
          setTimeout(() => resolve(body()), Math.max(0, request.deadline - Date.now()) + 50);
        }),
    );

    await expect(
      fetchMainProcessBytes(initialUrl, allowAll, transport(requestHop), Date.now() + 10),
    ).rejects.toMatchObject({ code: expect.stringMatching(/timeout|transport-error/) });
  });

  it('shares the deadline between DNS and the hop', async () => {
    const requestHop = hopFrom(() => body());

    await expect(
      fetchMainProcessBytes(
        initialUrl,
        allowAll,
        transport(requestHop, () => new Promise<readonly string[]>(() => undefined)),
        Date.now() + 10,
      ),
    ).rejects.toMatchObject({ code: 'network.timeout' });
    expect(requestHop).not.toHaveBeenCalled();
  });

  it('settles a validation that rejects after the deadline already passed', async () => {
    let reject: ((error: Error) => void) | undefined;
    const work = new Promise<boolean>((_resolve, onReject) => {
      reject = onReject;
    });
    const unhandled = vi.fn<(...args: unknown[]) => void>();
    process.on('unhandledRejection', unhandled);
    try {
      await expect(settleByDeadline(work, Date.now() - 1)).resolves.toBeUndefined();
      reject?.(new Error('late lookup failure'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('treats a rejected validation as disallowed', async () => {
    const requestHop = hopFrom(() => body());

    await expect(
      fetchMainProcessBytes(
        initialUrl,
        async () => {
          throw new Error('lookup failed');
        },
        transport(requestHop),
      ),
    ).rejects.toMatchObject({ code: 'network.blocked-url' });
    expect(requestHop).not.toHaveBeenCalled();
  });

  it('charges DNS time against the deadline', async () => {
    const requestHop = hopFrom(() => body());
    const deadline = Date.now() + 20;

    await expect(
      fetchMainProcessBytes(
        initialUrl,
        allowAll,
        transport(requestHop, async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 35));
          return ['93.184.216.34'];
        }),
        deadline,
      ),
    ).rejects.toMatchObject({ code: 'network.timeout' });
    expect(requestHop).not.toHaveBeenCalled();
  });
});

describe('nodeRequestHop', () => {
  const servers: Server[] = [];

  async function serve(
    handler: Parameters<typeof createServer>[1],
  ): Promise<{ readonly port: number; readonly host: string }> {
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return { port: address.port, host: '127.0.0.1' };
  }

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
    );
  });

  it('connects to the pinned address while keeping the URL host', async () => {
    let seenHost: string | undefined;
    const { port } = await serve((request, response) => {
      seenHost = request.headers.host;
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('pinned');
    });

    const reply = await nodeRequestHop({
      url: new URL(`http://example.com:${port}/path`),
      address: '127.0.0.1',
      family: 4,
      deadline: Date.now() + 5_000,
    });

    expect(reply).toMatchObject({ kind: 'response', status: 200 });
    expect(seenHost).toBe(`example.com:${port}`);
    expect(reply.kind === 'response' ? reply.body.toString() : null).toBe('pinned');
  });

  it('returns a redirect without reading the body', async () => {
    const { port } = await serve((_request, response) => {
      response.writeHead(302, { location: 'https://cdn.example/page.png' });
      response.end();
    });

    const reply = await nodeRequestHop({
      url: new URL(`http://example.com:${port}/`),
      address: '127.0.0.1',
      family: 4,
      deadline: Date.now() + 5_000,
    });

    expect(reply).toEqual({ kind: 'redirect', location: 'https://cdn.example/page.png' });
  });

  it('refuses a declared body over the cap before reading it', async () => {
    const { port } = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': String(MAX_RESPONSE_BYTES + 1) });
      response.end();
    });

    await expect(
      nodeRequestHop({
        url: new URL(`http://example.com:${port}/`),
        address: '127.0.0.1',
        family: 4,
        deadline: Date.now() + 5_000,
      }),
    ).rejects.toMatchObject({ code: 'network.body-too-large' });
  });

  it('aborts a stalled connection at the hop deadline', async () => {
    const { port } = await serve(() => {
      // Never responds.
    });

    await expect(
      nodeRequestHop({
        url: new URL(`http://example.com:${port}/`),
        address: '127.0.0.1',
        family: 4,
        deadline: Date.now() + 60,
      }),
    ).rejects.toMatchObject({ code: 'network.timeout' });
  });
});
