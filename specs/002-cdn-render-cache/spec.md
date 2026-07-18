# Feature Specification: Generated Image Caching via User-Owned CDN (BYO CDN)

**Feature Branch**: `002-cdn-render-cache`

**Created**: 2026-07-18

**Status**: Draft (revised 2026-07-18 — see Revision Note)

**Depends on**: [003-user-profiles](../003-user-profiles/spec.md) — this feature resolves
a caller's ImageKit credential through the token/profile mechanism defined there.

**Input**: User description: "Generated image caching via user-owned CDN (BYO CDN, ImageKit initially): mosaiq's /api/render (mosaics/wallpapers) and /api/cover endpoints currently regenerate the PNG on every serverless call via Canvas rendering, relying only on framework/edge caching. We want an optional caching layer where the generated image is uploaded to a CDN/media library that the caller supplies credentials for, so repeat requests for the same rendered asset are served from the CDN instead of being re-rendered from scratch."

## Revision Note (2026-07-18)

The original version of this spec had callers supply their raw ImageKit private key
directly as an `?imagekit_key=` request parameter. Mid-session, alongside the same
revision to [001-tmdb-byo-key](../001-tmdb-byo-key/spec.md), the user confirmed ImageKit
credentials should follow the same pattern: resolved via the
[003-user-profiles](../003-user-profiles/spec.md) token as the primary mechanism, with the
direct parameter retained only as a secondary option for one-off direct API use. The
caching mechanics themselves (Clarifications below, User Stories 1-3, cache-key/staleness
design) are unchanged by this revision — only *how the ImageKit credential is obtained* changed.

## Clarifications

### Session 2026-07-18

- Q: For `catalog=...` (dynamic) requests, how should staleness be detected? → A: Fetch and hash the catalog's content on every request; compare against the hash stored with the cached asset. If different, treat the cache as stale, re-render, and replace it. This still fetches the catalog every time (as today) but skips the expensive Canvas render when the content is unchanged.
- Q: How should a cache hit be delivered to the caller? → A: Respond with an HTTP redirect to the cached asset's URL on the caller's CDN, rather than mosaiq proxying the bytes itself.
- Q (this revision): How should the ImageKit credential be supplied? → A: Primarily via a `?token=` resolved through [003-user-profiles](../003-user-profiles/spec.md); a direct `?imagekit_key=` parameter remains as a secondary path, matching [001-tmdb-byo-key](../001-tmdb-byo-key/spec.md)'s pattern.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Skip re-rendering unchanged explicit-list mosaics (Priority: P1)

A caller registers their ImageKit credential once (via
[003-user-profiles](../003-user-profiles/spec.md)) and repeatedly requests the same mosaic
or cover built from an explicit, unchanging list of posters (`imgs=...`), supplying only
their token. They want the second and later requests to come back near-instantly instead
of paying the full render cost again — without their raw ImageKit key ever sitting in a
URL they store persistently (e.g. a Nuvio collection).

**Why this priority**: Delivers the core performance win with the least ambiguity —
explicit lists have no hidden staleness problem, so this alone is a safe, valuable,
independently shippable slice.

**Independent Test**: Register CDN credentials to get a token, request the same
`imgs=...` render/cover twice supplying only the token. The first request renders and
uploads; the second is verifiably served without a new render occurring and produces the
same visual result.

**Acceptance Scenarios**:

1. **Given** a caller supplies a token resolving to a profile with a registered ImageKit
   credential, **When** no cached asset exists yet for that exact configuration, **Then**
   the system renders the image, stores it in the caller's CDN, and returns it to the
   caller.
2. **Given** a cached asset already exists in the caller's CDN for an identical
   `imgs=...` configuration, **When** the caller repeats that exact request (same token),
   **Then** the system returns the cached asset without re-running the render.
3. **Given** a caller changes any parameter that affects the rendered output, **When**
   they make that request, **Then** it is treated as a distinct configuration with its own
   cache entry, not a cache hit against the old one.
4. **Given** a caller who has not registered a profile, **When** they supply a raw
   ImageKit key directly via a request parameter instead of a token, **Then** the system
   uses it exactly as if it came from a token — the direct parameter remains available as
   a secondary path (see Revision Note).

---

### User Story 2 - Keep dynamic catalog mosaics fresh (Priority: P2)

A caller builds mosaics from a dynamic catalog feed (`catalog=...`, e.g. "top movies this week"). They still want to benefit from caching when the underlying catalog hasn't actually changed, but they need the mosaic to reflect the catalog's real content whenever it does change — never serving a visibly outdated mosaic.

