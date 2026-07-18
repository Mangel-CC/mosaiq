---

description: "Task list for User Credential & Creation Profiles (UUID Token)"
---

# Tasks: User Credential & Creation Profiles (UUID Token)

**Input**: Design documents from `/specs/003-user-profiles/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/profile-api.md, quickstart.md

**Tests**: Included — Vitest is part of this feature's own plan (research.md Decision 2 lineage; this is the feature that actually introduces it, ahead of 001/002 in implementation order since 003 is foundational).

**Organization**: Tasks are grouped by user story (spec.md P1/P2/P3) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Path Conventions

Single project (Next.js App Router) — `src/`, `tests/` at repository root, per plan.md.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Add `@libsql/client` to `package.json` dependencies (`npm install @libsql/client`)
- [ ] T002 [P] Install and configure Vitest — `vitest.config.ts` + `"test": "vitest run"` script in `package.json` (first test runner in this project)
- [ ] T003 [P] Document `MOSAIQ_DB_URL`, `MOSAIQ_DB_AUTH_TOKEN`, `TOKEN_ENCRYPTION_KEY` in `.env.example` and the Configuration table in `README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Storage layer that MUST exist before any user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Create `src/lib/profile.ts` with a libSQL client connection helper (selects local file vs. Turso via `MOSAIQ_DB_URL`/`MOSAIQ_DB_AUTH_TOKEN`, per research.md Decision 1)
- [ ] T005 Add schema initialization to `src/lib/profile.ts`: `profiles` table, `creations` table, `idx_creations_profile_token` index (exact DDL in research.md Decision 4)
- [ ] T006 [P] Implement `encryptSecret`/`decryptSecret` helpers (AES-256-GCM via `TOKEN_ENCRYPTION_KEY`, Node's built-in `crypto`) in `src/lib/profile.ts` (research.md Decision 2)

**Checkpoint**: Storage layer ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Save credentials once, get a token (Priority: P1) 🎯 MVP

**Goal**: A caller can register a TMDB and/or ImageKit credential and receive a UUID token; read back credential *presence* (never raw values) via that token; remove a credential.

**Independent Test**: `POST /api/profile` with a `tmdbKey` → receive a token; `GET /api/profile?token=...` → `hasTmdbKey: true`, raw key absent from the response; `DELETE /api/profile` with `{token, service:"tmdb"}` → `hasTmdbKey: false` afterward. (quickstart.md Scenarios 1-3)

### Tests for User Story 1

- [ ] T007 [P] [US1] Unit test: `encryptSecret`/`decryptSecret` round-trip in `tests/lib/profile.test.ts`
- [ ] T008 [P] [US1] Unit test: `createOrUpdateProfile` — creates new profile when `token` omitted, upserts credentials when `token` provided, rejects unknown `token` in `tests/lib/profile.test.ts`
- [ ] T009 [P] [US1] Unit test: `getProfile` never returns raw/decrypted credential values, only `hasTmdbKey`/`hasImagekitKey` booleans, in `tests/lib/profile.test.ts`
- [ ] T010 [P] [US1] Route test: `POST /api/profile` (create, upsert, response never contains raw key) in `tests/api/profile.test.ts`
- [ ] T011 [P] [US1] Route test: `GET /api/profile?token=` (found and 404-unknown-token cases) in `tests/api/profile.test.ts`
- [ ] T012 [P] [US1] Route test: `DELETE /api/profile` (removes one credential, leaves the other untouched, 404 on unknown token) in `tests/api/profile.test.ts`

### Implementation for User Story 1

- [ ] T013 [US1] Implement `createOrUpdateProfile({ token?, tmdbKey?, imagekitKey? })` in `src/lib/profile.ts` (generates `crypto.randomUUID()` when `token` omitted; encrypts credentials via T006; depends on T004-T006)
- [ ] T014 [US1] Implement `getProfile(token)` returning `{ hasTmdbKey, hasImagekitKey, creations: [] }` (creations list wired up fully in US2; empty array here) in `src/lib/profile.ts`
- [ ] T015 [US1] Implement `deleteCredential(token, service)` in `src/lib/profile.ts`
- [ ] T016 [US1] Implement `GET`/`POST` handlers in `src/app/api/profile/route.ts` per contracts/profile-api.md
- [ ] T017 [US1] Implement `DELETE` handler in `src/app/api/profile/route.ts`
- [ ] T018 [US1] Add clear `404` responses for unknown token on all three handlers (FR-007)

**Checkpoint**: User Story 1 fully functional and independently testable (quickstart.md Scenarios 1-3)

---

## Phase 4: User Story 2 - Save and revisit Editor creations (Priority: P2)

**Goal**: A caller with a token can create, list, update in place, rename, and delete named mosaic/cover configurations ("creations").

**Independent Test**: `POST /api/profile/creations` with a token + config → get an `id`; `GET /api/profile?token=` lists it; `PUT .../creations/:id` updates it in place (same `id`, new `updatedAt`); `DELETE .../creations/:id` removes it. (quickstart.md Scenarios 4-6)

**Depends on**: User Story 1's `createOrUpdateProfile`/`getProfile` (a token must exist to attach creations to — per spec.md Assumptions, a token can be created with zero credentials purely to hold creations).

### Tests for User Story 2

- [ ] T019 [P] [US2] Unit tests: `createCreation`, `updateCreation`, `deleteCreation`, `listCreations`, `getCreation` in `tests/lib/profile.test.ts`
- [ ] T020 [P] [US2] Unit test: `updateCreation`/`deleteCreation` return the same not-found result for a wrong token as for a nonexistent `id` (FR-007 non-disclosure) in `tests/lib/profile.test.ts`
- [ ] T021 [P] [US2] Route tests: `POST /api/profile/creations`, `PUT /api/profile/creations/:id`, `DELETE /api/profile/creations/:id` in `tests/api/profile.test.ts`

### Implementation for User Story 2

- [ ] T022 [US2] Implement `createCreation(token, name, type, config)` in `src/lib/profile.ts` (rejects `config` containing `tmdb_key`/`imagekit_key`/`key`, per contracts/profile-api.md defense-in-depth note)
- [ ] T023 [US2] Implement `updateCreation(id, token, name?, config?)` in `src/lib/profile.ts` — validates `token` owns `id` before updating
- [ ] T024 [US2] Implement `deleteCreation(id, token)` in `src/lib/profile.ts`
- [ ] T025 [US2] Implement `listCreations(token)` and wire it into `getProfile` (completes T014's stub) in `src/lib/profile.ts`
- [ ] T026 [US2] Implement `POST /api/profile/creations/route.ts`
- [ ] T027 [US2] Implement `PUT`/`DELETE` in `src/app/api/profile/creations/[id]/route.ts`
- [ ] T028 [P] [US2] Editor UI: token entry field + profile panel showing credential presence and creations list in `src/app/page.tsx`
- [ ] T029 [P] [US2] Editor UI: "Save creation" action (name input, saves current mosaic/cover config) in `src/app/page.tsx`
- [ ] T030 [US2] Editor UI: load a creation into Editor state, rename, delete actions in `src/app/page.tsx` (depends on T028)
- [ ] T031 [US2] Editor UI: "Get shareable URL" action producing a `?token=&creation=` URL in `src/app/page.tsx`

**Checkpoint**: User Stories 1 and 2 both independently functional

---

## Phase 5: User Story 3 - Recall a profile with only the UUID (Priority: P3)

**Goal**: A user returning with only their UUID (any device/browser) recovers their full profile; losing the UUID is clearly communicated as unrecoverable.

**Independent Test**: Register a profile + creation via `curl` ("device A"), then load the same token in a fresh browser session ("device B") and confirm full state restores. (quickstart.md Scenario 7)

**Depends on**: User Stories 1 and 2 (this story is primarily a correctness guarantee over their combined behavior, per spec.md's "Why this priority" note — the only genuinely new work is UI messaging and an explicit cross-context test).

### Tests for User Story 3

- [ ] T032 [P] [US3] Integration test: full profile (credential presence + all creations) restores identically when `getProfile` is called with the same token from a separate test context, in `tests/api/profile.test.ts`

### Implementation for User Story 3

- [ ] T033 [US3] Editor UI: one-time, prominent warning shown at token creation — "save this token, it cannot be recovered" — in `src/app/page.tsx` (depends on T028)
- [ ] T034 [US3] Editor UI: distinct "enter an existing token" flow with a clear invalid-token error display in `src/app/page.tsx` (depends on T028)

**Checkpoint**: All three user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T035 [P] Add a "User Profiles" section to `README.md` explaining the token mechanism and its no-recovery tradeoff
- [ ] T036 [P] Unit test: deleting a `profiles` row cascades to delete its `creations` rows (schema-level `ON DELETE CASCADE` check) in `tests/lib/profile.test.ts`
- [ ] T037 Run all `quickstart.md` scenarios (1-7) manually against a local dev server as final validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational + User Story 1 (needs a token-issuing path to exist)
- **User Story 3 (Phase 5)**: Depends on Foundational + User Story 1 + User Story 2 (it's a correctness/UX layer over both)
- **Polish (Phase 6)**: Depends on all three user stories

### Parallel Opportunities

- T002, T003 (Setup) in parallel
- T006 (Foundational) in parallel with T004/T005 being sequential (T006 doesn't depend on schema)
- T007-T012 (US1 tests) in parallel with each other
- T019-T021 (US2 tests) in parallel with each other
- T028, T029 (US2 UI) in parallel; T030, T031 depend on T028
- T035, T036 (Polish) in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together:
Task: "Unit test encryptSecret/decryptSecret round-trip in tests/lib/profile.test.ts"
Task: "Unit test createOrUpdateProfile in tests/lib/profile.test.ts"
Task: "Unit test getProfile never returns raw values in tests/lib/profile.test.ts"
Task: "Route test POST /api/profile in tests/api/profile.test.ts"
Task: "Route test GET /api/profile?token= in tests/api/profile.test.ts"
Task: "Route test DELETE /api/profile in tests/api/profile.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: quickstart.md Scenarios 1-3 pass
5. This MVP alone unblocks [001-tmdb-byo-key](../001-tmdb-byo-key/spec.md) and [002-cdn-render-cache](../002-cdn-render-cache/spec.md), which only need `getProfile`/credential resolution — creations (US2) are not on their critical path.

### Incremental Delivery

1. Setup + Foundational → storage ready
2. User Story 1 → credential registration/resolution works → **001 and 002 can now begin their own implementation in parallel with US2/US3 here**
3. User Story 2 → saved creations work
4. User Story 3 → cross-device recall validated, UX messaging complete

---

## Notes

- [P] tasks = different files or independent functions, no ordering dependency
- Every `lib/profile.ts` function is additive across phases — no task rewrites another phase's code, only extends the same file
- Commit after each phase checkpoint
- This feature's MVP (US1) is the actual unblocking dependency for 001/002 — prioritize it first within this feature's own implementation
