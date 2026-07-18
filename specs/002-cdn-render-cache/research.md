# Research: Generated Image Caching via User-Owned CDN (BYO CDN)

*Revised 2026-07-18 to resolve the ImageKit credential via the
[003-user-profiles](../003-user-profiles/research.md) token mechanism as primary, direct
parameter as secondary — see Decision 4 (revised) and new Decision 8. Decisions 1-3 and
5-7 are unchanged from the original caching-mechanics research.*

## Decision 1: Cache-hit delivery mechanism

**Decision**: HTTP redirect (302) to the cached asset's CDN URL.

**User confirmation**: Decided directly with user during planning (2026-07-18).

**Consequence for the API contract**: `/api/render` and `/api/cover` currently always return
`200` with `Content-Type: image/png`. When a cache hit occurs with CDN credentials supplied,
the response becomes a `302` with a `Location` header pointing at the caller's CDN. This is
documented explicitly in `contracts/` as a conditional response-shape change — callers that
follow redirects transparently (browsers, `curl -L`, most HTTP clients/`<img>` tags) see no
difference; callers that inspect the raw response status will.

## Decision 2: Catalog staleness detection

**Decision**: Fetch and hash the catalog's current content on every `catalog=...` request;
compare against a hash encoded in the cached asset's filename.

**User confirmation**: Decided directly with user during planning (2026-07-18).

## Decision 3: Cache key and staleness encoding on the CDN (no custom-metadata schema required)

**Decision**: Store cached assets under a dedicated path prefix (`mosaiq-cache/`) using a
deterministic filename: `mosaiq-cache/{configHash}--{freshnessToken}.png`.

- `configHash`: a hash (e.g. SHA-256, hex, truncated) of every query parameter that affects
  rendered output — i.e. all parameters except credentials (`key`, `tmdb_key`,
  `imagekit_key`) — normalized (sorted keys) before hashing, per FR-005.
- `freshnessToken`:
  - For requests with no `catalog=...` parameter (pure `imgs=...`): the constant `"static"`
    (per FR-006 — nothing external to check).
  - For requests with one or more `catalog=...` parameters: a hash of the fetched catalog(s)'
    content (per FR-007).

**Rationale**: ImageKit's Media API (list/search, upload, delete) operates on file
path/name and returns each file's full delivery `url` directly in its responses — a
separate "urlEndpoint" parameter is not needed to construct delivery URLs (see Decision 5).
Encoding the freshness token directly in the filename means a lookup is a single "list files
matching prefix `mosaiq-cache/{configHash}--`" call: if a file with the *current*
`freshnessToken` suffix exists, it's a fresh hit; if a file with the prefix exists but a
*different* suffix, it's the stale entry to delete after a successful re-render. This avoids
requiring the caller to pre-configure ImageKit "Custom Metadata Fields" (a dashboard setup
step ImageKit requires before custom metadata can be set via API) — the feature works with a
bare ImageKit account and only a private API key.

**Alternatives considered**: ImageKit custom metadata fields (storing `configHash`/
`freshnessToken` as structured metadata on the file) — rejected because it requires the
caller to first define those fields in their ImageKit dashboard before the API will accept
them, adding an undocumented manual setup step that would silently fail (or require a second,
more privileged API call to create the field) for a caller who just wants to try the feature
by pasting in an API key.

**Concurrency note (spec Edge Case)**: If two requests race for the same `configHash` and
resolve the *same* `freshnessToken` (e.g. identical unchanged catalog), both upload to the
same filename; ImageKit overwrite semantics (Decision 5, `useUniqueFileName: false`) mean the
second write simply replaces the first — only one asset remains, satisfying "replace, don't
accumulate" with no explicit coordination needed. If they race with *different* freshness
tokens (the source changed mid-flight, rare), each request only deletes what it individually
observed as stale at lookup time; a since-orphaned entry (if any) is cleaned up by the next
request that lists that prefix and finds more than one match. This matches the spec's explicit
allowance that concurrent requests don't need to coordinate.

## Decision 4: Credentials required from the caller (revised — token primary)

**Decision**: The ImageKit **private** API key is resolved the same way as
[001-tmdb-byo-key](../001-tmdb-byo-key/research.md) resolves the TMDB key: primarily via
`?token=` (looked up through [003-user-profiles](../003-user-profiles/research.md)'s
`Profile.imagekitKeyEncrypted`), with a direct `?imagekit_key=` parameter retained as a
secondary path. No separate "URL endpoint" or public key parameter is required from the
caller via either mechanism — see the ImageKit API-shape rationale below, which is
unchanged by this revision.

**User confirmation**: Original single-credential decision confirmed 2026-07-18; revision
to token-primary confirmed 2026-07-18 in the same session as
[001-tmdb-byo-key](../001-tmdb-byo-key/research.md)'s equivalent revision.

**Rationale**: ImageKit's Upload API (`POST https://upload.imagekit.io/api/v1/files/upload`),
List/Search Files API (`GET https://api.imagekit.io/v1/files`), and Delete File API
(`DELETE https://api.imagekit.io/v1/files/{fileId}`) are all authenticated with HTTP Basic
Auth using the private API key as the username (empty password), and are account-scoped by
that key alone — they don't require the account's public "URL endpoint" domain to operate.
Each of these endpoints' JSON responses includes the file's full delivery `url`, which is
what gets used for the redirect (Decision 1) — so mosaiq never needs to construct a URL from
a separate endpoint/base parameter itself.

