# Quickstart: Validating Per-User TMDB API Key (BYO Key)

*Assumes [003-user-profiles](../003-user-profiles/quickstart.md) is implemented and its
prerequisites (`MOSAIQ_DB_URL`, `TOKEN_ENCRYPTION_KEY`) are set.*

## Prerequisites

- Local mosaiq dev server running (`npm run dev`).
- A server-side `TMDB_API_KEY` configured in `.env.local`.
- A second, valid TMDB API key belonging to a different account, to register as a
  "personal" key.

## Scenario 1 — Backward compatibility (User Story 3)

```bash
curl -s "http://localhost:3000/api/search?q=matrix" | jq .
```

**Expected**: Unchanged — server's `TMDB_API_KEY` used, no `token`/`tmdb_key` supplied.

## Scenario 2 — Register a key, get a token, use it (User Story 1)

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/profile \
  -H "Content-Type: application/json" \
  -d '{"tmdbKey":"<your-personal-tmdb-key>"}' | jq -r .token)

curl -s "http://localhost:3000/api/search?q=matrix&token=$TOKEN" | jq .
```

**Expected**: Results returned using the personal key resolved via the token. Verify by
temporarily setting `TMDB_API_KEY` to an invalid value and restarting — this request
should still succeed (token-resolved key in effect) while Scenario 1's request now fails.

## Scenario 3 — Direct key still works as a secondary path

```bash
curl -s "http://localhost:3000/api/search?q=matrix&tmdb_key=<your-personal-tmdb-key>" | jq .
```

**Expected**: Same successful result as Scenario 2, via the direct-parameter path instead
of a token.

## Scenario 4 — Unresolvable token fails open, not closed (data-model.md validation rule)

```bash
curl -s "http://localhost:3000/api/search?q=matrix&token=00000000-0000-0000-0000-000000000000" | jq .
```

**Expected**: Normal results using the *server's* key — an unresolvable token is not an
error for this feature (contrast with feature 003's own profile-read endpoint, where it is).

## Scenario 5 — Invalid registered credential fails clearly

1. Register a deliberately invalid key: `curl -s -X POST .../api/profile -d '{"tmdbKey":"not-a-real-key"}' ...`
2. Request with that token: `curl -s -w "\nHTTP %{http_code}\n" ".../api/search?q=matrix&token=$TOKEN"`

**Expected**: Non-2xx response surfacing TMDB's rejection — not a silent fallback to the
server key.

## Scenario 6 — Render/cover endpoints honor token resolution too

```bash
curl -s -o /tmp/mosaic.png -w "%{http_code}\n" \
  "http://localhost:3000/api/render?preset=netflix&w=1280&h=720&catalog=https://v3-cinemeta.strem.io/catalog/movie/top.json&limit=6&token=$TOKEN"
```

**Expected**: `200`, valid PNG, resolved using the registered credential.

## Scenario 7 — Editor registers and stores only a token (User Story 2)

1. Open the Editor, enter a personal TMDB key in settings.
2. Inspect `localStorage` — confirm `tmdbToken` is present and holds a UUID, and that the
   raw key string is **not** present anywhere in `localStorage`.
3. Reload the page, perform a search — confirm it still uses the registered key (via the
   stored token) without re-entry.

## Scenario 8 — Cache bypass still applies for token-resolved requests (research.md Decision 4)

1. Request the same `catalog=...` mosaic twice using the server key (no token/direct key)
   — second request served from cache (fast).
2. Request the same mosaic using `&token=$TOKEN` — should perform fresh resolution, not
   reuse the server-key-populated cache entry.

## Automated tests

```bash
npx vitest run tests/lib/tmdb.test.ts tests/lib/catalog.test.ts tests/api/
```

**Expected**: All pass, covering direct/token/server precedence and the scenarios above.
