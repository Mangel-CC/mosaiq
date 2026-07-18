# Data Model: Generated Image Caching via User-Owned CDN (BYO CDN)

This feature stores nothing on mosaiq's server. Two kinds of data exist, both external to
mosaiq's own storage:

## Cached Render Asset (lives in the caller's ImageKit account, not on mosaiq)

| Field | Type | Notes |
|---|---|---|
| path | `string` | `mosaiq-cache/{configHash}--{freshnessToken}.png` (research.md Decision 3) |
| url | `string` | Returned by ImageKit on upload/list; used directly for the redirect (Decision 1) |
| fileId | `string` | ImageKit's internal ID, needed for the Delete API call |

`configHash`: SHA-256 (hex, truncated) of every request query parameter that affects
rendered output, normalized (sorted keys), excluding `key`, `token`, `tmdb_key`,
`imagekit_key` (spec FR-005).

`freshnessToken`: the constant `"static"` for `imgs=...`-only requests, or a hash of the
fetched `catalog=...` content for dynamic requests (spec FR-006/FR-007).

## Resolved CDN Credential (transient, in-memory only — mirrors 001's Resolved TMDB Key)

| Field | Type | Notes |
|---|---|---|
| `key` | `string` | The ImageKit private API key actually used |
| `source` | `"direct" \| "token"` | Which mechanism resolved it (research.md Decision 8) — never `"server"`, unlike feature 001, since there is no shared server-side CDN credential |

**Resolution order** (research.md Decision 8):
1. Direct `imagekit_key` parameter, if present and non-blank.
2. Else, `token` parameter resolved via `getProfile(token)` (feature 003) →
   `Profile.imagekitKeyEncrypted`, decrypted.
3. Else → no credential resolves; caching is inactive for this request (not an error, per
   spec FR-002 and Edge Cases).

## Relationship to feature 003's entities

- Reads `Profile.imagekitKeyEncrypted` (via `getProfile(token)` from `src/lib/profile.ts`)
  and decrypts it using feature 003's `decryptSecret` helper — same mechanism
  [001-tmdb-byo-key](../001-tmdb-byo-key/data-model.md) uses for
  `Profile.tmdbKeyEncrypted`. No new field, table, or write path is introduced on the
  `Profile` entity by this feature.
- Does **not** interact with feature 003's `Creation` entity — a creation's saved `config`
  and this feature's render-time caching are independent concerns (a saved creation, when
  rendered, goes through the same cache-check as any other request, but this feature has no
  awareness of *why* a given set of parameters was requested).
