# Implementation Plan: Generated Image Caching via User-Owned CDN (BYO CDN)

**Branch**: `002-cdn-render-cache` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-cdn-render-cache/spec.md`

**Depends on**: [003-user-profiles](../003-user-profiles/plan.md) (token/credential resolution) and, informally, shares its Vitest test setup with [001-tmdb-byo-key](../001-tmdb-byo-key/plan.md) — no code dependency between 001 and 002 themselves, both depend on 003 independently.

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add an optional caching layer to `/api/render` and `/api/cover`: when a caller's ImageKit credential resolves (via `?token=`, primarily, or a direct `?imagekit_key=` parameter, secondarily — both through the same resolution pattern as feature 001), the rendered PNG is uploaded to a dedicated `mosaiq-cache/` prefix in the caller's own ImageKit account under a deterministic filename encoding both the request's configuration and a freshness token (a hash of fetched catalog content for `catalog=...` requests, or a constant for static `imgs=...` requests). A cache hit responds with a redirect to the CDN asset instead of re-rendering; a stale/missing entry triggers a fresh render, upload, and cleanup of the previous version. New logic lives entirely in `src/lib/cdnCache.ts`, using hand-rolled `fetch` calls to ImageKit's REST API (no SDK dependency).

## Technical Context

**Language/Version**: TypeScript 5 (Next.js 16 App Router, Node.js runtime)

**Primary Dependencies**: None new at the package level — ImageKit calls use the platform `fetch` (research.md Decision 6). Depends on `src/lib/profile.ts` (feature 003) for token resolution, which itself brings in `@libsql/client` (not a new dependency introduced by this feature).

**Storage**: N/A on mosaiq's side — the "cache" is entirely the caller's own ImageKit account (Constitution Principle I, unchanged core stance); this feature reads (never writes) feature 003's profile store for credential resolution, same as feature 001.

**Testing**: Vitest (shared setup from feature 001/003). Unit tests for `src/lib/cdnCache.ts` (cache-key/freshness-token derivation, ImageKit request construction, overwrite/delete semantics — using mocked `fetch`); route-level tests for `/api/render` and `/api/cover` covering cache-miss, cache-hit-redirect, stale-catalog-replace, and CDN-failure-falls-back-to-normal-render paths.

**Target Platform**: Serverless/Node (Vercel, Docker self-host, Netlify) for the two render endpoints.

**Project Type**: Web service (Next.js App Router) — single project.

**Performance Goals**: A cache hit MUST be substantially faster than a full render (no Canvas work, no TMDB/catalog image fetches beyond the catalog-content check for `catalog=...` requests) — this is the feature's entire value proposition (spec SC-001). A cache miss adds the cost of one ImageKit list/search call (freshness check) and one upload call on top of today's render cost; this overhead MUST NOT block returning the rendered image to the caller (FR-011 — upload happens, but a failure there must not delay/fail the response).

**Constraints**: MUST NOT let a CDN problem fail the render itself (FR-011). MUST NOT touch anything outside the dedicated `mosaiq-cache/` prefix in the caller's CDN (FR-010). MUST NOT persist a directly-supplied CDN credential server-side (FR-009) — token-resolved credential persistence is feature 003's responsibility, not duplicated here.

**Scale/Scope**: New file `src/lib/cdnCache.ts`. Modified: `src/app/api/render/route.ts`, `src/app/api/cover/route.ts` (wrap existing render logic with cache-check/cache-save calls). No change to `src/lib/mosaic.ts`/`src/lib/cover.ts` (the render engine itself — Principle II). Depends on, but does not modify, `src/lib/profile.ts` (feature 003).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Self-Hosted, Minimal State)** — PASS. The cache itself lives entirely in the caller's own CDN account, not on mosaiq's server — this is the core design already established (unchanged by the token-resolution revision). Credential resolution reads feature 003's already-justified, bounded store; this feature adds no persistence of its own.
- **Principle II (Render Parity)** — PASS. `src/lib/mosaic.ts`/`src/lib/cover.ts` (the actual Canvas rendering) are untouched; this feature only wraps *when* a render happens, never *how*.
- **Principle III (URL Is the API Contract)** — PASS, with a noted nuance: `/api/render`/`/api/cover` remain `GET` with query parameters (token, direct key, and all existing params) — no change to that. The response on a cache hit becomes a `302` redirect instead of a direct PNG body (research.md Decision 1) — this is a response-shape nuance, not a violation of "GET, query-param-driven" (the request side is unaffected; documented explicitly in `contracts/`).
- **Principle IV (One-Directional app → lib Boundary)** — PASS. All caching/ImageKit logic lives in `src/lib/cdnCache.ts` (framework-free), which imports `src/lib/profile.ts` (also framework-free) — `lib → lib`, not `app → lib`. Routes only orchestrate.
- **Principle V (Minimal, Optional Auth)** — N/A, unaffected.
- **Principle VI (Untrusted External Hosts Validated, Not Allowlisted)** — N/A — ImageKit's API hosts (`upload.imagekit.io`, `api.imagekit.io`) are hardcoded, trusted endpoints (like `TMDB_BASE`), not caller-supplied hosts being proxied.

No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-cdn-render-cache/
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
│   └── cdnCache.ts        # NEW: resolveImageKitKey, tryServeCached, saveToCache,
│                             configHash/freshnessToken derivation, ImageKit REST calls
│                             (upload/list/delete via fetch). Imports getProfile from
│                             ./profile (feature 003).
├── app/
│   └── api/
│       ├── render/route.ts   # MODIFIED: resolve ImageKit credential, check cache
│       │                       before rendering, save after rendering on miss/stale
│       └── cover/route.ts    # MODIFIED: same wrapping

tests/                     # Reused from features 001/003
├── lib/
│   └── cdnCache.test.ts    # NEW: cache-key derivation, freshness-token logic,
│                             overwrite/delete semantics (mocked ImageKit fetch calls)
└── api/
    ├── render.test.ts      # MODIFIED: add cache-hit/miss/stale/CDN-failure cases
    └── cover.test.ts       # MODIFIED: same
```

**Structure Decision**: Single project, consistent with the existing layout and features 001/003. One new `lib/` module (`cdnCache.ts`); no new route files (render/cover are modified in place, not replaced).

## Post-Design Constitution Check

*Re-evaluated after Phase 1 (data-model.md, contracts/, quickstart.md).*

Unchanged from pre-design. `data-model.md` confirms no entities are stored server-side by this feature (the "cache" is entirely CDN-resident, credential resolution reuses feature 003's `Profile`). `contracts/` documents the conditional `302` response shape explicitly, keeping the request-side contract (`GET`, query params) fully intact. Gate: **PASS**.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally omitted.
