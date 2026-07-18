# Feature Specification: Per-User TMDB API Key (BYO Key)

**Feature Branch**: `001-tmdb-byo-key`

**Created**: 2026-07-18

**Status**: Draft (revised 2026-07-18 — see Revision Note)

**Depends on**: [003-user-profiles](../003-user-profiles/spec.md) — this feature resolves
a caller's personal TMDB credential through the token/profile mechanism defined there.

**Input**: User description: "TMDB API key per-user (BYO key): Currently mosaiq uses a single server-wide TMDB_API_KEY environment variable for all TMDB requests (search, poster/backdrop fetching, metadata) across all endpoints (/api/search, /api/render, /api/cover, /api/art). We want to let each user/caller supply their own TMDB API key instead of relying solely on the server's shared key."

## Revision Note (2026-07-18)

The original version of this spec had callers supply their raw TMDB key directly as a
`?tmdb_key=` request parameter on every request. Mid-session, the user identified a real
problem with that as the *primary* mechanism: tools like Nuvio only store a URL once (in a
collection), with no secret-management of their own — a raw key embedded in that URL would
sit there indefinitely, exposed to anyone who can see that Nuvio collection's
configuration. This revision makes the [003-user-profiles](../003-user-profiles/spec.md)
token the primary mechanism instead: a caller registers their TMDB key once, gets an
opaque UUID token, and uses `?token=...` thereafter — Nuvio only ever stores the token, not
the raw key. The direct `?tmdb_key=` parameter is retained as a secondary, lower-friction
option for one-off direct API use (e.g. testing via `curl`), not for anything pasted into
a persistent external configuration.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bring your own TMDB key via a saved profile token (Priority: P1)

A visitor using the publicly hosted mosaiq instance registers their personal TMDB key once
(via [003-user-profiles](../003-user-profiles/spec.md)) and uses the resulting token on
requests — including ones saved permanently in external tools like Nuvio — so their
searches and renders draw on their personal TMDB quota instead of the shared
instance-wide quota, without their raw key ever being stored outside mosaiq.

**Why this priority**: This is the core motivation for the feature — the shared TMDB key
on the public instance is a bottleneck for every visitor; removing it, safely, delivers
the feature's main value.

**Independent Test**: Register a TMDB key via the profile endpoint to obtain a token, make
a request supplying only that token, and confirm the response succeeds using the
registered key; can be further verified by disabling/removing the shared server key and
confirming token-bearing requests still succeed.

**Acceptance Scenarios**:

1. **Given** a self-hosted instance configured with a server TMDB key, **When** a caller
   makes a request without supplying a token or a direct key, **Then** the request
   succeeds using the server's key exactly as it does today (no behavior change).
2. **Given** the public instance, **When** a caller supplies a token from a profile that
   has a TMDB credential registered, **Then** TMDB data for that request is retrieved
   using that caller's registered key, not the shared server key.
3. **Given** a caller's registered TMDB credential is invalid or expired at the time TMDB
   is called, **When** they make a request with their token, **Then** the request fails
   with a clear error identifying the credential as rejected, and the system does not
   silently substitute the shared server key.
4. **Given** a caller who has not registered a profile, **When** they supply a raw TMDB
   key directly via a request parameter instead of a token, **Then** the system uses that
   key for the request exactly as if it came from a token — the direct parameter remains
   available as a secondary path (see Revision Note).

---

### User Story 2 - Register and reuse a key from the web Editor (Priority: P2)

A user of the web Editor enters their personal TMDB key once; the Editor registers it
(obtaining a token from [003-user-profiles](../003-user-profiles/spec.md)) and stores only
that token, so every subsequent search and render in that browser — or any other browser
where the user enters the same token — automatically uses their key without the raw value
ever being re-entered or re-exposed.

**Why this priority**: Makes the feature usable for the Editor's primary audience without
requiring them to construct raw API URLs; depends on User Story 1 and on
[003-user-profiles](../003-user-profiles/spec.md) existing first.

**Independent Test**: Enter a personal key in the Editor's settings, confirm only a token
(not the raw key) is retained afterward, reload the page, perform a search, and confirm
the key is still applied without re-entry.

**Acceptance Scenarios**:

1. **Given** a user enters their TMDB key in the Editor's settings, **When** the Editor
   registers it, **Then** the Editor retains only the resulting token (never the raw key)
   for subsequent use.
2. **Given** a user has previously registered a key and holds its token in a browser,
   **When** they return in a new session on the same browser, **Then** their key is still
   applied via the stored token without needing to re-enter it.
3. **Given** a user enters an existing token (obtained previously, possibly on a different
   device) into the Editor, **When** they perform a search, **Then** the credential
   registered under that token is used — this works identically across any browser/device
   (per [003-user-profiles](../003-user-profiles/spec.md) User Story 3).
4. **Given** a user removes their credential from their profile, **When** they perform
   subsequent searches with that token, **Then** the server's default key (if configured)
   is used instead.

---

### User Story 3 - No change for operators who don't use the feature (Priority: P3)

A self-hosted, single-user operator wants their existing single-key setup to keep working
exactly as before, without needing to do anything for this feature to be safely present.

**Why this priority**: Protects existing deployments from regressions; lower priority than
P1/P2 because it's a non-functional guarantee rather than new capability, but still
required before shipping.

**Independent Test**: On a self-hosted deployment with only the server TMDB key
configured and no tokens or direct keys ever used, confirm all existing functionality is
unchanged.

**Acceptance Scenarios**:

