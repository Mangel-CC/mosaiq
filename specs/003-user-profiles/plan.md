# Implementation Plan: User Credential & Creation Profiles (UUID Token)

**Branch**: `003-user-profiles` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-user-profiles/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Introduce an opaque, server-generated UUID token that identifies a minimal per-user
profile: optionally-stored, encrypted TMDB/ImageKit credentials, and zero or more named
"creations" (saved mosaic/cover Editor configurations). A new `src/lib/profile.ts` module
backed by `@libsql/client` (local SQLite file for self-hosted Docker, remote Turso/libSQL
for Vercel) provides the storage; new `POST`/`GET`/`PUT`/`DELETE` routes under
`src/app/api/profile/` expose it. This is the foundational mechanism features 001
(TMDB BYO key) and 002 (CDN render cache) both resolve their credentials through, and the
mechanism that lets a saved creation be rendered from a short, stable URL instead of a
full parameter list.

## Technical Context

**Language/Version**: TypeScript 5 (Next.js 16 App Router, Node.js runtime)

**Primary Dependencies**: `@libsql/client` (new — the only new runtime dependency this
feature adds; see research.md Decision 1). Node's built-in `crypto` for encryption (no new
dependency).

**Storage**: SQLite-compatible via libSQL — a local file for Docker self-hosting, a
Turso-hosted remote libSQL database for serverless (Vercel) deployments, selected by the
`MOSAIQ_DB_URL` environment variable. This is a bounded exception to Constitution
Principle I, not a general-purpose database.

**Testing**: Vitest (established by feature 001 — reused here, not reintroduced). Unit
tests for `lib/profile.ts` (encryption round-trip, CRUD operations against an in-memory/
temp-file libSQL instance); route-level tests for the new `/api/profile*` endpoints.

**Target Platform**: Serverless/Node (Vercel with Turso, Docker self-host with a local
file, per README) for the profile API routes; browser for the Editor's profile UI.

**Project Type**: Web service (Next.js App Router) — single project, no new top-level
architecture beyond `lib/profile.ts` and the new `app/api/profile/` route group.

**Performance Goals**: Profile reads/writes are simple keyed lookups (primary key on
`token`, indexed foreign key on `creations.profile_token`) — expected to be low-latency
regardless of backend (local file or Turso). No specific numeric target; must not
noticeably slow down the Editor's save/load interactions (sub-second, matching the feel of
existing `localStorage`-backed interactions it's replacing/extending for logged-in-token
users).

**Constraints**: Credentials MUST be encrypted at rest (FR-010); raw credential values
MUST NOT be returned by any endpoint after initial submission (FR-003); profile-management
mutations MUST NOT be `GET` requests carrying secrets (Constitution Principle III
exception); an invalid token or creation reference MUST fail clearly, never silently
(FR-007).

**Scale/Scope**: New files only — `src/lib/profile.ts`, `src/app/api/profile/route.ts`,
`src/app/api/profile/creations/route.ts`, `src/app/api/profile/creations/[id]/route.ts`,
plus Editor UI additions in `src/app/page.tsx` for entering/creating a token, viewing
profile state, and managing creations. No existing render/lookup endpoint is modified by
this feature itself (that's features 001/002, layered on top).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Self-Hosted, Minimal State) — BYO Credential & Creation Store exception**
  — PASS, this feature *is* the exception's concrete implementation. Stores exactly
  `{token, encrypted credentials, named creations, timestamps}` — nothing more. Uses the
  mandated SQLite-compatible/libSQL store (research.md Decision 1), not a general-purpose
  database. Credentials encrypted at rest (research.md Decision 2).
- **Principle II (Render Parity)** — N/A. This feature never touches rendering; it only
  stores/retrieves configuration data and credentials that other features consume.
- **Principle III (URL Is the API Contract) — Profile Management exception** — PASS by
  design: mutation endpoints (`POST`/`PUT`/`DELETE` under `/api/profile*`) use bodies, not
  query params, specifically because they carry secrets — the documented, necessary
  exception. The one read endpoint (`GET /api/profile?token=...`) stays `GET` since it
  carries no secret in the request.
- **Principle IV (One-Directional app → lib Boundary)** — PASS. All storage/encryption/
  CRUD logic lives in `src/lib/profile.ts` (framework-free, no Next.js imports); routes
  under `src/app/api/profile/` only parse requests and call into it.
- **Principle V (Minimal, Optional Auth)** — PASS. The token is explicitly not a login/
  session/account per this principle's amended text; `ACCESS_KEY` is untouched and
  independent.
- **Principle VI (Untrusted External Hosts Validated, Not Allowlisted)** — N/A. This
  feature doesn't fetch or proxy any externally-supplied URL/host.

No unjustified violations. The two exceptions invoked (Principle I, Principle III) are
both pre-amended, bounded, and directly cited here rather than treated as free-standing
persistence/GET-bypass — satisfying the Development Workflow requirement to cite the
exception explicitly.

## Project Structure

### Documentation (this feature)

```text
specs/003-user-profiles/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── profile.ts         # NEW: libSQL client, encryption helpers, profile/creation CRUD
├── app/
│   ├── page.tsx            # MODIFIED: token entry/creation UI, profile state, creations
│   │                          list (save/load/rename/delete), "get shareable URL" action
│   └── api/
│       └── profile/
│           ├── route.ts               # NEW: GET (read profile), POST (create/update
│           │                            credentials)
│           └── creations/
│               ├── route.ts           # NEW: POST (create a creation)
│               └── [id]/route.ts      # NEW: PUT (update), DELETE (remove) a creation

tests/
├── lib/
│   └── profile.test.ts     # NEW: encryption round-trip, CRUD, cascade delete
└── api/
    └── profile.test.ts     # NEW: route-level tests for all /api/profile* endpoints
```

**Structure Decision**: Single project (Next.js App Router), consistent with the existing
layout and with feature 001's `tests/` directory (reused, not reintroduced). One new `lib/`
module and one new route group (`app/api/profile/`) — no new top-level directories.

## Post-Design Constitution Check

*Re-evaluated after Phase 1 (data-model.md, contracts/, quickstart.md).*

Unchanged from pre-design: `data-model.md` confirms the two-table schema stores nothing
beyond what Principle I's exception permits; `contracts/` confirms every mutation endpoint
carries its secret/data in a body, never a query string; the one `GET` endpoint's request
carries no secret. Gate: **PASS**.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No unjustified violations — table intentionally omitted. The two constitution exceptions
this feature relies on (Principle I, Principle III) were pre-amended specifically to
accommodate it, with rationale recorded in the constitution itself rather than here.
