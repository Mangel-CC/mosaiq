<!--
Sync Impact Report
- Version change: [TEMPLATE] → 1.0.0 (initial ratification)
- Modified principles: n/a (first concrete version, replacing bracketed template)
- Added sections: I. Self-Hosted, No Database; II. Render Parity (Browser ⇄ Server);
  III. URL Is the API Contract; IV. One-Directional app → lib Boundary;
  V. Minimal, Optional Auth; VI. Untrusted External Hosts Are Validated, Not Allowlisted
- Removed sections: none (template placeholders only)
- Templates requiring updates:
  ✅ .specify/templates/plan-template.md (generic "Constitution Check" gate, no principle-specific text to sync)
  ✅ .specify/templates/spec-template.md (no constitution-specific references)
  ✅ .specify/templates/tasks-template.md (no constitution-specific references)
  ✅ .claude/skills/speckit-*/SKILL.md (generic, no project-specific or other-agent references found)
- Follow-up TODOs: TODO(RATIFICATION_DATE) is set to the date this constitution was first
  authored (2026-07-18); adjust if an earlier informal ratification date is later identified.
-->

# mosaiq Constitution

## Core Principles

### I. Self-Hosted, No Database
mosaiq MUST remain deployable as a single Docker container with no required database.
All request state MUST be derivable from query parameters and external catalog/TMDB URLs
at request time; nothing about a render may depend on server-side persisted state beyond
short-lived cache. Any feature that would require a database, user accounts, or durable
server-side storage MUST be rejected or redesigned to stay stateless.
Rationale: the primary audience is home-lab Plex/Jellyfin/Stremio users self-hosting on
minimal hardware (~$5-10/month VPS); zero-database operation is what makes that viable,
and it is the explicit distribution model documented in the README.

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
Every endpoint under `src/app/api/` MUST be a stateless `GET` handler that parses query
parameters into a config object and returns the asset directly (PNG or JSON). No endpoint
may require a request body, a client SDK, or multi-step session setup to produce output.
New parameters MUST be documented in README's "URL Structure" section when added.
Rationale: external integrators (Nuvio, Stremio addons, AIOMetadata, Bingecat, Plex,
Jellyfin) only need to template a URL — this is the whole value proposition of the REST
API, and it must not erode into a bespoke integration surface.

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
`/api/auth` or equivalent, comparing against an environment variable. Adding user
accounts, sessions, OAuth, or any per-user identity model is out of scope unless this
principle is explicitly amended first.
Rationale: matches Principle I (no database) — user accounts would require persistent
storage and materially change the deployment and operational model the project commits to.

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
this stack. There is currently no automated test suite configured in `package.json`;
adding one is encouraged but not mandated by this constitution — do not block PRs solely
for lacking tests until a testing principle is explicitly ratified.

## Development Workflow

Spec Kit workflow (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`) applies to new features and non-trivial changes. Every
`/speckit-plan` run MUST evaluate its Constitution Check against the six principles
above; a plan that violates Principle II (render parity) or Principle IV (app → lib
boundary) MUST document justification in the plan's Complexity Tracking section or be
redesigned. Changes confined to `src/lib/` MUST NOT introduce framework imports; changes
confined to `src/app/api/` MUST remain stateless `GET` handlers per Principle III.

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

**Version**: 1.0.0 | **Ratified**: 2026-07-18 | **Last Amended**: 2026-07-18
