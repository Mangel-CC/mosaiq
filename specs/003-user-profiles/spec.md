# Feature Specification: User Credential & Creation Profiles (UUID Token)

**Feature Branch**: `003-user-profiles`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Users should be able to save their own TMDB/ImageKit credentials once and get back an opaque UUID token that identifies them server-side — raw keys must never be sent to third-party tools like Nuvio, only the token. Additionally, users should be able to save their Editor creations (mosaic/cover configurations) so they can come back later with their UUID, view/edit them, and reference a saved creation by a stable URL. This is the foundational profile mechanism that the TMDB BYO-key feature and the CDN render-cache feature both build on."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save credentials once, get a token (Priority: P1)

A user wants to use their own TMDB and/or ImageKit credentials with mosaiq without ever putting those raw keys into a URL that ends up pasted into Nuvio, Stremio, or anywhere else outside mosaiq itself.

**Why this priority**: This is the foundational capability everything else depends on — without it, neither the TMDB BYO-key nor the CDN-cache features have a safe way to receive credentials from external, URL-only tools.

**Independent Test**: Enter a TMDB key (and/or an ImageKit key) into mosaiq's profile UI, save, and receive a UUID token. Confirm the raw key is never visible again through any URL or response other than at the moment it was first entered.

**Acceptance Scenarios**:

1. **Given** a user has no existing token, **When** they submit a TMDB key and/or an ImageKit key through mosaiq's profile UI, **Then** the system creates a new profile, stores the credential(s) encrypted, and returns a UUID token to the user.
2. **Given** a user has an existing token, **When** they use it in a request that needs a TMDB or ImageKit credential, **Then** the system resolves and uses their stored credential(s) without the raw key ever appearing in that request's URL.
3. **Given** a user has an existing token, **When** they return to mosaiq's profile UI and enter it, **Then** they can view which credentials are currently saved (not their raw values) and replace or remove them.

---

### User Story 2 - Save and revisit Editor creations (Priority: P2)

A user configuring a mosaic or cover in the Editor wants to save that exact configuration under a name, so they can come back later (potentially from a different browser/device, using only their UUID) to view, edit, or reuse it — and so they can reference it by a short, stable URL instead of a long parameter list.

**Why this priority**: Delivers the "save my work" value on top of the credential mechanism from User Story 1; depends on a token already existing (from User Story 1) to have somewhere to save creations under, though a user could generate a token for this purpose alone without ever adding a credential.

**Independent Test**: In the Editor, configure a mosaic, save it under a name using an active token, reload the Editor in a fresh browser session, load the same token, and confirm the saved creation appears and reproduces the same configuration.

**Acceptance Scenarios**:

1. **Given** a user has an active token loaded in the Editor, **When** they save their current mosaic or cover configuration under a name, **Then** it appears in their list of saved creations under that token.
2. **Given** a user has one or more saved creations, **When** they load their token in the Editor (any session/device), **Then** they see the list of their saved creations and can open any one of them to restore that exact configuration into the Editor.
3. **Given** a user has a saved creation, **When** they modify it in the Editor and save again under the same creation, **Then** the existing creation is updated in place (not duplicated).
4. **Given** a user has a saved creation, **When** they delete it, **Then** it no longer appears in their list and can no longer be referenced by URL.
5. **Given** a user has a saved creation, **When** they ask mosaiq for a shareable URL for it, **Then** they receive a short URL referencing their token and that specific creation, which — when requested — renders the same image as the full parameter URL would.

---

### User Story 3 - Recall a profile with only the UUID (Priority: P3)

A user who saved a profile previously wants to return — on any device, without any login — and get back to exactly where they left off, using nothing but the UUID they were given.

**Why this priority**: This is what makes User Stories 1 and 2 actually useful over time rather than one-off; it's the "no accounts, but still not disposable" guarantee. Lower priority than 1/2 because it's largely a consequence of them being implemented correctly, not new mechanism.

**Independent Test**: Save a profile (credentials and/or creations) on one browser, note the UUID, open mosaiq in a completely different browser with no prior state, enter the UUID, and confirm the full profile (credentials present/absent status, all creations) is restored.

**Acceptance Scenarios**:

1. **Given** a valid, previously-issued UUID, **When** a user enters it in any mosaiq session, **Then** their saved credentials (presence, not raw values) and full list of creations are restored.
2. **Given** an invalid or unrecognized UUID, **When** a user enters it, **Then** they receive a clear error and no profile data is shown.
3. **Given** a user has never been told there is no password-reset or account-recovery mechanism, **When** they are first issued a UUID, **Then** the system clearly communicates that the UUID itself is the only way back into their profile and it cannot be recovered if lost.

