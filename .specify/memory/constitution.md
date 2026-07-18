<!--
Sync Impact Report
- Version change: 1.0.0 → 2.0.0 (MAJOR — backward-incompatible redefinition of Principle I)
- Modified principles:
  - I. Self-Hosted, No Database → I. Self-Hosted, Minimal State
    (adds a narrow, explicitly-bounded exception permitting a minimal encrypted
    credential-and-creation token store; previously this was flatly prohibited)
  - III. URL Is the API Contract (adds a bounded exception allowing POST/PUT/DELETE for
    profile-management endpoints only, since submitting a secret via GET query params
    would defeat Principle I's encryption-at-rest guarantee; render/lookup endpoints,
    including token/creation-referencing ones, remain GET-only)
  - V. Minimal, Optional Auth (clarified to explicitly distinguish the new credential/
    creation token from user accounts/sessions/login, which remain out of scope)
- Added sections: none (existing principle count unchanged, six principles)
- Removed sections: none
- Templates requiring updates:
  ✅ .specify/templates/plan-template.md (generic "Constitution Check" gate, no principle-specific text to sync)
  ✅ .specify/templates/spec-template.md (no constitution-specific references)
  ✅ .specify/templates/tasks-template.md (no constitution-specific references)
  ✅ .claude/skills/speckit-*/SKILL.md (generic, no project-specific or other-agent references found)
  ⚠ specs/001-tmdb-byo-key/ (spec/plan predate this amendment — being rewritten to use
    the token as primary mechanism, per this amendment, in the same work session)
  ⚠ specs/002-cdn-render-cache/ (same — being rewritten in the same work session)
- Follow-up TODOs: none.
-->

# mosaiq Constitution

## Core Principles

### I. Self-Hosted, Minimal State
mosaiq MUST remain deployable as a single container with no *required* external
infrastructure beyond the container itself — self-hosted operators must be able to run it
with zero additional services for its core functionality. Rendering state (mosaics,
covers) MUST remain fully stateless and derivable from query parameters and external
catalog/TMDB URLs at request time; nothing about a render may depend on server-side
persisted state beyond short-lived cache, *except* through the bounded exception below.

**Exception — BYO Credential & Creation Store**: mosaiq MAY persist a minimal, opaque
per-user record, keyed by a server-generated UUID token, holding two kinds of data the
user explicitly chose to save:

1. The user's own encrypted third-party API credentials (e.g. a personal TMDB key, a
   personal ImageKit key), so that URLs pasted into external tools (Nuvio collections,
   Stremio addon configuration) never carry a caller's raw secret — only the opaque token.
2. Named "creations" — saved mosaic/cover Editor configurations (preset, dimensions,
   colors, image sources, overlays, text, etc. — the same shape of data the Editor already
   holds as in-memory/URL state) that the user explicitly chose to save under their token,
   so they can return later (with the same UUID) to view, edit, rename, or delete them, and
   so a specific saved creation can be referenced by a stable URL (e.g. for Nuvio/Stremio).

This exception is bounded and MUST NOT be generalized beyond these two data kinds:

- It MUST store nothing beyond `{token, encrypted credentials, named creations,
  timestamps}` — no usernames, emails, passwords, login state, or sessions. A token is an
  anonymous, unguessable identifier, not an account.
- It MUST use a SQLite-compatible embedded/libSQL store: a local file for Docker
  self-hosting (true to "no required external service"), or a hosted libSQL/Turso-
  compatible endpoint for serverless deployments (e.g. Vercel) that lack persistent local
  disk. A general-purpose database service (Postgres, MongoDB, etc.) MUST NOT be
  introduced for this purpose.
- Credentials MUST be encrypted at rest using a server-held secret (an environment
  variable, never committed to the repository). Saved creations (render configuration
  data, not secrets) do not require encryption, but MUST only ever be looked up by the
  unguessable UUID token — never listed, browsable, or enumerable without it.
