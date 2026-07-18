# Quickstart: Validating CDN Render Caching

*Assumes [003-user-profiles](../003-user-profiles/quickstart.md) is implemented. Requires
a real ImageKit account (free tier is sufficient) and its private API key.*

## Prerequisites

- Local mosaiq dev server running.
- `MOSAIQ_DB_URL` / `TOKEN_ENCRYPTION_KEY` set (per feature 003).
- An ImageKit account's private API key.

## Scenario 1 — No credential, unchanged behavior (User Story 3)

```bash
curl -s -o /tmp/a.png -w "%{http_code}\n" \
  "http://localhost:3000/api/render?preset=netflix&w=800&h=450&imgs=/abc.jpg,/def.jpg"
```

**Expected**: `200`, PNG body — identical to pre-feature behavior.

## Scenario 2 — Register ImageKit credential, first request caches (User Story 1)

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/profile \
  -H "Content-Type: application/json" \
  -d '{"imagekitKey":"<your-imagekit-private-key>"}' | jq -r .token)

curl -s -o /tmp/b.png -w "%{http_code}\n" \
  "http://localhost:3000/api/render?preset=netflix&w=800&h=450&imgs=/abc.jpg,/def.jpg&token=$TOKEN"
```

**Expected**: `200`, PNG body (cache miss — rendered fresh). Check your ImageKit media
library dashboard — a new file under `mosaiq-cache/` should appear.

## Scenario 3 — Repeat request is a cache hit (redirect)

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  "http://localhost:3000/api/render?preset=netflix&w=800&h=450&imgs=/abc.jpg,/def.jpg&token=$TOKEN"
```

**Expected**: `302`, with `redirect_url` pointing at an `imagekit.io` URL. Use `-L` to
follow it and confirm it's the same image as Scenario 2.

## Scenario 4 — Changed params produce a distinct cache entry

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/render?preset=netflix&w=1280&h=720&imgs=/abc.jpg,/def.jpg&token=$TOKEN"
```

**Expected**: `200` (cache miss — different `w`/`h` means a different `configHash`), and a
second distinct file appears under `mosaiq-cache/` in ImageKit.

## Scenario 5 — Dynamic catalog: fresh vs. stale (User Story 2)

```bash
CATALOG="https://v3-cinemeta.strem.io/catalog/movie/top.json"

curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/render?preset=netflix&w=800&h=450&catalog=$CATALOG&limit=6&token=$TOKEN"
# repeat immediately — should be a 302 (fresh)
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/render?preset=netflix&w=800&h=450&catalog=$CATALOG&limit=6&token=$TOKEN"
```

**Expected**: First request `200` (miss), second request `302` (hit — catalog content
unchanged between the two calls). Confirm only one `mosaiq-cache/` file exists for this
configuration in ImageKit (check the dashboard, or wait for the catalog's real content to
change and re-request — should then see `200` again and the old file replaced, not
duplicated).

## Scenario 6 — Invalid/CDN-unreachable credential never breaks the render (User Story 3)

```bash
curl -s -o /tmp/c.png -w "%{http_code}\n" \
  "http://localhost:3000/api/render?preset=netflix&w=800&h=450&imgs=/abc.jpg,/def.jpg&imagekit_key=not-a-real-key"
```

**Expected**: `200`, a valid PNG — caching silently fails, the render still succeeds
(FR-011).

## Scenario 7 — Direct key still works as a secondary path

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/render?preset=netflix&w=800&h=450&imgs=/abc.jpg,/def.jpg&imagekit_key=<your-imagekit-private-key>"
```

**Expected**: Same caching behavior as the token-based scenarios above.

## Automated tests

```bash
npx vitest run tests/lib/cdnCache.test.ts tests/api/render.test.ts tests/api/cover.test.ts
```

**Expected**: All pass, covering cache-key derivation, hit/miss/stale transitions, and
CDN-failure fallback, using mocked ImageKit HTTP calls (no real ImageKit account needed for
the automated suite — Scenarios 1-7 above are for manual/integration validation against a
real account).
