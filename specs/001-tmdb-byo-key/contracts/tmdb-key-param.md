# API Contract: TMDB Credential Resolution

Applies to every endpoint that performs TMDB lookups: `GET /api/search`, `GET /api/render`,
`GET /api/cover`, `GET /api/art`, `GET /api/providers`.

## Request

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `token` | string | No | A UUID token from [003-user-profiles](../../003-user-profiles/contracts/profile-api.md). If it resolves to a profile with a registered TMDB credential, that credential is used. **Recommended** for anything a caller will store persistently (e.g. a Nuvio collection URL). |
| `tmdb_key` | string | No | A raw TMDB credential, used directly. Recommended only for one-off/direct API use (e.g. `curl` testing) — not for anything stored persistently outside mosaiq. |

If both are present, `tmdb_key` takes precedence (Edge Cases, spec.md). If neither is
present, or neither resolves to a usable credential, the server's `TMDB_API_KEY` is used
(unchanged from pre-feature behavior). Existing parameters (documented in `README.md`'s URL
Structure section) are unaffected; neither `token` nor `tmdb_key` ever collides with `key`
(`ACCESS_KEY`, per Constitution Principle V).

## Response

No response shape changes from either parameter's presence — only which TMDB credential
was used internally changes.

### Error behavior

| Condition | Behavior |
|---|---|
| No `token`, no `tmdb_key`, server has `TMDB_API_KEY` | Unchanged from today |
| No `token`, no `tmdb_key`, server has no `TMDB_API_KEY` | Unchanged "not configured" behavior |
| `token` resolves to a profile with a TMDB credential | Used; normal response |
| `token` resolves to a profile with **no** TMDB credential registered | Not an error — falls back to server key |
| `token` doesn't resolve to any profile | Not an error for *this* feature's purposes — falls back to server key (contrast with feature 003's own `GET /api/profile`, where an unknown token IS an error) |
| `tmdb_key` present, valid | Used; normal response |
| `tmdb_key` present, empty/blank | Treated as absent |
| Resolved credential (via either mechanism) rejected by TMDB | TMDB's error surfaced to the caller; no fallback attempted |

## Interaction with 003's `POST /api/profile`

This contract only covers *reading*/resolving a credential during a render/lookup request.
*Registering* a TMDB credential (obtaining or updating a token) is
[003-user-profiles](../../003-user-profiles/contracts/profile-api.md)'s
`POST /api/profile` — not duplicated here.
