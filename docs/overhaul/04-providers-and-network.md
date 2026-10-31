# 4. Providers and network - spec

## Problem

A website can read another site only if that site allows it through CORS. MangaDex does not, and its
[limits page](https://api.mangadex.org/docs/2-limitations/) requires other sites to proxy API and image
requests, per IP. Third-party providers cannot run: installing stores only a manifest, and MangaDex is
compiled in. Manifests declare no domains. Several request paths skip any single transport.

## Decisions

| #   | Decision                                                                                   | Why                                                                |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| P1  | One injected transport carries every provider request, covers and pages included.          | Providers then work unchanged on every route and platform.         |
| P2  | Routes are tried in order: direct, extension, helper, hosted proxy.                        | Prefers the user's own IP, and uses the shared route last.         |
| P3  | Hosted proxy serves official-API providers only.                                           | Avoids scraping at scale from one server. See D3.                  |
| P4  | Manifests declare domains; requests elsewhere are blocked and domains show before install. | Users see what a provider can reach, and the block is enforceable. |
| P5  | Recipes first: URLs, parameters, pagination and selectors as data, run by one SDK engine.  | A recipe cannot run arbitrary code on the app's origin.            |
| P6  | Rate limits apply per provider on each device, and 429s are honored.                       | Sources stay usable and users stay unblocked.                      |
| P7  | Bundled: official-API providers only. Scrapers are user-installed from a separate source.  | Keeps the core app clean, as `AGENTS.md` requires.                 |
| P8  | Browser extension companion for desktop, Firefox and Android browsers that support it.     | User's own IP with no server to run.                               |
| P9  | Electron doubles as a helper; a headless version follows. Phones connect over HTTPS.       | The only route giving any phone browser the user's IP.             |

### Routes

| Route     | iPhone      | Android                            | Desktop    | Whose IP             | Scraping |
| --------- | ----------- | ---------------------------------- | ---------- | -------------------- | -------- |
| Direct    | CORS sites  | CORS sites                         | CORS sites | User's               | Rarely   |
| Extension | Not offered | Firefox; Edge curated; Chrome none | Yes        | User's               | Yes      |
| Helper    | Over HTTPS  | Over HTTPS                         | Yes        | Helper's, often home | Yes      |
| Proxy     | Yes         | Yes                                | Yes        | Shared               | No       |

Electron uses its own native requests and needs no other route.

### Hosted proxy

Allowlist of hosts, redirects refused outside it, private addresses blocked, size and time bounded, a
real non-spoofed User-Agent, no `Via` header, a global limit below MangaDex's numbers, and 429 and
`Retry-After` honored. It stores no pages. Images pass through it, so bandwidth bills to the host.

### Helper

Pairing uses a one-time QR code that grants a scoped, revocable token. Browsers block plain HTTP from
an HTTPS site, so a phone needs real HTTPS, such as Tailscale or a tunnel. Setup must be guided. When a
helper is unreachable, the app says so and keeps offering local content.

## Behavior

- Given a deployed origin, When Discover loads, Then MangaDex titles and covers arrive with no CORS errors.
- Given a deployed origin, When a chapter opens, Then real pages render and none is the hotlink placeholder.
- Given any provider request, When it runs, Then it goes through the transport; lint or a test catches raw `fetch` in providers.
- Given a request outside a provider's declared domains, When sent, Then it is blocked and logged.
- Given a proxy request for a host off the allowlist or a private address, When sent, Then it returns 4xx with no outbound request.
- Given an upstream redirect off the allowlist, When followed, Then it is refused.
- Given upstream sends 429 with `Retry-After`, When more requests arrive, Then upstream is not called until that time.
- Given requests over the global limit, When they arrive, Then upstream never sees more than the limit.
- Given a scraping recipe and no extension or helper, When a user tries it, Then the app explains what is needed and makes no proxy request.
- Given an installed extension, When a scraping recipe runs, Then requests leave from the user's browser.
- Given a recipe, When it is installed, Then source, version, domains and content flags show first and confirmation is required.
- Given a broken recipe, When it fails, Then its error is isolated and it can be disabled.
- Given a paired helper, When a phone requests a chapter, Then the helper fetches it and the phone caches it locally.
- Given a revoked token, When a phone calls the helper, Then it is refused.
- Given a scheduled live check, When MangaDex or the proxy breaks, Then it fails without blocking PR CI.

## Open for later

- A short-lived edge cache for titles and chapter lists on the proxy. It stores no pages or image-server URLs. Decide with real traffic numbers.
- Sandboxed code providers in a Worker, once recipes hit real limits.
- Exact recipe format, which needs testing against two or three real sources first.

## Out of scope

Hosted page storage, a shared page cache, anti-bot circumvention, spoofing, and rotating IPs.