---

### Edge Cases

- What happens when a URL references a token that has no matching profile (typo, deleted, never existed)? A clear error is returned; no partial or default data is substituted silently.
- What happens when a URL references a creation ID under a token that doesn't own it, or that has been deleted? A clear error is returned — the request does not silently fall back to an empty/default render.
- What happens when a `?creation=` reference is used against the wrong endpoint for its type (e.g., a cover-type creation referenced from the mosaic render endpoint)? A clear error is returned rather than attempting to render with a mismatched or partial configuration.
- What happens when a user saves a creation without ever having entered a credential? Allowed — credentials and creations are independent; a profile may hold either, both, or neither at any time (a token with zero credentials and zero creations is simply unused, not invalid).
- What happens if a user loses their UUID? There is no recovery path (no email, no login) — this is communicated up front per User Story 3, Scenario 3, and is an accepted tradeoff of the no-accounts design.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a user to submit a TMDB credential, an ImageKit credential, or both, and receive a new UUID token identifying a profile that stores them.
- **FR-002**: The system MUST allow a user who already holds a UUID token to add, replace, or remove the credentials stored under that profile.
- **FR-003**: The system MUST NOT expose a previously-stored raw credential value again through any API response or UI after it was first saved (only whether one is present, not its value).
- **FR-004**: The system MUST allow a user with an active token to save their current Editor configuration (mosaic or cover) as a named creation under that token's profile.
- **FR-005**: The system MUST allow a user to list all creations saved under a given token, retrieve any one of them in full, update an existing one in place, rename it, or delete it.
- **FR-006**: The system MUST allow a saved creation to be referenced and rendered via a stable URL that includes the token and the creation's identifier, producing the same output as the equivalent full-parameter URL would.
- **FR-007**: The system MUST return a clear, distinct error when a request references a token that does not exist, or a creation that does not exist or does not belong to the referenced token.
- **FR-008**: The system MUST NOT provide any account-recovery mechanism (no email, no password reset) for a lost UUID token, and MUST clearly communicate this to the user at the moment a token is first issued.
- **FR-009**: Storing credentials and storing creations under a token MUST be independent capabilities — a profile is valid and usable with either, both, or neither present.
- **FR-010**: Stored third-party credentials MUST be encrypted at rest; stored creations (non-secret configuration data) are not required to be encrypted but MUST only be retrievable by callers who supply the correct, unguessable token.
- **FR-011**: This feature MUST remain fully optional — a caller who never obtains or uses a token MUST see no change in mosaiq's existing behavior.

### Key Entities

- **Profile**: Identified by an opaque, unguessable UUID token. May hold zero or one stored TMDB credential, zero or one stored ImageKit credential, and zero or more named creations. Has no username, email, password, or other identifying information.
- **Creation**: Belongs to exactly one Profile. Has a stable identifier (unique within its profile), a user-given name, a type (mosaic or cover), and the full configuration data needed to render it (equivalent to what today's full-parameter URL carries, excluding credentials).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from "no profile" to "have a working token with a saved credential" in under 1 minute of interaction.
- **SC-002**: A raw TMDB or ImageKit credential a user saved is never observable in any URL, log, or response after the moment it was originally submitted.
- **SC-003**: A user returning with only their UUID, on a device that has never seen that profile before, recovers 100% of their saved creations and credential presence-state.
- **SC-004**: A URL referencing a saved creation is materially shorter than the equivalent full-parameter URL for any non-trivial configuration (multiple styling/overlay parameters set).
- **SC-005**: An invalid or unrecognized token/creation reference always produces a clear error, never a silent partial or default render.

## Assumptions

- No limit is placed on the number of creations a single token may hold, or on how many tokens may be created, in this iteration — this is a known operational consideration for a public instance (consistent with related caching/analytics concerns already deferred in the CDN-cache feature) that can be revisited if abuse becomes a real problem, rather than solved preemptively here.
- A token grants full read/write access to everything stored under it — there is no finer-grained permission model (e.g. read-only sharing of a creation) in this iteration.
- The UUID token itself is the only credential needed to access a profile; there is no additional password or secondary factor layered on top of it, consistent with the "no accounts" design goal (Constitution Principle V).
- This feature is a prerequisite for the TMDB BYO-key feature and the CDN render-cache feature, both of which resolve their respective third-party credentials through the token mechanism defined here rather than accepting raw keys directly as their primary path.
