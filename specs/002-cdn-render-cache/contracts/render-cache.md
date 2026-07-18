# API Contract: CDN-Cached Render/Cover Responses

Applies to `GET /api/render` and `GET /api/cover`.

## Request

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `token` | string | No | Same token as [001-tmdb-byo-key](../../001-tmdb-byo-key/contracts/tmdb-key-param.md). If it resolves to a profile with a registered ImageKit credential, caching is active for this request. |
| `imagekit_key` | string | No | Direct ImageKit private API key, secondary mechanism, same precedence rule as `tmdb_key` (direct wins if both present). |

All existing render/cover parameters (dimensions, preset, `imgs=`, `catalog=`, overlays,
etc.) are unchanged and, together, determine the cache key (`configHash` in data-model.md)
— `token`/`imagekit_key`/`tmdb_key`/`key` are excluded from that hash.

## Response

### No CDN credential resolves (today's behavior, unchanged)

`200`, `Content-Type: image/png`, image bytes in the body. Identical to pre-feature
behavior (spec FR-002, SC-003).

### CDN credential resolves, cache miss or stale

`200`, `Content-Type: image/png`, image bytes in the body — **same as today** from the
caller's perspective; the difference (upload to the caller's CDN) happens server-side and
does not change this response.

### CDN credential resolves, cache hit (fresh)

`302 Found`, `Location: <caller's ImageKit delivery URL>`, no image body. This is the one
conditional response-shape change this feature introduces (research.md Decision 1) —
transparent to callers that follow redirects (browsers, `<img>` tags, `curl -L`, Nuvio),
visible to callers that inspect raw status codes.

### CDN operation fails at any point (invalid credential, network error, quota, etc.)

`200`, `Content-Type: image/png`, image bytes in the body — identical to the "no credential
resolves" case. The caller is never exposed to a CDN-side failure (spec FR-011); the only
observable effect is that caching silently didn't happen for that request.

## Non-goals of this contract

- No header or field indicates whether a `200` response was itself freshly rendered or
  (hypothetically) served some other way — a `200` always means "here are today's bytes,"
  a `302` always means "here's where they already are." There is no ambiguous third state.
- No endpoint exposes the caller's cache contents/list directly (out of scope, per spec's
  Assumptions — no admin/analytics surface).
