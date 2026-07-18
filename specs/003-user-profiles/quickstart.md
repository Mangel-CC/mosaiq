# Quickstart: Validating User Credential & Creation Profiles

## Prerequisites

- Local mosaiq dev server running (`npm run dev`).
- `MOSAIQ_DB_URL=file:./data/mosaiq.db` in `.env.local` (self-hosted/local default).
- `TOKEN_ENCRYPTION_KEY` set in `.env.local` (a 32-byte base64 value — generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).

## Scenario 1 — Create a profile with a credential (User Story 1)

```bash
curl -s -X POST http://localhost:3000/api/profile \
  -H "Content-Type: application/json" \
  -d '{"tmdbKey":"my-personal-tmdb-key"}' | jq .
```

**Expected**: `{ "token": "<uuid>", "hasTmdbKey": true, "hasImagekitKey": false }`. Save the
returned token for the next scenarios.

## Scenario 2 — Read profile state without exposing the raw key (FR-003)

```bash
curl -s "http://localhost:3000/api/profile?token=<uuid-from-scenario-1>" | jq .
```

**Expected**: `hasTmdbKey: true`, `creations: []`. No field anywhere contains the raw key
string entered in Scenario 1 — confirm by grepping the response for that literal string
and finding no match.

## Scenario 3 — Unknown token fails clearly (FR-007)

```bash
curl -s -w "\nHTTP %{http_code}\n" "http://localhost:3000/api/profile?token=00000000-0000-0000-0000-000000000000"
```

**Expected**: `404` with a clear error body, not an empty/default profile.

## Scenario 4 — Save a creation (User Story 2)

```bash
curl -s -X POST http://localhost:3000/api/profile/creations \
  -H "Content-Type: application/json" \
  -d '{"token":"<uuid>","name":"Top Netflix","type":"mosaic","config":{"preset":"netflix","cols":8}}' | jq .
```

**Expected**: `{ "id": "<creation-uuid>" }`. Then re-run Scenario 2's `GET` and confirm the
new creation appears in the `creations` list.

## Scenario 5 — Update a creation in place (Acceptance Scenario 3)

```bash
curl -s -X PUT http://localhost:3000/api/profile/creations/<creation-uuid> \
  -H "Content-Type: application/json" \
  -d '{"token":"<uuid>","name":"Top Netflix (updated)"}' | jq .
```

**Expected**: `200`, and the creation's `id` is unchanged (re-check via Scenario 2 — one
entry, not two).

## Scenario 6 — Delete a creation (Acceptance Scenario 4)

```bash
curl -s -X DELETE http://localhost:3000/api/profile/creations/<creation-uuid> \
  -H "Content-Type: application/json" \
  -d '{"token":"<uuid>"}' | jq .
```

**Expected**: `{ "deleted": true }`; re-check Scenario 2's list no longer contains it.

## Scenario 7 — Cross-device recall (User Story 3)

1. Complete Scenarios 1 and 4 (profile + one creation) using `curl` (simulating "device A").
2. Open the Editor in a browser with no prior `localStorage` state for this app (private/
   incognito window simulates "device B").
3. Enter the same UUID token into the Editor's profile UI.

**Expected**: The Editor shows the credential as present (not its value) and lists "Top
Netflix" as a saved creation, loadable into the Editor.

## Automated tests

```bash
npx vitest run tests/lib/profile.test.ts tests/api/profile.test.ts
```

**Expected**: All pass, covering encryption round-trip, CRUD, cascade delete on profile
removal, and the not-found behaviors above.
