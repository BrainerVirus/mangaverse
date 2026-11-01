# 10. Web - spec

Status: designed, not scheduled. It starts after the Electron milestones, and gateway work is gated on a
real-site test the owner has deferred.

## Problem

A website can read another site only if that site allows it through CORS. MangaDex
[does not, and requires other sites to proxy API and image requests](https://api.mangadex.org/docs/2-limitations/),
with limits per IP. A page load with no server fails, and storage is limited by the browser.

## Decisions

| #   | Decision                                                                                                                            | Why                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| W1  | Invite-only accounts on Supabase, verified by the gateway.                                                                          | Strangers cannot use the gateway, and a user can be disabled.                     |
| W2  | Host on Cloudflare: static assets, Worker gateway, Durable Objects, KV, cache. No Vercel or Redis.                                  | Free at small scale; hitting Vercel limits can pause a project for up to 30 days. |
| W3  | The gateway only fetches and caches. Recipes run on the device.                                                                     | Parsing avoids Workers' 10 ms CPU limit, and recipes stay shared with Electron.   |
| W4  | Route order per recipe: local data, direct where CORS allows, then gateway.                                                         | Avoids the shared route when it can.                                              |
| W5  | Only owner-approved recipes run through the gateway.                                                                                | They use a shared IP and the owner's account.                                     |
| W6  | Metadata may be cached briefly on the gateway. Pages are streamed to the requester and never stored.                                | Reduces traffic without hosting pages (D4).                                       |
| W7  | Limits: allowlisted hosts, no private addresses, bounded size and time, per-user and per-site rate limits, and a daily budget stop. | The gateway must not become an open proxy.                                        |
| W8  | SQLite in a Worker with one owning tab; pages as OPFS files. Needs a phone test and ADR.                                            | Same data-host shape as Electron. Hard to reverse on web.                         |
| W9  | Client-rendered shell with a service worker. Updates ask first.                                                                     | Offline start, with no reader swapped mid-chapter.                                |
| W10 | Downloads run while the app is open and resume on launch.                                                                           | iOS has no background download APIs.                                              |
| W11 | No phone bridge, browser extension or App Store wrapper.                                                                            | The owner rejected their setup burden.                                            |

### Gate before building the gateway

Deploy a throwaway Worker and try MangaDex and two or three sites the owner picks: API and images, what
headers arrive, and whether the sites accept it. MangaDex forbids `Via` headers and needs a real
User-Agent. If most sites refuse, reconsider the website's provider scope before building further.

### Rough capacity

Free Workers allow 100,000 requests a day. At about 30 images a chapter, that is roughly 3,000 chapters a
day. Workers Paid starts at $5 a month. Verify limits again when this starts.

## What happens when something fails

| What fails                       | What still works                               | What the user sees                                   |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| No internet                      | Library, progress, downloads, cached pages     | Quiet offline indicator                              |
| Daily budget reached             | Everything on the device                       | Online reading resumes at midnight UTC               |
| Gateway or Cloudflare down       | Everything on the device, and Electron         | "Can't reach the service" with retry                 |
| Cloudflare account suspended     | Installed apps and local data; Electron        | Redeploy to another host; the gateway stays portable |
| Supabase paused or down          | Existing sessions until expiry, local content  | New logins wait; local use is never blocked          |
| Provider down                    | Other providers, older cached data             | "Showing saved info" with retry                      |
| Provider rate limits the gateway | Queued requests, cached data                   | "Busy, trying again shortly"                         |
| Provider blocks the gateway      | Other providers, and that provider on Electron | "Not available on web"                               |
| Rate limiter unavailable         | Cached data                                    | New fetches stop rather than risk a ban              |
| Takedown request                 | Other providers                                | Recipe disabled at once by a KV kill switch          |

## Limits to state plainly

- iPhone: without adding to the Home Screen, storage can be wiped after 7 days of Safari use without
  visiting the site. Downloads pause when the app closes. Fullscreen is iPad-only.
- No browser guarantees storage, so export matters.
- A block on the gateway affects every web user of that provider.
- The gateway fetches and transmits pages itself, which is the highest legal exposure in this product.
  Keep it private, and get legal advice before any public use.

## Behavior

- Given the web build, When SSR is dropped, Then Nitro remains only if the host needs it for the gateway, and the shell is static.
- Given no account, When the website opens, Then sign-in is required and no gateway request succeeds.
- Given an uninvited sign-up, When attempted, Then it is refused.
- Given a disabled user, When their token is used, Then the gateway refuses it soon after.
- Given a signed-in user with an expired session and no network, When the app opens, Then local content and downloads still open.
- Given a gateway request to a host off the allowlist or a private address, When sent, Then it returns 4xx with no outbound request.
- Given an upstream redirect off the allowlist, When followed, Then it is refused.
- Given a 429 with `Retry-After`, When more requests arrive, Then that site is not called until that time.
- Given one user over their limit, When others read, Then the others are unaffected.
- Given the daily budget is reached, When more requests arrive, Then the gateway stops itself with a clear message.
- Given the app loaded once and the server is gone, When it reloads, Then the shell and library open.
- Given a downloaded chapter and no network, When it opens, Then every page renders.
- Given two tabs, When one changes data, Then the other sees it, and if the owning tab closes the other takes over.
- Given an iPhone in Safari, When the app is not installed, Then it explains the storage risk and how to install.
- Given a new version while reading, When it is ready, Then the app asks first.
- Given a touch device, When any primary route renders, Then interactive targets measure at least 44px.

## Out of scope

Public launch, rotating hosts, persistently hosted pages, and a paired helper, which was rejected.
