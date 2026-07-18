# Research: User Credential & Creation Profiles (UUID Token)

## Decision 1: Storage client

**Decision**: `@libsql/client` (official libSQL/Turso client). Same API works against a
local file (`file:./data/mosaiq.db`, for Docker self-hosting) or a remote Turso-hosted
libSQL database (`libsql://...` + auth token, for serverless deployments like Vercel that
lack persistent local disk) — selected purely by which connection URL is configured via
environment variables, with no code branching required.

**Rationale**: Directly satisfies the user-confirmed decision (2026-07-18) to use a
SQLite-compatible embedded store for self-hosted Docker and a network-backed equivalent
for Vercel, per Constitution Principle I's exception. `@libsql/client` is the natural
single dependency that covers both without maintaining two separate storage code paths.

**New environment variables**:
- `MOSAIQ_DB_URL` — e.g. `file:./data/mosaiq.db` (self-hosted default) or
  `libsql://<db>.turso.io` (Vercel/public instance).
- `MOSAIQ_DB_AUTH_TOKEN` — required only for a remote libSQL/Turso connection; absent for
  local file mode.
- `TOKEN_ENCRYPTION_KEY` — required whenever a credential is saved (see Decision 2);
  absence MUST cause credential-save requests to fail clearly, not silently store
  plaintext.

**Alternatives considered**: `better-sqlite3` (local-file-only, no serverless story —
would need a second, different client for Vercel, contradicting "one schema, two
backends"); a hosted Postgres/MySQL — rejected by the constitution amendment, which
explicitly restricts this exception to a SQLite-compatible/libSQL store.

## Decision 2: Credential encryption at rest

**Decision**: AES-256-GCM via Node's built-in `crypto` module. The server holds a single
symmetric key, `TOKEN_ENCRYPTION_KEY` (32-byte, base64-encoded, provided as an env var,
generated once by the operator — analogous in setup burden to `ACCESS_KEY`). Each stored
credential value is encrypted individually with a fresh random IV; the stored column value
encodes `iv || authTag || ciphertext` (e.g. base64).

**Rationale**: `crypto` is a Node built-in — zero new dependency for encryption itself.
AES-256-GCM is authenticated encryption (detects tampering, not just confidentiality),
appropriate for secrets that, if the database file leaked, must not be trivially
recoverable. A single server-held key (not per-user, not derived from the token itself) is
simplest and matches the constitution's explicit requirement ("a server-held secret, an
environment variable, never committed").

**Alternatives considered**: Deriving the encryption key from the token itself — rejected,
since the token is also the *lookup* key stored in the same database; an attacker with
read access to the DB file would have both the ciphertext and (trivially) the token in the
same row, defeating the purpose. A KMS/external secrets manager — rejected as
disproportionate infrastructure for a self-hosted, minimal-footprint project.

## Decision 3: Token format

**Decision**: `crypto.randomUUID()` (Node built-in, RFC 4122 v4 UUID) — no new dependency.
Used directly as the `profiles` table primary key and as the `token` query/body parameter
value throughout.

**Rationale**: Cryptographically random, standard, no library needed, matches the "UUID
token" language already used throughout the spec and prior discussion with the user.

## Decision 4: Schema

```sql
CREATE TABLE profiles (
  token TEXT PRIMARY KEY,
  tmdb_key_encrypted TEXT,
  imagekit_key_encrypted TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE creations (
  id TEXT PRIMARY KEY,
  profile_token TEXT NOT NULL REFERENCES profiles(token) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mosaic', 'cover')),
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_creations_profile_token ON creations(profile_token);
```

`config` stores the creation's full parameter set as a JSON string — the same shape of
data the Editor already builds into a query string today (per `buildApiUrl` in
`src/app/page.tsx`), just serialized as JSON instead of URL-encoded, and with credential
parameters (`tmdb_key`, `imagekit_key`) always excluded (those live in `profiles`, not
per-creation).

**Rationale**: Two tables, one relationship (`creations.profile_token → profiles.token`,
cascade delete so removing a profile cleans up its creations), matches the Key Entities in
`spec.md` exactly. Storing `config` as an opaque JSON blob (rather than a fully normalized
column-per-parameter schema) avoids a migration every time the Editor gains a new render
parameter — consistent with this being explicitly *not* meant to become a general-purpose
data layer (Constitution Principle I exception's bounded scope).

## Decision 5: Profile-management endpoint shape

**Decision**: New routes under `src/app/api/profile/`:
- `POST /api/profile` — body `{ token?: string, tmdbKey?: string, imagekitKey?: string }`.
  If `token` omitted, creates a new profile; if provided, updates the existing one
  (upsert). Returns `{ token, hasTmdbKey: boolean, hasImagekitKey: boolean }` — never the
  raw values back (FR-003).
- `DELETE /api/profile` — body `{ token, service: "tmdb" | "imagekit" }` — removes one
  stored credential without deleting the whole profile.
- `POST /api/profile/creations` — body `{ token, name, type, config }` — creates a new
  creation, returns its `id`.
- `PUT /api/profile/creations/:id` — body `{ token, name?, config? }` — updates an existing
  creation in place (FR-005, Acceptance Scenario 3); `token` must match the creation's
  owning profile.
- `DELETE /api/profile/creations/:id` — body `{ token }`.
- `GET /api/profile?token=...` — the one **read** operation, deliberately kept `GET` (no
  secret in the request, only a token being looked up) — returns
  `{ hasTmdbKey, hasImagekitKey, creations: [{ id, name, type, updatedAt }] }`.

**Rationale**: Matches the Principle III exception (Decision from constitution amendment)
precisely: mutations that touch or receive a secret use a body-carrying method; the
"do I have a profile, what's in it" read (which carries no secret in the request itself)
stays `GET`, consistent with the spirit of the rest of the API even where it deviates
from the letter (this specific `GET` still doesn't accept or return a raw secret).

## Decision 6: Where new logic lives (Principle IV compliance)

**Decision**: A new framework-free module, `src/lib/profile.ts`, holding:
- The libSQL client singleton/connection helper.
- `encryptSecret`/`decryptSecret` helpers (Decision 2).
- `createOrUpdateProfile`, `getProfile`, `deleteCredential`,
  `createCreation`/`updateCreation`/`deleteCreation`/`listCreations`/`getCreation`.

Route handlers under `src/app/api/profile/` (and later, `render`/`cover` per features 001/
002) only parse the request and call into `lib/profile.ts` — no SQL or encryption logic
in route files themselves.

**Rationale**: Directly mirrors the existing `lib/tmdb.ts`/`lib/catalog.ts` pattern and
satisfies Constitution Principle IV (framework-free `lib/`, one-directional `app → lib`).
