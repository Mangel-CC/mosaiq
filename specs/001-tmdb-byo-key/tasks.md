---

description: "Task list for Per-User TMDB API Key (BYO Key)"
---

# Tasks: Per-User TMDB API Key (BYO Key)

**Input**: Design documents from `/specs/001-tmdb-byo-key/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tmdb-key-param.md, quickstart.md, and [003-user-profiles](../003-user-profiles/tasks.md)'s User Story 1 (MVP) — `getProfile`/`src/lib/profile.ts` must exist and work before this feature's token-resolution path can be implemented (the direct-key path has no such dependency).

**Tests**: Included — Vitest is already set up by feature 003.

**Organization**: Tasks are grouped by user story (spec.md P1/P2/P3).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single project — `src/`, `tests/` at repository root.

---

## Phase 1: Setup

- [X] T001 Verify [003-user-profiles](../003-user-profiles/tasks.md) User Story 1 is implemented and its tests pass (`src/lib/profile.ts` exposes a working `getProfile`) — this feature's token path cannot proceed otherwise

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Centralized credential-resolution logic every endpoint in this feature depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Implement `resolveTmdbKey({ directKey?, token? }): Promise<{ key: string; source: "direct" | "token" | "server" }>` in `src/lib/tmdb.ts` (imports `getProfile` from `./profile`; precedence: direct > token > server, per data-model.md)
- [X] T003 Thread `resolveTmdbKey` through `tmdbFetch`, `fetchTextlessArt`, `resolveTmdbRef` in `src/lib/tmdb.ts`
- [X] T004 [P] Extend `resolveMeta`/`resolveCatalog`/`resolveCatalogs` in `src/lib/catalog.ts` to accept and forward `{ directKey?, token? }` to `lib/tmdb.ts`
- [X] T005 Add cache-bypass logic to `resolveCatalog`'s module-level cache in `src/lib/catalog.ts` — skip read/write whenever resolution `source !== "server"` (research.md Decision 4)
- [X] T006 [P] Add the same cache-bypass logic to `src/app/api/providers/route.ts`'s module-level cache
- [X] T007 Remove the duplicate inline `tmdbAuth()` from `src/app/api/search/route.ts`; replace with `resolveTmdbKey` via `lib/tmdb.ts` (research.md Decision 3 codebase finding)

**Checkpoint**: Resolution logic ready — endpoint wiring can now begin

---

## Phase 3: User Story 1 - Bring your own TMDB key via a saved profile token (Priority: P1) 🎯 MVP

**Goal**: Every TMDB-touching endpoint (`search`, `render`, `cover`, `art`, `providers`) resolves a caller's credential via `?token=` (primary) or `?tmdb_key=` (secondary), falling back to the shared server key, with clear errors on rejection and no silent fallback.

**Independent Test**: quickstart.md Scenarios 1-6 — register a key, get a token, confirm it's used instead of the server key; confirm an invalid registered key fails clearly; confirm an unresolvable token fails open to the server key, not an error.

### Tests for User Story 1

- [X] T008 [P] [US1] Unit test: `resolveTmdbKey` precedence (direct > token > server), empty direct key treated as absent, unresolvable token fails open to server, in `tests/lib/tmdb.test.ts`
- [X] T009 [P] [US1] Unit test: cache bypass triggers in `resolveCatalog` whenever `source !== "server"`, in `tests/lib/catalog.test.ts`
- [X] T010 [P] [US1] Route test: `GET /api/search` honors `token`/`tmdb_key`, surfaces TMDB rejection without fallback, in `tests/api/search.test.ts`
- [X] T011 [P] [US1] Route test: `GET /api/art` honors `token`/`tmdb_key`, in `tests/api/art.test.ts`
- [X] T012 [P] [US1] Route test: `GET /api/providers` honors `token`/`tmdb_key` and bypasses its cache accordingly, in `tests/api/providers.test.ts`
- [X] T013 [P] [US1] Route test: `GET /api/render` honors `token`/`tmdb_key` for `catalog=` resolution, in `tests/api/render.test.ts`
- [X] T014 [P] [US1] Route test: `GET /api/cover` honors `token`/`tmdb_key` for `?notext=1` and `catalog=` resolution, in `tests/api/cover.test.ts`

### Implementation for User Story 1

- [X] T015 [US1] Read `token`/`tmdb_key` query parameters and pass to `resolveTmdbKey`/`fetchTextlessArt`/`resolveTmdbRef` in `src/app/api/search/route.ts`
- [X] T016 [US1] Same wiring in `src/app/api/art/route.ts`
- [X] T017 [US1] Same wiring in `src/app/api/providers/route.ts`
- [X] T018 [US1] Same wiring in `src/app/api/render/route.ts`, passed through to `resolveCatalogs`
- [X] T019 [US1] Same wiring in `src/app/api/cover/route.ts`, passed through to `resolveTmdbRef`/`fetchTextlessArt`/`resolveCatalogs`

**Checkpoint**: User Story 1 fully functional and independently testable across all five endpoints

---

## Phase 4: User Story 2 - Register and reuse a key from the web Editor (Priority: P2)

**Goal**: The Editor lets a user enter their TMDB key once, registers it via feature 003, and stores only the resulting token client-side — never the raw key.

**Independent Test**: quickstart.md Scenario 7 — enter a key in the Editor, confirm `localStorage` holds only a token (no raw key string anywhere), reload, confirm it's still applied.

**Depends on**: User Story 1 (the endpoints the Editor calls must already honor `token`).

### Implementation for User Story 2

*(No automated tests for `page.tsx` — this project has no component-testing infrastructure; validated manually via quickstart.md Scenario 7, consistent with how the rest of the Editor is tested today.)*

- [X] T020 [US2] Add a `tmdbToken` state + `localStorage` persistence in `src/app/page.tsx`, mirroring the existing `accessKey` pattern (load-once `useEffect`, save-on-change `useEffect`)
- [X] T021 [US2] Wire the TMDB-key input: on entry, call `POST /api/profile` (feature 003) with `{ token: <existing, if any>, tmdbKey: <entered value> }`, store only the returned token (never the raw key)
- [X] T022 [US2] Add a way to paste an existing token directly (skips the registration call), storing it the same way
- [X] T023 [US2] Add a `withTmdbToken`-style helper (mirroring `withKey`) that appends `&token=` to outgoing search/render/cover URLs, and wire it into the Editor's existing request-building code
- [X] T024 [US2] Add a "remove my TMDB credential" action that calls `DELETE /api/profile` with `{ token, service: "tmdb" }`

**Checkpoint**: User Stories 1 and 2 both independently functional

---

## Phase 5: User Story 3 - No change for operators who don't use the feature (Priority: P3)

**Goal**: Zero regression for callers who never supply a token or direct key.

**Independent Test**: quickstart.md Scenario 1 — existing calls with no new parameters behave identically to pre-feature behavior.

### Tests for User Story 3

- [X] T025 [P] [US3] Regression test: each of the five route test files (`tests/api/*.test.ts`) includes a case with no `token`/`tmdb_key` supplied, asserting output is byte-identical/behaviorally identical to the pre-feature baseline

**Checkpoint**: All three user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [P] Document `token` and `tmdb_key` parameters in `README.md`'s "URL Structure" section (Constitution Principle III requirement)
- [X] T027 Run all `quickstart.md` scenarios (1-8) manually against a local dev server as final validation — Scenarios 1, 4, 5 (backward compat, fail-open-to-server-key, invalid-credential rejection) validated directly against real TMDB; Scenarios 2/3/6 (which need a second real personal TMDB key not available in this environment) validated via the automated route tests' `expectedApiKey` assertions instead; Scenario 7 (Editor) validated by code review — it reuses feature 003's existing `profileToken` mechanism, storing only the token in `localStorage`, never the raw key; Scenario 8 (cache bypass) covered by `tests/lib/catalog.test.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depends on [003-user-profiles](../003-user-profiles/tasks.md) User Story 1 being complete
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on User Story 1 (Editor calls the now-token-aware endpoints)
- **User Story 3 (Phase 5)**: Depends on User Story 1 (tests assert behavior US1 introduced doesn't regress the no-param case)
- **Polish (Phase 6)**: Depends on all three user stories

### Parallel Opportunities

- T004, T006 (Foundational) in parallel with T002/T003/T005/T007's sequential chain where files differ
- T008-T014 (US1 tests) in parallel with each other
- T015-T019 (US1 implementation) in parallel with each other (different route files) once T002-T007 are done
- T025 (US3) can run in parallel across its five files once US1 lands

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (verify 003's MVP is done)
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: quickstart.md Scenarios 1-6 pass — this alone delivers the feature's core motivation (relieving the public instance's shared TMDB quota)
5. User Story 2 (Editor convenience) and User Story 3 (regression coverage) can follow incrementally

### Incremental Delivery

1. Setup + Foundational → resolution logic ready
2. User Story 1 → all five endpoints honor token/direct key → **core value delivered**
3. User Story 2 → Editor UX complete
4. User Story 3 → regression safety net formalized

---

## Notes

- [P] tasks = different files, no ordering dependency
- This feature's own Setup phase is unusually thin because its real prerequisite (storage, encryption, token issuance) lives entirely in [003-user-profiles](../003-user-profiles/tasks.md) — don't duplicate that work here
- Commit after each phase checkpoint