**Why this priority**: Extends the caching benefit to the more common real-world case (dynamic catalogs), but depends on User Story 1's caching mechanism existing first, and carries more risk (serving stale content) if done incorrectly.

**Independent Test**: Request a `catalog=...` mosaic twice with no change to the catalog's content in between — confirm the second request is served from cache. Then change the catalog's underlying content (or point at a catalog URL that now returns different items) and request again — confirm a fresh render is produced and replaces the previous cached asset.

**Acceptance Scenarios**:

1. **Given** a cached asset exists for a `catalog=...` request, **When** the caller repeats the request and the catalog's current content is unchanged, **Then** the cached asset is served without re-rendering.
2. **Given** a cached asset exists for a `catalog=...` request, **When** the caller repeats the request and the catalog's current content has changed since the asset was cached, **Then** the system re-renders using the current catalog content and replaces the stale cached asset with the new one.
3. **Given** a catalog's content has changed, **When** the new render completes and uploads successfully, **Then** the previous cached asset for that same configuration is removed rather than left behind alongside the new one.

---

### User Story 3 - Opt-in with zero impact when not used (Priority: P3)

An operator or caller who never registers or supplies CDN credentials (via token or
directly) wants rendering to work exactly as it does today, with no new external
dependency, no new failure mode, and no behavior change.

**Why this priority**: Non-functional safety guarantee rather than new capability — required before shipping, but lower priority than the two capability-delivering stories.

**Independent Test**: Make render/cover requests with no CDN credentials (token or direct) supplied and confirm output and behavior are identical to the current system, with no calls made to any CDN.

**Acceptance Scenarios**:

1. **Given** no CDN credentials resolve for a request (no token, no direct key, or a token
   with no ImageKit credential registered), **When** the render or cover endpoint is
   called, **Then** the system renders and responds exactly as it does today, without
   attempting any CDN upload, lookup, or redirect.
2. **Given** a caller's CDN is unreachable or misconfigured, **When** they nonetheless
   have credentials resolved for a request, **Then** the system still returns a correctly
   rendered image to the caller (the render itself must not fail because of a CDN
   problem), even if caching could not be completed for that request.

---

### Edge Cases

- What happens when the resolved CDN credentials (via token or direct parameter) are
  invalid or lack permission to read/write/delete? The render still completes and is
  returned to the caller (per User Story 3, Scenario 2); caching for that request is
  simply skipped, and no confusing error is surfaced for what is otherwise a successful
  render.
- What happens when a supplied token doesn't resolve to any profile, or resolves to a
  profile with no ImageKit credential registered? Treated the same as "no CDN credentials
  supplied" (User Story 3) — normal render, no caching, no error. Unlike
  [001-tmdb-byo-key](../001-tmdb-byo-key/spec.md) there is no "shared server CDN" to fall
  back to; the feature is simply inactive for that request.
- What happens when two requests for the same not-yet-cached configuration arrive at nearly the same time? Both may render and upload independently; the system does not need to coordinate between concurrent requests, but a later successful upload for the same cache key MUST leave the CDN holding only the most recent asset (per the "replace, don't accumulate" rule), not both.
- What happens if the render succeeds but the upload to the CDN fails (network error, quota exceeded, etc.)? The caller still receives their rendered image; the failed cache write is not retried automatically and does not affect the response.
- What happens to previously cached assets when a caller stops supplying CDN credentials (opts out)? They are left as-is in the caller's own CDN; mosaiq takes no action to clean them up, since it holds no record of what it previously cached once the credentials are no longer supplied.
- What happens if the caller's CDN account already contains unrelated files (from other tools or uploaded manually)? The system MUST NOT read, overwrite, or delete anything outside of the dedicated location it uses for its own cached assets.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a caller to resolve their own CDN/media-library
  credential via a token (from [003-user-profiles](../003-user-profiles/spec.md)) on a
  render (`/api/render`) or cover (`/api/cover`) request.
- **FR-001a**: The system MUST also accept a raw CDN credential supplied directly as a
  request parameter, as a secondary mechanism (Revision Note; Acceptance Scenario 1.4).
- **FR-002**: When no CDN credential resolves for a request (no token, a token with none
  registered, or no direct parameter), the system MUST behave exactly as it does today —
  render on every request, no CDN interaction of any kind.
