# 5. Providers - spec

## Problem

Third-party providers cannot run. Installing stores only a manifest, and MangaDex is compiled in.
Manifests declare coarse permissions and no domains. The contract is a method-bearing object, so nothing
declarative exists. MangaDex API calls and manifest checks use raw `fetch`, and a design-system fallback
loads provider images directly.

## Decisions

| #   | Decision                                                                                             | Why                                                                |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P1  | One injected transport carries every provider request, covers and pages included.                    | Providers then run unchanged on Electron and web.                  |
| P2  | Official API where one exists and is free, otherwise scraping, through one SDK.                      | Owner's model; official APIs are more stable and respectful.       |
| P3  | Recipes: URLs, parameters, pagination and selectors as validated data, run by one SDK engine.        | A recipe cannot run arbitrary code.                                |
| P4  | Manifests declare domains, shown before install; requests elsewhere are blocked.                     | Users see what a provider can reach, and the limit is enforceable. |
| P5  | Rate limits apply per provider on each device, and 429s and `Retry-After` are honored.               | Sources stay usable and users stay unblocked.                      |
| P6  | The core bundles official-API providers only. Scrapers are user-installed from a separate source.    | Keeps the core app clean, as `AGENTS.md` requires.                 |
| P7  | MangaDex stays code first, then moves to the shared contract through the transport.                  | It is the working reference while recipes are proven.              |
| P8  | Recipe format is proven against two or three real sources before it is frozen, with a version field. | Real sites decide the format, and old recipes must keep working.   |

### Recipe safety

Recipes are untrusted input. They use CSS selectors and a small set of named transforms, with no arbitrary
regular expressions unless run by a linear-time engine. Parsing has size, depth and time limits and runs off
the UI thread. Declared domains must be public hostnames, not IPs or wildcards above a registrable domain.
Recipe URLs can only substitute validated parameters. Network rules are enforced by the transport (spec 4).

Code providers in a sandboxed process are a later option, used only if recipes hit real limits.

## Behavior

- Given any provider request, When it runs, Then it goes through the transport; a check fails on raw `fetch` in providers.
- Given a request outside declared domains, When sent, Then it is blocked and logged.
- Given a recipe with a slow or oversized selector, or a huge response, When it runs, Then limits stop it and the UI stays responsive.
- Given a recipe redirected or resolved to a private address or an undeclared domain, When fetched, Then it is refused.
- Given a recipe URL, When installing, Then source, version, domains, languages and content flags show and confirmation is required.
- Given an invalid recipe, When installing, Then it is rejected with a clear reason.
- Given an installed recipe, When a user searches, opens a title and reads, Then the same flows work as MangaDex.
- Given a site layout change, When parsing fails validation, Then the provider is marked unavailable and bad results are not saved.
- Given a broken provider, When it fails, Then its error is isolated, others keep working, and it can be disabled.
- Given a 429 with `Retry-After`, When more requests are queued, Then the site is not called until that time.
- Given several providers, When one is slow, Then the others are unaffected.
- Given an anti-bot challenge, When a site returns one, Then the provider reports it is unavailable and does not try to bypass it.
- Given a provider update, When one exists, Then the user reviews changed domains before accepting.
- Given a scheduled live check, When MangaDex breaks, Then it fails without blocking PR CI.

## Out of scope

Bundled scrapers, a hosted public registry, provider login flows, anti-bot circumvention, and spoofing.
