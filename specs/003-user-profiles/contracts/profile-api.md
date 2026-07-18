# API Contract: Profile Management (`/api/profile*`)

All endpoints in this group are new. Per Constitution Principle III's Profile Management
exception, mutation endpoints use a request body (`POST`/`PUT`/`DELETE`), never a query
string, because they carry secrets. The one read endpoint stays `GET` since its request
carries no secret.

## `GET /api/profile?token=<uuid>`

Read-only; the token itself is not a secret in the sense credentials are (it's an opaque
lookup key, not a third-party API key), so this stays a plain `GET`.

**Response `200`**:
```json
{
  "hasTmdbKey": true,
  "hasImagekitKey": false,
  "creations": [
    { "id": "...", "name": "Top Netflix", "type": "mosaic", "updatedAt": 1752863000000 }
  ]
}
```

**Response `404`**: `{ "error": "Token not found" }` — unknown/invalid token (FR-007).

## `POST /api/profile`

Create a new profile, or update credentials on an existing one (upsert).

**Request body**:
```json
{ "token": "optional-existing-uuid", "tmdbKey": "optional", "imagekitKey": "optional" }
```
Omitting `token` creates a new profile. At least one of `tmdbKey`/`imagekitKey` is
recommended but not required (a token may be created with neither, per FR-009, purely to
hold creations later).

**Response `200`/`201`**:
```json
{ "token": "the-uuid", "hasTmdbKey": true, "hasImagekitKey": false }
```
Never echoes the raw key back (FR-003).

**Response `404`**: if `token` was supplied but doesn't match an existing profile.

## `DELETE /api/profile`

Remove one stored credential (not the whole profile).

**Request body**: `{ "token": "...", "service": "tmdb" | "imagekit" }`

**Response `200`**: `{ "hasTmdbKey": false, "hasImagekitKey": false }` (updated state).

**Response `404`**: unknown token.

## `POST /api/profile/creations`

Save a new creation under a profile.

**Request body**:
```json
{
  "token": "...",
  "name": "Top Netflix",
  "type": "mosaic",
  "config": { "preset": "netflix", "cols": 8, "catalog": "https://..." }
}
```
`config` MUST NOT include `tmdb_key`, `imagekit_key`, or `key` — the route strips/rejects
any present (defense in depth; the Editor UI should never send them here in the first
place).

**Response `201`**: `{ "id": "new-creation-uuid" }`

**Response `404`**: unknown token.

## `GET /api/profile/creations/:id?token=<uuid>`

*(Added during implementation — the original contract omitted a way to read a single
creation's full config back, which the Editor's "load a saved creation" flow needs.)*

**Response `200`**: `{ "id": "...", "name": "...", "type": "mosaic", "config": {...}, "updatedAt": 1752863000000 }`

**Response `404`**: unknown token, or `id` doesn't exist / doesn't belong to that token
(same non-disclosure rule as `PUT`/`DELETE` below).

## `PUT /api/profile/creations/:id`

Update an existing creation in place (FR-005, spec Acceptance Scenario 3).

**Request body**: `{ "token": "...", "name": "optional new name", "config": "optional new config" }`

**Response `200`**: `{ "id": "...", "updatedAt": 1752863100000 }`

**Response `404`**: unknown token, or `id` doesn't exist / doesn't belong to that token
(FR-007 — deliberately the same error either way, to avoid leaking whether an `id` exists
under a *different* token).

## `DELETE /api/profile/creations/:id`

**Request body**: `{ "token": "..." }`

**Response `200`**: `{ "deleted": true }`

**Response `404`**: same non-disclosure behavior as `PUT` above.

## Interaction with render endpoints (features 001/002, for reference only)

Not part of this feature's own contract, but the reason it exists: `GET /api/render` and
`GET /api/cover` gain the ability to accept `?token=...&creation=<id>` as an alternative to
a full parameter list — resolved via `getCreation(token, id)` from this feature's storage,
then merged with the credential resolution this same token provides. That resolution logic
is specified in features 001 and 002's own contracts, not duplicated here.
