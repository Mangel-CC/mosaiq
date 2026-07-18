# Data Model: Per-User TMDB API Key (BYO Key)

This feature introduces no persisted entities of its own. The credential store (`Profile`,
holding an encrypted TMDB credential) belongs entirely to
[003-user-profiles](../003-user-profiles/data-model.md) — this feature only *reads* it,
transiently, per request.

## Resolved TMDB Key (transient, in-memory only)

The return shape of the new `resolveTmdbKey` helper (`src/lib/tmdb.ts`) — not a stored
entity, just the value threaded through a single request's call chain.

| Field | Type | Notes |
|---|---|---|
| `key` | `string` | The credential actually used for this request's TMDB calls |
| `source` | `"direct" \| "token" \| "server"` | Which mechanism resolved it. Used to decide whether to bypass the shared in-memory caches (research.md Decision 4) — never exposed in any API response. |

**Resolution order** (FR-002/FR-003/FR-004, Edge Cases):
1. A direct request parameter (e.g. `tmdb_key`), if present and non-blank → `source: "direct"`.
2. Else, if a `token` parameter is present and resolves (via
   [003-user-profiles](../003-user-profiles/data-model.md)'s `Profile.tmdbKeyEncrypted`,
   decrypted) → `source: "token"`.
3. Else, `process.env.TMDB_API_KEY` → `source: "server"`.

## Validation rules

- Empty/blank direct key → treated as absent, proceed to step 2 (not an error).
- Unknown/nonexistent token → per feature 003, this specific outcome is only an error on
  feature 003's own `GET /api/profile` endpoint; for *this* feature's purposes (a token
  used as a credential-resolution input, not a direct profile lookup), an unresolvable
  token simply yields no override at step 2 and proceeds to step 3 (fails open to the
  server key, not a hard error — an unrelated, unresolvable token shouldn't block a render).
- A resolved credential (step 1 or 2) that TMDB itself rejects → surfaced as an error per
  FR-005; never silently falls through to step 3.

## Relationship to feature 003's entities

- Reads `Profile.tmdbKeyEncrypted` (via `getProfile(token)` from `src/lib/profile.ts`) and
  decrypts it using feature 003's `decryptSecret` helper. No new field, table, or write
  path is introduced on the `Profile` entity by this feature.