- This exception exists solely to (a) keep raw third-party keys out of third-party
  systems, and (b) let a user recall and edit configurations they explicitly saved.
  Expanding it into a broader user-data, session, or general-purpose persistence layer —
  or into anything resembling accounts, login, or cross-token discovery — requires a
  further constitution amendment; it is not implicitly authorized by this one.

Any feature outside this bounded exception that would require a database, user accounts,
or durable server-side storage MUST still be rejected or redesigned to stay stateless.

Rationale: the primary audience is home-lab Plex/Jellyfin/Stremio users self-hosting on
minimal hardware (~$5-10/month VPS); zero-required-infrastructure operation is what makes
that viable and remains the default for all rendering functionality. The token store is a
narrow, explicitly-scoped exception driven by a concrete constraint: Nuvio/Stremio
collections only ever store a URL, with no secret-storage mechanism of their own, so the
only way to keep a caller's personal TMDB/ImageKit key from sitting in that URL is for
mosaiq to hold an opaque reference to it on the caller's behalf.

### II. Render Parity (Browser ⇄ Server)
The rendering engine (`resolveConfig`, `drawCover`, tile layout, overlays, and all Canvas
drawing logic) MUST live exclusively in `src/lib/` and MUST NOT import Next.js, HTTP, or
request/response types. The same functions MUST back both the live Editor preview in
`src/app/page.tsx` and the serverless `/api/render` and `/api/cover` endpoints. A change
that makes browser preview and API output diverge pixel-for-pixel is a regression,
regardless of whether it "looks right" in only one context.
Rationale: this identical-output guarantee between UI and API is a documented product
promise (README "Architecture" section) and the reason the app uses server-side Canvas
(@napi-rs/canvas) instead of a browser-only or DOM-dependent rendering approach.

### III. URL Is the API Contract
Every endpoint under `src/app/api/` that produces or references a renderable asset (a
mosaic, cover, or a lookup like search/art/providers) MUST be a stateless `GET` handler
that parses query parameters into a config object and returns the asset directly (PNG or
JSON). No such endpoint may require a request body, a client SDK, or multi-step session
setup to produce output. New parameters MUST be documented in README's "URL Structure"
section when added.

**Exception — Profile Management Endpoints**: endpoints that create, update, or delete
data in the BYO Credential & Creation Store (Principle I exception) — submitting/replacing
a stored credential, saving/renaming/deleting a creation — MAY use `POST`/`PUT`/`DELETE`
with a request body instead of `GET` with query parameters. This is necessary, not
optional: accepting a raw secret via a `GET` query string would recreate, on mosaiq's own
save endpoint, the exact exposure (URLs logged, cached, or stored in history) this store
exists to prevent. These endpoints are called only from mosaiq's own Editor UI, never
templated by external URL-only tools, so they don't need to satisfy the "template a URL"
property this principle otherwise protects — that property still fully governs every
render/lookup endpoint, including ones that *read* the store (e.g. `GET /api/render?
token=...&creation=...` remains a plain `GET`).

