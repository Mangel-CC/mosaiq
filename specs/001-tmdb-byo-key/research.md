# Research: Per-User TMDB API Key (BYO Key)

*Revised 2026-07-18 to resolve credentials via the [003-user-profiles](../003-user-profiles/research.md) token mechanism as primary, direct parameter as secondary. Decisions 2-5 below are largely unchanged from the original research; Decision 1 and 3 are reworked; a new Decision 6 covers token resolution specifically.*

## Decision 1: Credential transport — token primary, direct key secondary

**Decision**: `?token=<uuid>` (resolved via [003-user-profiles](../003-user-profiles/research.md)) is the primary, recommended mechanism. A direct `?tmdb_key=<raw-key>` query parameter remains supported as a secondary mechanism for one-off direct API use.

**Rationale**: The original reasoning for a query parameter (not a header) still holds and now applies to the token: Nuvio/Stremio addons/AIOMetadata only template URLs, no custom headers. The difference from the original design is *what* travels in that parameter — a caller who wants something safe to paste into a persistent external configuration uses `?token=`, never their raw key. `?tmdb_key=` is kept only because it's still occasionally useful (quick `curl` testing without registering a profile first) and removing it entirely would be a regression for that narrow case with no safety upside (a one-off `curl` command isn't "stored" anywhere the way a Nuvio collection is).

**Alternatives considered**: Removing the direct-key parameter entirely, forcing token registration for any BYO-key use — rejected as unnecessary friction for the direct-API-testing case; the actual risk (a raw key sitting in a *persistently stored* URL) doesn't apply there.

**User confirmation**: Original key-transport decision confirmed 2026-07-18; revision to token-primary confirmed 2026-07-18 in the same session, prompted directly by the user identifying the Nuvio-collection exposure risk.

## Decision 2: Testing approach

**Decision**: Vitest (established by this feature originally, now shared with 003).

Unchanged from the original research — see [003-user-profiles/research.md](../003-user-profiles/research.md) Decision-adjacent context; no new decision needed here.

## Decision 3: Where TMDB-key resolution logic lives (revised)

**Decision**: `src/lib/tmdb.ts` gains a `resolveTmdbKey(params: { directKey?: string; token?: string }): Promise<{ key: string; source: "direct" | "token" | "server" }>` that:
1. If `directKey` is present and non-blank, use it (`source: "direct"`).
2. Else if `token` is present, call `getProfile(token)` (from `src/lib/profile.ts`, feature 003) and, if it has a TMDB credential, decrypt and use it (`source: "token"`).
3. Else fall back to `process.env.TMDB_API_KEY` (`source: "server"`).

This is threaded through `tmdbFetch`, `fetchTextlessArt`, `resolveTmdbRef` (all in `lib/tmdb.ts`) and `resolveMeta`/`resolveCatalog`/`resolveCatalogs` (in `lib/catalog.ts`), exactly as originally researched — only the *source* of the override changed shape (from "just a direct key" to "direct key or token-resolved key"). `search/route.ts`'s duplicate `tmdbAuth` is still removed in favor of the shared helper, unchanged from the original finding.

**Rationale**: Keeps all the original call-graph research valid (see codebase findings below, unchanged) while cleanly layering token resolution on top. `lib/tmdb.ts` importing from `lib/profile.ts` is `lib → lib`, not `app → lib` — still fully compliant with Constitution Principle IV (only `app/` importing `lib/` framework-coupled code would be a violation; two framework-free `lib/` modules importing each other is normal).

**Codebase findings (unchanged from original research)**: Traced `tmdbFetch`'s call graph via the project's code index. TMDB is touched in five places: `lib/tmdb.ts` (`tmdbFetch`, `hasTmdbKey`, used by `fetchTextlessArt`/`resolveTmdbRef`), `search/route.ts` (duplicate inline `tmdbAuth` — to be removed in favor of the shared resolver), `providers/route.ts`, `art/route.ts`, `cover/route.ts` (only for `?notext=1` and `?catalog=`), and `render/route.ts` (indirectly, via `resolveCatalogs` → `catalog.ts`'s `resolveMeta`).

## Decision 4: In-memory cache scoping (unchanged)

**Decision**: When a request resolves its TMDB credential from anywhere other than the server key (`source: "direct"` or `source: "token"`), the request MUST bypass the existing in-memory caches in `src/lib/catalog.ts` (`resolveCatalog`'s cache) and `src/app/api/providers/route.ts` (its own cache). Only `source: "server"` requests participate in these caches, exactly as today.

**Rationale**: Unchanged from original research — both caches are keyed by request content, not by which credential resolved them; without this rule a caller with their own credential (token or direct) could receive a result actually resolved using someone else's credential, defeating the purpose.

**User confirmation**: Decided directly with user during planning (2026-07-18), reaffirmed unchanged by the token-mechanism revision (the bypass rule now keys off `source !== "server"` rather than "a direct key is present," but the rule itself is identical).

## Decision 5: Editor UI persistence pattern (revised)

**Decision**: The Editor's TMDB-key input, when filled in, calls `POST /api/profile` (feature 003) with `{ token: <existing token, if any>, tmdbKey: <entered value> }`, receives back a token, and stores **only that token** in `localStorage` (key: `tmdbToken`, distinct from the existing `accessKey` entry) — never the raw key. Outgoing API calls append `&token=` using that stored value, via a helper analogous to the existing `withKey` (which appends `&key=` for `ACCESS_KEY`).

If the user instead already has a token (e.g. from a previous session or a different device), the Editor also accepts pasting an existing token directly, storing it the same way without a registration call.

**Rationale**: Preserves the original finding (the codebase already has a working `accessKey`/`localStorage` pattern to mirror) while closing the gap the original design had: previously the *raw key* would have lived in `localStorage`, which — while not sent to Nuvio — was still more exposure than necessary. Storing only the token in `localStorage` means a browser-side leak (e.g. an XSS in some unrelated script, a shared/public computer) exposes a revocable opaque token, not the raw third-party credential itself.

**Alternatives considered**: Keeping the raw key in `localStorage` and only using the token for URLs handed to Nuvio — rejected, inconsistent and strictly worse than storing the token everywhere once a registration flow exists at all.
