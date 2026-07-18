---

description: "Task list for Generated Image Caching via User-Owned CDN (BYO CDN)"
---

# Tasks: Generated Image Caching via User-Owned CDN (BYO CDN)

**Input**: Design documents from `/specs/002-cdn-render-cache/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/render-cache.md, quickstart.md, and [003-user-profiles](../003-user-profiles/tasks.md)'s User Story 1 (MVP) — `src/lib/profile.ts`'s `getProfile` must exist before this feature's token-resolution path can be implemented (the direct-key path has no such dependency). No code dependency on [001-tmdb-byo-key](../001-tmdb-byo-key/tasks.md) — both depend on 003 independently and can be built in parallel.

**Tests**: Included — Vitest is already set up by feature 003.

**Organization**: Tasks are grouped by user story (spec.md P1/P2/P3).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single project — `src/`, `tests/` at repository root.

---

## Phase 1: Setup

- [ ] T001 Verify [003-user-profiles](../003-user-profiles/tasks.md) User Story 1 is implemented and its tests pass (`src/lib/profile.ts` exposes a working `getProfile`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `cdnCache.ts` module every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 Implement `resolveImageKitKey({ directKey?, token? }): Promise<{ key: string; source: "direct" | "token" } | null>` in `src/lib/cdnCache.ts` (imports `getProfile` from `./profile`; precedence: direct > token > none, per data-model.md — note only two sources, no server fallback)
- [ ] T003 Implement `computeConfigHash(searchParams)` in `src/lib/cdnCache.ts` — SHA-256 (hex, truncated) of every query parameter that affects rendered output, sorted, excluding `key`/`token`/`tmdb_key`/`imagekit_key` (research.md Decision 3)
- [ ] T004 Implement `computeFreshnessToken(catalogItems?)` in `src/lib/cdnCache.ts` — returns the constant `"static"` when called with no catalog items (pure `imgs=` request), else a hash of the resolved `CatalogItem[]` array (from `resolveCatalogs`) representing the catalog's current content (research.md Decisions 2-3)
- [ ] T005 [P] Implement ImageKit REST wrappers in `src/lib/cdnCache.ts` using `fetch` with HTTP Basic Auth (private key as username): `uploadFile`, `listFilesByPrefix`, `deleteFile` (research.md Decisions 4, 6)
- [ ] T006 Implement `tryServeCached(configHash, freshnessToken, resolvedKey): Promise<{ url: string } | null>` in `src/lib/cdnCache.ts` — lists `mosaiq-cache/{configHash}--` prefix via T005, returns the matching-freshness-token file's `url` on a hit, `null` otherwise (research.md Decision 3)
- [ ] T007 Implement `saveToCache(configHash, freshnessToken, imageBuffer, resolvedKey): Promise<void>` in `src/lib/cdnCache.ts` — uploads to `mosaiq-cache/{configHash}--{freshnessToken}.png` with `useUniqueFileName: false` (research.md Decision 5), then deletes any other file matching the `configHash` prefix with a *different* freshness-token suffix (stale cleanup, FR-008)

**Checkpoint**: `cdnCache.ts` ready — route wiring can now begin

---

## Phase 3: User Story 1 - Skip re-rendering unchanged explicit-list mosaics (Priority: P1) 🎯 MVP

**Goal**: `/api/render` and `/api/cover` cache and redirect for unchanged `imgs=`-based requests when a CDN credential resolves.

**Independent Test**: quickstart.md Scenarios 1-4 — first request with a token renders and caches; identical repeat request returns a `302` redirect; a changed parameter produces a distinct cache entry.

### Tests for User Story 1

- [ ] T008 [P] [US1] Unit test: `computeConfigHash` is deterministic, excludes credential params, differs on any output-affecting parameter change, in `tests/lib/cdnCache.test.ts`
- [ ] T009 [P] [US1] Unit test: `tryServeCached`/`saveToCache` round-trip with `freshnessToken: "static"` (mocked ImageKit `fetch` calls), in `tests/lib/cdnCache.test.ts`
- [ ] T010 [P] [US1] Route test: `GET /api/render` — cache miss renders+uploads (`200`), repeat identical request returns `302`, changed params produce a distinct entry, in `tests/api/render.test.ts`
- [ ] T011 [P] [US1] Route test: `GET /api/cover` — same coverage, in `tests/api/cover.test.ts`

### Implementation for User Story 1

- [ ] T012 [US1] In `src/app/api/render/route.ts`: resolve credential (T002), compute `configHash` (T003), check `tryServeCached` with `freshnessToken: "static"` before rendering for `imgs=`-only requests; on hit, respond `302` with `Location`; on miss, proceed to existing render logic
- [ ] T013 [US1] In `src/app/api/render/route.ts`: after a successful render (miss path), call `saveToCache` with the rendered PNG buffer
- [ ] T014 [US1] Same check-before/save-after wiring (`imgs=`/static case) in `src/app/api/cover/route.ts`

**Checkpoint**: User Story 1 fully functional and independently testable for explicit-list requests

---

## Phase 4: User Story 2 - Keep dynamic catalog mosaics fresh (Priority: P2)

**Goal**: `catalog=` requests cache correctly, detecting staleness via the catalog's actual current content rather than just the request URL.

**Independent Test**: quickstart.md Scenario 5 — two immediate identical `catalog=` requests: first misses, second hits (unchanged content); when the catalog's real content changes, the next request misses again and the CDN ends up with only the new version.

**Depends on**: User Story 1 (reuses the same `tryServeCached`/`saveToCache` machinery, extended with a real `freshnessToken` instead of the constant).

### Tests for User Story 2

- [ ] T015 [P] [US2] Unit test: `computeFreshnessToken` produces a stable hash for identical `CatalogItem[]` input and a different hash when items differ, in `tests/lib/cdnCache.test.ts`
- [ ] T016 [P] [US2] Unit test: `saveToCache` deletes a prior file with the same `configHash` but a different `freshnessToken`, leaving exactly one file behind, in `tests/lib/cdnCache.test.ts`
- [ ] T017 [P] [US2] Route test: `GET /api/render?catalog=...` — cache hit when catalog content unchanged, fresh render + old-file-replaced when it changes, in `tests/api/render.test.ts`

### Implementation for User Story 2

- [ ] T018 [US2] In `src/app/api/render/route.ts`: for `catalog=` requests, compute `freshnessToken` via T004 from the `CatalogItem[]` already returned by `resolveCatalogs`, and use it (instead of `"static"`) in the `tryServeCached`/`saveToCache` calls from T012/T013
- [ ] T019 [US2] Same in `src/app/api/cover/route.ts` for its `catalog=` background-source path

**Checkpoint**: User Stories 1 and 2 both independently functional

---

## Phase 5: User Story 3 - Opt-in with zero impact when not used (Priority: P3)

**Goal**: No credential resolves → zero behavior change; any CDN failure never breaks the render itself.

**Independent Test**: quickstart.md Scenarios 6-7 (no credential; invalid/unreachable credential) — always `200` with a valid PNG.

### Tests for User Story 3

- [ ] T020 [P] [US3] Regression test: `render`/`cover` with no `token`/`imagekit_key` behave identically to pre-feature (no CDN calls attempted), in `tests/api/render.test.ts` + `tests/api/cover.test.ts`
- [ ] T021 [P] [US3] Test: any `cdnCache.ts` failure (invalid key, network error, mocked non-2xx from ImageKit) never throws past the caller — render still returns `200` with a valid PNG, in `tests/lib/cdnCache.test.ts`

### Implementation for User Story 3

- [ ] T022 [US3] Wrap all `cdnCache` calls (resolve, check, save) in `src/app/api/render/route.ts` and `src/app/api/cover/route.ts` in `try/catch` that logs and continues rather than ever failing or delaying the render response (FR-011)

**Checkpoint**: All three user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T023 [P] Document `token`/`imagekit_key` parameters and the conditional `302` cache-hit response in `README.md`'s "URL Structure" section
- [ ] T024 Run all `quickstart.md` scenarios (1-7) manually against a real ImageKit account as final validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depends on [003-user-profiles](../003-user-profiles/tasks.md) User Story 1
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on User Story 1 (extends its cache machinery)
- **User Story 3 (Phase 5)**: Depends on User Story 1 (wraps its call sites)
- **Polish (Phase 6)**: Depends on all three user stories

### Parallel Opportunities

- T005 (Foundational) in parallel with T003/T004 (different concerns within the same new file, but no shared state)
- T008-T011 (US1 tests) in parallel with each other
- T015-T017 (US2 tests) in parallel with each other
- T020-T021 (US3 tests) in parallel with each other
- This entire feature can be implemented in parallel with [001-tmdb-byo-key](../001-tmdb-byo-key/tasks.md) — both depend only on 003, not on each other

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (verify 003's MVP is done)
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: quickstart.md Scenarios 1-4 pass — this alone delivers the core "skip re-rendering" value for the simpler, safer `imgs=` case
5. User Story 2 (catalog freshness) and User Story 3 (failure resilience) follow incrementally

### Incremental Delivery

1. Setup + Foundational → `cdnCache.ts` ready
2. User Story 1 → explicit-list caching works → **core perf value delivered**
3. User Story 2 → dynamic catalog caching works safely (no stale content ever served)
4. User Story 3 → failure modes formally covered (though T022's try/catch discipline should already be present from T012-T014 in practice — this phase formalizes and tests it)

---

## Notes

- [P] tasks = different files or independent functions within `cdnCache.ts`, no ordering dependency
- No code dependency on [001-tmdb-byo-key](../001-tmdb-byo-key/tasks.md) — safe to implement in either order, or in parallel, once 003's MVP exists
- Commit after each phase checkpoint