Rationale: external integrators (Nuvio, Stremio addons, AIOMetadata, Bingecat, Plex,
Jellyfin) only need to template a URL — this is the whole value proposition of the REST
API for rendering, and it must not erode into a bespoke integration surface. Profile
management is a fundamentally different interaction (a human, in mosaiq's own UI, once)
and applying the same GET-only rule to it would undermine Principle I's encryption-at-rest
guarantee by leaking the plaintext secret through the URL on the way in.

### IV. One-Directional app → lib Boundary
Code under `src/app/` MAY import from `src/lib/`. Code under `src/lib/` MUST NOT import
from `src/app/` and MUST NOT depend on Next.js request/response primitives. `src/lib/`
modules (`mosaic.ts`, `cover.ts`, `catalog.ts`, `tmdb.ts`, `i18n.ts`, `serverFonts.ts`)
MUST remain callable from a plain Node/TypeScript context without a Next.js runtime.
Rationale: this boundary is what makes Principle II (render parity) enforceable — mixing
framework concerns into `lib/` would make it impossible to guarantee identical output
between the Editor preview and the API handlers.

### V. Minimal, Optional Auth
Authentication MUST remain a single optional shared secret (`ACCESS_KEY`), checked via
`/api/auth` or equivalent, comparing against an environment variable. This is distinct
from, and unaffected by, the BYO Credential & Creation Store (Principle I exception): a
token identifies which stored third-party credentials and saved creations belong together
for a given request — it is not a login, session, username, or password, and it grants no
elevated access to mosaiq itself beyond substituting which TMDB/ImageKit credential is
used and which saved creations are visible to whoever holds that specific UUID. Adding
real user accounts, sessions, OAuth, or any authentication/authorization model beyond
`ACCESS_KEY` and the token is out of scope unless this principle is explicitly amended
again.
Rationale: matches Principle I — the token is deliberately the smallest possible
mechanism that solves "don't leak a caller's TMDB/ImageKit key to Nuvio" and "let a user
recall what they saved," not a step toward general user accounts or session-based auth.

### VI. Untrusted External Hosts Are Validated, Not Allowlisted
Endpoints that fetch or proxy externally supplied image URLs (e.g. `logo-proxy`, `art`,
`search`) MUST validate content-type, size, and blocked/private hosts (e.g. via checks
like `isBlockedHost`) rather than relying on a fixed domain allowlist. Any new
externally-sourced-URL endpoint MUST apply the same validation pattern.
Rationale: logos, posters, and catalog URLs are supplied by third-party catalog sources
(Stremio/Nuvio catalogs) and are inherently arbitrary public hosts — a rigid allowlist
would break legitimate catalogs, so safety must come from validating the response, not
the domain.

## Technology Constraints

Stack is fixed at: Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4,
`@napi-rs/canvas` for server-side Canvas rendering. Changing the rendering engine away
from Canvas 2D, or introducing a second rendering backend, requires amending Principle II
first, since parity between browser and server output is the constraint that dictated
this stack. A SQLite-compatible/libSQL client is the one permitted addition to this stack,
scoped exclusively to the BYO Credential & Creation Store exception in Principle I — it
MUST NOT be used as a general-purpose data layer for other features. There is currently no
automated test suite configured in `package.json`; adding one is encouraged but not
mandated by this constitution for features that don't otherwise call for it.

## Development Workflow

Spec Kit workflow (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`) applies to new features and non-trivial changes. Every
`/speckit-plan` run MUST evaluate its Constitution Check against the six principles
above; a plan that violates Principle II (render parity) or Principle IV (app → lib
boundary) MUST document justification in the plan's Complexity Tracking section or be
redesigned. Changes confined to `src/lib/` MUST NOT introduce framework imports; changes
confined to `src/app/api/` MUST remain stateless `GET` handlers per Principle III. Any
feature touching the credential token store MUST cite Principle I's exception explicitly
in its Constitution Check rather than treating persistence as freely permitted.

## Governance

This constitution supersedes ad-hoc practice for any conflict between the two. Amendments
require: (1) a documented rationale for the change, (2) a version bump per the rules
below, (3) a pass over `.specify/templates/plan-template.md`,
`.specify/templates/spec-template.md`, and `.specify/templates/tasks-template.md` to
check whether principle-specific references need updates. Versioning follows semantic
versioning: MAJOR for backward-incompatible principle removal or redefinition, MINOR for
a new principle or materially expanded guidance, PATCH for clarification/wording fixes.
Compliance is reviewed at `/speckit-plan` time via the Constitution Check gate; complexity
that violates a principle must be justified in-plan or the plan must be simplified.

**Version**: 2.0.0 | **Ratified**: 2026-07-18 | **Last Amended**: 2026-07-18