- **FR-003**: When a CDN credential resolves and no matching cached asset exists for the request's effective configuration, the system MUST render the image, return it to the caller, and store it in the caller's CDN for future reuse.
- **FR-004**: When a CDN credential resolves and a matching, still-fresh cached asset exists for the request's effective configuration, the system MUST respond with a redirect to that cached asset's location on the caller's CDN instead of re-rendering.
- **FR-005**: The effective configuration used to match a cache entry MUST include every request parameter that affects the rendered output (dimensions, preset, poster/backdrop selection, overlays, styling, etc.); any difference in those parameters MUST be treated as a distinct cache entry. Credential/token parameters themselves are never part of the effective configuration.
- **FR-006**: For requests built from an explicit image list, the effective configuration is fully determined by the request parameters themselves — no external content needs to be checked for freshness.
- **FR-007**: For requests built from a dynamic catalog reference, the system MUST fetch the catalog's current content and compare it against what was in effect when the existing cached asset was produced; if the content differs, the cached asset MUST be treated as stale.
- **FR-008**: When a stale cached asset is detected (per FR-007) and a fresh render successfully completes and uploads, the system MUST remove the previous cached asset for that same configuration so only the current version remains in the caller's CDN.
- **FR-009**: The system MUST NOT persist a *directly*-supplied CDN credential anywhere on
  the server beyond the lifetime of the single request that supplied it. (A *token*-
  resolved credential's persistence is entirely [003-user-profiles](../003-user-profiles/spec.md)'s
  responsibility — this feature introduces no additional storage of its own.)
- **FR-010**: All cached assets and any staleness-tracking data the system writes MUST be confined to a clearly dedicated location within the caller's CDN account, and the system MUST NOT read, overwrite, or delete anything outside that dedicated location.
- **FR-011**: If a CDN upload, lookup, or delete operation fails for any reason, the system MUST still return a correctly rendered image to the caller — a CDN problem MUST NOT cause the render/cover request itself to fail.
- **FR-012**: Supplying a CDN credential (via either mechanism) MUST be entirely optional and independent of the TMDB BYO-key capability — a caller may use either, both, or neither, and each is resolved independently even when both come from the same token.

### Key Entities

- **Cached Render Asset**: The generated PNG (mosaic, wallpaper, or cover) stored in the caller's own CDN, identified by a cache key derived from the request's effective configuration. Not stored or tracked by mosaiq itself between requests.
- **Freshness Marker**: A small piece of information (e.g., a content hash) stored alongside a cached asset in the caller's CDN, used on a later request to determine whether a `catalog=...` source has changed since the asset was produced.
- **Resolved CDN Credential**: Analogous to [001-tmdb-byo-key](../001-tmdb-byo-key/spec.md)'s
  Resolved TMDB Credential — the value actually used for a given request, either read
  transiently from a token's profile or taken directly from a request parameter. Not a new
  stored entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A repeated request for an unchanged explicit-list (`imgs=...`) configuration is fulfilled without performing the rendering work again, for at least 95% of repeat requests once caching is warmed up.
- **SC-002**: A repeated request for a `catalog=...` configuration whose underlying content has changed always reflects the new content — no caller ever receives a mosaic that visibly contradicts the catalog's current state.
- **SC-003**: Callers who never resolve a CDN credential (token or direct) observe zero change in output, response contract, or reliability compared to today.
- **SC-004**: A caller's CDN account never accumulates more than one cached asset per distinct configuration over time — old versions are replaced, not left to accumulate.
- **SC-005**: A CDN outage or misconfiguration on the caller's side never prevents a caller from receiving a correctly rendered image.
- **SC-006**: A raw ImageKit credential registered via a token is never present in any URL a caller needs to store persistently (e.g. a Nuvio collection) — only the opaque token is.

## Assumptions

- ImageKit is the first concrete CDN/media-library target; the requirements above are written provider-agnostically so a future provider could satisfy them without rewriting this spec.
- The "effective configuration" cache key is derived purely from request parameters (plus, for `catalog=...`, the fetched catalog content's hash) — no other hidden state affects what is considered a cache match.
- Because the CDN is the caller's own account, mosaiq holds no server-side record of what has been cached; every caching decision (hit/miss/stale) is determined by looking up state that lives in the caller's CDN itself, consistent with the project's minimal-state principle. (The credential *itself*, if token-resolved, is the one piece of state mosaiq does hold, and that's entirely feature 003's bounded exception, not a new one introduced here.)
- The dedicated location mosaiq uses within a caller's CDN (per FR-010) is separate from any of the caller's own unrelated files, so normal cache writes/deletes can never affect content the caller uploaded through other means.
- Token resolution for ImageKit credentials depends entirely on [003-user-profiles](../003-user-profiles/spec.md) being implemented first, mirroring [001-tmdb-byo-key](../001-tmdb-byo-key/spec.md)'s same dependency.