**⚠ Flagged for implementation-time verification**: This is based on ImageKit's documented
REST API shape as of this research; API surface details (exact field names, whether Basic
Auth alone suffices for every one of these three calls, current signature/expiry
requirements) should be re-confirmed against ImageKit's current API reference during
`/speckit-tasks`/`/speckit-implement`, since third-party API details can change. If it turns
out a URL endpoint actually is required for constructing a redirect target, add a second
optional `imagekit_endpoint` parameter following the same pattern as `imagekit_key` —
this would not otherwise change the design.

**Alternatives considered**: Requiring both a private key and a public URL endpoint
upfront — deferred; simpler for the caller to start with one credential if it's genuinely
sufficient, and the design tolerates adding the second parameter later without disruption if
verification (above) shows it's needed.

## Decision 5: Upload semantics — deterministic overwrite, no unbounded accumulation

**Decision**: Upload with `useUniqueFileName: false` and the exact deterministic filename
from Decision 3, so re-uploading the same `configHash`+`freshnessToken` pair in-place
overwrites rather than accumulating ImageKit's default auto-suffixed duplicates.

**Rationale**: ImageKit's default behavior (`useUniqueFileName: true`) appends a random
suffix on name collision specifically to *avoid* overwriting — the opposite of what FR-008
("replace, don't accumulate") requires. Explicitly disabling it is necessary for the
cache-replacement model to work as specified.

## Decision 6: No new runtime dependency

**Decision**: Implement the ImageKit REST calls with the platform `fetch` (Node 18+/Next.js
runtime), matching the existing project convention of hand-rolled `fetch` wrappers for
external APIs (`src/lib/tmdb.ts`'s `tmdbFetch`) rather than adding the `imagekit` npm SDK as
a dependency.

**Rationale**: Consistent with the codebase's existing pattern and this project's minimal-
dependency posture (Constitution Technology Constraints); the three ImageKit calls needed
(upload, list/search, delete) are simple enough that a small `src/lib/cdnCache.ts` wrapper
(mirroring `tmdb.ts`'s shape) is proportionate, and avoids taking on an SDK's transitive
dependencies and version-upgrade surface for a self-hosted, minimal-footprint project.

**Alternatives considered**: Adding the official `imagekit` npm package — rejected for now
as unnecessary weight; can be revisited if the hand-rolled wrapper proves awkward during
implementation.

## Decision 7: Where the caching logic lives

**Decision**: A new framework-free module, `src/lib/cdnCache.ts`, exposing something like
`tryServeCached(configParams, resolvedKey): Promise<{ url: string } | null>` and
`saveToCache(configParams, freshnessToken, imageBuffer, resolvedKey): Promise<void>`, plus
a `resolveImageKitKey({ directKey?, token? })` mirroring `lib/tmdb.ts`'s
`resolveTmdbKey` (Decision 8). Called from `src/app/api/render/route.ts` and
`src/app/api/cover/route.ts` only — the two endpoints named in the spec.
`resolveCatalogs`/`resolveCatalog` (already used by both routes) is reused unmodified to
fetch catalog content for hashing (Decision 2); no change needed there beyond what feature
001 already introduces for TMDB-key threading.

**Rationale**: Matches Constitution Principle IV (`app → lib`, one-directional, `lib/`
framework-free) — the same pattern already used for `tmdb.ts`, `catalog.ts`, `mosaic.ts`,
`cover.ts`, and now `profile.ts` (feature 003). Confining the new logic to a single module
keeps the two route handlers focused on parsing params and orchestrating (resolve
credential → check cache → render on miss → save), which is also the smallest change
consistent with Principle II (render engine itself is untouched).

## Decision 8: Token resolution mirrors feature 001

**Decision**: `resolveImageKitKey({ directKey, token }): Promise<{ key: string; source: "direct" | "token" | "none" } | null>` in `src/lib/cdnCache.ts`:
1. `directKey` present and non-blank → use it (`source: "direct"`).
2. Else `token` present and resolves (via `getProfile(token)` from `src/lib/profile.ts`,
   feature 003) to a profile with an ImageKit credential → decrypt and use it
   (`source: "token"`).
3. Else → `null` (no credential resolves at all; per FR-002/Edge Cases, this is not an
   error — the caching feature is simply inactive for this request, unlike
   [001-tmdb-byo-key](../001-tmdb-byo-key/research.md) there is no third "server" fallback
   step here, since there is no shared server-side CDN credential concept for this
   feature).

**Rationale**: Directly parallels `resolveTmdbKey` (feature 001) for consistency, but
correctly reflects that this feature has only two possible sources (direct, token), not
three — there's nothing analogous to `TMDB_API_KEY`'s server-wide fallback for a CDN
credential, since mosaiq itself doesn't operate a shared CDN account on callers' behalf.

**Rationale (codebase, unchanged)**: ImageKit's Upload API
(`POST https://upload.imagekit.io/api/v1/files/upload`), List/Search Files API
(`GET https://api.imagekit.io/v1/files`), and Delete File API
(`DELETE https://api.imagekit.io/v1/files/{fileId}`) are all authenticated with HTTP Basic
Auth using the private API key as the username (empty password), and are account-scoped by
that key alone. Each response includes the file's full delivery `url`, used for the
redirect (Decision 1).
