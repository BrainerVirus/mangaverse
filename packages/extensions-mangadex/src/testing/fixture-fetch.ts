import { readFileSync } from 'node:fs';

function loadFixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

let cached: { search: string; detail: string; feed: string; atHome: string } | null = null;

function fixtures() {
  cached ??= {
    search: loadFixture('search.json'),
    detail: loadFixture('detail.json'),
    feed: loadFixture('feed.json'),
    atHome: loadFixture('at-home.json'),
  };
  return cached;
}

/**
 * Serves recorded MangaDex fixtures for known URL patterns and 404s anything
 * else, so contract and mapping tests never hit the network and a provider
 * call to an unexpected endpoint fails loudly.
 */
export function createFixtureFetch(): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    let body: string | null = null;
    if (url.includes('/at-home/server/')) {
      body = fixtures().atHome;
    } else if (/\/manga\/[^/?]+\/feed/.test(url)) {
      body = fixtures().feed;
    } else if (/\/manga\/[^/?]+(\?|$)/.test(url)) {
      body = fixtures().detail;
    } else if (url.includes('/manga?')) {
      body = fixtures().search;
    }

    if (body === null) {
      return new Response('fixture not found', { status: 404 });
    }
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}
