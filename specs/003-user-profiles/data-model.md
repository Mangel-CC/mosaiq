# Data Model: User Credential & Creation Profiles (UUID Token)

## Profile

| Field | Type | Notes |
|---|---|---|
| `token` | `string` (UUID v4) | Primary key. Opaque, unguessable, the only way to reach this profile. |
| `tmdbKeyEncrypted` | `string \| null` | AES-256-GCM ciphertext (iv+authTag+ciphertext, base64), or absent if no TMDB credential saved. |
| `imagekitKeyEncrypted` | `string \| null` | Same encoding, for the ImageKit credential. |
| `createdAt` | `integer` (unix ms) | |
| `updatedAt` | `integer` (unix ms) | Bumped on any credential change. |

**Validation rules**:
- A profile may exist with both credential fields `null` (FR-009) — created purely to hold
  creations.
- `token` is never user-supplied at creation time (server-generated via
  `crypto.randomUUID()`); it IS user-supplied on every subsequent read/update/delete call,
  where it must match an existing row or the operation fails (FR-007).
- Raw credential values are write-only from the API's perspective — no read path ever
  returns `tmdbKeyEncrypted`/`imagekitKeyEncrypted` or their decrypted form (FR-003); reads
  only return booleans (`hasTmdbKey`, `hasImagekitKey`).

## Creation

| Field | Type | Notes |
|---|---|---|
| `id` | `string` (UUID v4) | Primary key. |
| `profileToken` | `string` | Foreign key → `Profile.token`. Cascade-deletes with the profile. |
| `name` | `string` | User-given label, editable (FR-005). |
| `type` | `"mosaic" \| "cover"` | Determines which render endpoint (`/api/render` vs `/api/cover`) a reference to this creation resolves against. |
| `config` | `object` (stored as JSON string) | The full render parameter set this creation represents, excluding any credential parameter — equivalent to today's query-string parameters for the matching endpoint. |
| `createdAt` | `integer` (unix ms) | |
| `updatedAt` | `integer` (unix ms) | Bumped on rename or config update; "update in place" (FR-005, spec Acceptance Scenario 3) means this row's `config`/`name` is overwritten, `id` is stable. |

**Validation rules**:
- `type` MUST match the endpoint a reference to this creation is used against (spec Edge
  Case: cover-type creation referenced from the mosaic endpoint → clear error, not a
  mismatched render).
- `config` MUST NOT contain `tmdb_key`, `imagekit_key`, or `key` (ACCESS_KEY) — those are
  resolved from the owning `Profile` (credentials) or the request itself (`ACCESS_KEY` is
  orthogonal, per Constitution Principle V), never stored per-creation.
- Deleting a `Creation` removes it from `listCreations` and makes any URL referencing its
  `id` fail per FR-007 — no soft-delete/tombstone required by this spec.

## Relationships

```
Profile (1) ──< (0..N) Creation
  token            profileToken (FK, ON DELETE CASCADE)
```

## Relationship to existing entities

- A `Creation`'s `config` is structurally the same data `coverConfigFromParams`/
  `configFromParams` (in `src/lib/cover.ts`/`src/lib/mosaic.ts`) already parse from a query
  string today — this feature adds a second way to arrive at that same config object (via
  stored JSON instead of URL parameters), not a new config shape.