1. **Given** an operator has not enabled or advertised this feature to their users,
   **When** normal requests are made without a token or direct key, **Then** the system
   behaves exactly as it did before this feature existed.

---

### Edge Cases

- What happens when a caller supplies a token to an endpoint whose current request doesn't
  need TMDB at all? The token is ignored for TMDB purposes; it has no effect there (it may
  still be relevant to other features layered on the same token, e.g. 002).
- What happens when a caller's registered TMDB credential is valid but revoked or
  rate-limited by TMDB itself? TMDB's error is surfaced to the caller as-is; the system
  does not swallow it or retry with the shared server key.
- What happens when the server has no server-wide TMDB key configured, and a caller
  supplies neither a token nor a direct key? Existing "TMDB not configured" behavior is
  preserved, unchanged from today.
- What happens when a caller supplies a token that doesn't exist, or whose profile has no
  TMDB credential registered? Per [003-user-profiles](../003-user-profiles/spec.md) FR-007,
  an unknown token fails clearly; a known token with no TMDB credential registered falls
  back to the shared server key (not an error — the profile is valid, it simply has
  nothing to override with for this credential type).
- What happens when both a token and a direct key are supplied on the same request? The
  direct key takes precedence (it's the more explicit, more recently-stated intent) — this
  is primarily a testing/debugging convenience, not an expected normal usage pattern.
- What happens when a direct key parameter is present but empty or blank? Treated the same
  as not supplied (falls back to token resolution, then the shared server key), not as an
  invalid-key failure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a caller to resolve a personal TMDB credential via a
  token (from [003-user-profiles](../003-user-profiles/spec.md)) on any request to an
  endpoint that performs TMDB lookups (search, poster/backdrop retrieval, metadata,
  textless-art fallback).
- **FR-002**: When a token resolves to a profile with a registered TMDB credential, the
  system MUST use that credential for all TMDB calls made to fulfill the request, instead
  of the shared server-configured credential.
- **FR-003**: The system MUST also accept a raw TMDB credential supplied directly as a
  request parameter, as a secondary mechanism, with the same override behavior as a
  token-resolved credential (Revision Note; Acceptance Scenario 1.4).
- **FR-004**: When a caller supplies neither a token resolving to a TMDB credential nor a
  direct credential, the system MUST fall back to the shared server-configured credential,
  unchanged from current behavior.
- **FR-005**: If a resolved or directly-supplied TMDB credential is rejected by TMDB
  (invalid, expired, or unauthorized), the system MUST return a clear error to the caller
  and MUST NOT silently retry the request using the shared server credential.
- **FR-006**: The system MUST NOT persist, log, or cache a *directly-supplied* TMDB
  credential anywhere on the server beyond the lifetime of the single request it was
  supplied with. (A *token-resolved* credential's persistence is governed entirely by
  [003-user-profiles](../003-user-profiles/spec.md) — this feature only reads it
  transiently per request, it does not introduce any additional storage of its own.)
- **FR-007**: The web Editor MUST provide a way for a user to enter their personal TMDB
  credential, register it via the profile mechanism, and retain only the resulting token
  locally — never the raw credential — for automatic inclusion on subsequent outgoing
  requests.
- **FR-008**: The web Editor MUST allow a user to remove their registered TMDB credential
  (via the profile mechanism), after which requests revert to relying on the shared server
  credential.
- **FR-009**: The system MUST continue to function exactly as before this feature for any
  caller that never supplies a token or direct credential — no regression to existing
  shared-key behavior.
- **FR-010**: Supplying a personal TMDB credential (via either mechanism) MUST be entirely
  optional; the system MUST NOT require callers to provide one.

### Key Entities

- **Resolved TMDB Credential**: The credential value actually used for a given request's
  TMDB calls, after resolution — either read (transiently, per request) from a token's
  profile via [003-user-profiles](../003-user-profiles/spec.md), or taken directly from a
  request parameter. Not itself a new stored entity; this feature introduces no storage of
  its own.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor with a registered TMDB credential (via token) can complete a
  search and generate a render or cover without consuming any of the shared server
  credential's TMDB quota.
- **SC-002**: On the public instance, TMDB shared-quota rate-limit errors experienced by
  visitors using their own registered key drop to zero, regardless of how many other
  visitors are concurrently active.
- **SC-003**: A user who registers their key once via the Editor does not need to re-enter
  the raw key again on that browser, or any other browser where they enter the same token.
- **SC-004**: Existing self-hosted deployments that never use this feature see zero change
  in behavior, error rate, or output for their existing integrations.
- **SC-005**: A rejected TMDB credential (token-resolved or direct) always produces a
  clear, actionable error — no silent failures, no unexplained fallback.
- **SC-006**: A raw TMDB key registered via a token is never present in any URL a caller
  needs to store persistently (e.g. a Nuvio collection) — only the opaque token is.

## Assumptions

- Token resolution for TMDB credentials depends entirely on
  [003-user-profiles](../003-user-profiles/spec.md) being implemented first; this spec
  does not duplicate that feature's storage, encryption, or token-issuance requirements.
- The direct `?tmdb_key=`-style parameter remains supported specifically for low-friction,
  one-off direct API use (testing, debugging) — not as the recommended mechanism for
  anything a caller intends to store persistently outside mosaiq.
- When both a token and a direct credential are present on the same request, the direct
  credential wins (Edge Cases) — this is a debugging convenience, not an expected steady-
  state usage pattern.
- A token that resolves successfully but has no TMDB credential registered is not an
  error — it's equivalent to "no override," falling back to the shared server key.
