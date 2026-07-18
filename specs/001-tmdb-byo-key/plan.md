# Implementation Plan: Per-User TMDB API Key (BYO Key)

**Branch**: `001-tmdb-byo-key` | **Date**: 2026-07-18 (revised) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-tmdb-byo-key/spec.md`

**Depends on**: [003-user-profiles](../003-user-profiles/plan.md) — `src/lib/profile.ts` must exist before this feature's token-resolution path can be implemented (the direct-key path has no such dependency and could ship alone if sequencing required it).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Allow any caller to override mosaiq's shared server-wide `TMDB_API_KEY` with their own TMDB credential, resolved primarily via a `?token=` parameter (looked up through feature 003's profile store) and secondarily via a direct `?tmdb_key=` parameter for one-off use. Centralize resolution in `src/lib/tmdb.ts`'s new `resolveTmdbKey`, thread it through every TMDB-calling function (`tmdbFetch`, `fetchTextlessArt`, `resolveTmdbRef`, `catalog.ts`'s `resolveMeta`/`resolveCatalog(s)`), fix `search/route.ts`'s duplicate key-reading logic, and bypass the existing in-memory catalog/provider caches whenever a non-server credential is used. The Editor registers a user's key via feature 003 and stores only the resulting token client-side, never the raw key.

## Technical Context

**Language/Version**: TypeScript 5 (Next.js 16 App Router, Node.js runtime)

**Primary Dependencies**: Next.js 16, React 19 (Editor UI). No *new* runtime dependency introduced by this feature itself — it consumes `src/lib/profile.ts` (and its `@libsql/client` dependency) from feature 003, but doesn't add anything beyond that.

**Storage**: N/A directly — this feature reads (never writes) feature 003's profile store for credential resolution; it introduces no storage of its own. A directly-supplied key is never persisted (FR-006).

**Testing**: Vitest (established by this feature; reused by 003). Unit tests for `resolveTmdbKey`'s three-way resolution (direct > token > server) and cache-bypass behavior; route-level tests updated to cover token-based requests alongside the original direct-key tests.

**Target Platform**: Serverless/Node (Vercel, Docker self-host, Netlify) for API routes; browser for the Editor UI.

**Project Type**: Web service (Next.js App Router) — single project.

**Performance Goals**: No regression vs. current per-request TMDB latency for the server-key path. Token resolution adds one profile-store lookup (fast, indexed primary-key read per feature 003's research) only when a token is actually supplied.

**Constraints**: MUST NOT persist a *directly*-supplied credential server-side beyond the request (FR-006) — this feature's own constraint; token-resolved credential persistence is entirely feature 003's responsibility, not duplicated here. MUST NOT let a non-server-key request read/write the shared in-memory catalog/provider caches (research.md Decision 4). MUST remain fully backward-compatible when no token or direct key is supplied (FR-004, FR-009).

**Scale/Scope**: Touches `src/lib/tmdb.ts`, `src/lib/catalog.ts`, five API routes (`search`, `render`, `cover`, `art`, `providers`), and `src/app/page.tsx` (Editor: register-and-store-token flow replacing the original store-raw-key-locally flow). Depends on, but does not modify, `src/lib/profile.ts` (feature 003).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Self-Hosted, Minimal State)** — PASS. This feature introduces no persisted state of its own; it only *reads* feature 003's already-justified, bounded credential store. The direct-key path remains fully stateless, as originally designed.
- **Principle II (Render Parity)** — PASS / N/A, unchanged — this feature doesn't touch rendering.
- **Principle III (URL Is the API Contract)** — PASS. Both the token and the direct-key parameter travel as query parameters on `GET` requests to render/lookup endpoints — no change to those endpoints' GET-only nature. (The separate `POST /api/profile` registration call belongs to feature 003's Principle III exception, not this feature.)
- **Principle IV (One-Directional app → lib Boundary)** — PASS. `resolveTmdbKey` lives in `src/lib/tmdb.ts` and calls into `src/lib/profile.ts` — both framework-free `lib/` modules; routes only pass parsed parameters through, unchanged from the original design.
- **Principle V (Minimal, Optional Auth)** — PASS / N/A, unchanged.
- **Principle VI (Untrusted External Hosts Validated, Not Allowlisted)** — N/A, unchanged.

No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-tmdb-byo-key/
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
│   ├── tmdb.ts           # MODIFIED: add resolveTmdbKey(directKey?, token?); thread
│   │                       through tmdbFetch, fetchTextlessArt, resolveTmdbRef.
│   │                       Imports getProfile from ./profile (feature 003).
│   └── catalog.ts        # MODIFIED: resolveMeta/resolveCatalog/resolveCatalogs accept
│                            + forward {directKey?, token?}; bypass in-memory cache
│                            whenever resolution source !== "server"
├── app/
│   ├── page.tsx           # MODIFIED: TMDB-key input now calls POST /api/profile
│   │                        (feature 003) to register, stores only the returned token
│   │                        in localStorage ("tmdbToken"), appends &token= to outgoing
│   │                        URLs; also accepts pasting an existing token directly
│   └── api/
│       ├── search/route.ts     # MODIFIED: remove duplicate tmdbAuth(), use
│       │                         resolveTmdbKey via lib/tmdb.ts instead
│       ├── render/route.ts     # MODIFIED: read token/tmdb_key, pass through to
│       │                         resolveCatalogs()
│       ├── cover/route.ts      # MODIFIED: read token/tmdb_key, pass through
│       ├── art/route.ts        # MODIFIED: read token/tmdb_key, pass through
│       └── providers/route.ts  # MODIFIED: read token/tmdb_key, pass through,
│                                  bypass cache when source !== "server"

tests/                     # Reused from feature 003 (first introduced there)
├── lib/
│   ├── tmdb.test.ts        # resolveTmdbKey: direct > token > server precedence,
│   │                         v3/v4 auth, cache-bypass triggering
│   └── catalog.test.ts     # cache bypass with token/direct override, resolveMeta fallback
└── api/
    ├── search.test.ts
    ├── render.test.ts
    ├── cover.test.ts
    ├── art.test.ts
    └── providers.test.ts
```

**Structure Decision**: Single project, unchanged from the original plan. No new top-level directories; `tests/` is shared with (first introduced by) feature 003, not reintroduced here.

## Post-Design Constitution Check

*Re-evaluated after Phase 1 (data-model.md, contracts/, quickstart.md).*

No new violations. `data-model.md` confirms this feature adds no entities of its own (it only references feature 003's `Profile`). `contracts/` confirms the render/lookup endpoints stay `GET`-only with query parameters. Gate: **PASS**.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally omitted.
