// Unit tests for src/lib/catalog.ts's cache-bypass logic: a request that
// resolves its TMDB credential from anywhere other than the shared server
// key (i.e. source "direct" or "token") must not read or write
// resolveCatalog's shared in-memory cache — otherwise a caller with their
// own credential could receive a result actually resolved with someone
// else's credential. See specs/001-tmdb-byo-key/research.md Decision 4 and
// tasks.md T009.
//
// Isolation: own MOSAIQ_DB_URL/TOKEN_ENCRYPTION_KEY (only needed for the
// token-based bypass case), unique to this file, like tests/lib/tmdb.test.ts.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { createOrUpdateProfile } from "@/lib/profile";
import { resolveCatalog } from "@/lib/catalog";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILENAME = `test-catalog-${randomBytes(6).toString("hex")}.db`;
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
const DB_URL = `file:./data/${DB_FILENAME}`;

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.MOSAIQ_DB_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
  await createOrUpdateProfile({});
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const p = DB_PATH + suffix;
    if (existsSync(p)) rmSync(p);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Metas with neither a TMDB/imdb id nor a `name` never trigger a TMDB call
// from resolveMeta (see src/lib/catalog.ts): only the catalog URL itself is
// fetched, which keeps these tests focused purely on cache-hit/bypass
// behavior around that one fetch, without needing to also stub TMDB
// responses.
function catalogResponse(metas: unknown[]) {
  return new Response(JSON.stringify({ metas }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("resolveCatalog cache bypass (source !== server)", () => {
  it("serves a second identical server-key request from cache (single fetch)", async () => {
    const metas = [{ id: "m1", poster: "/p1.jpg", background: "/b1.jpg" }];
    // mockImplementation (not mockResolvedValue) so each call gets a fresh
    // Response — a Response body can only be read (.json()) once, and a real
    // (non-cached) bypass call reads it more than once across this file's
    // tests.
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async () => catalogResponse(metas));

    const url = "https://fake.catalog.test/server-cache-hit";
    const first = await resolveCatalog(url, 10, []);
    const second = await resolveCatalog(url, 10, []);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("bypasses the cache when resolved via a direct key", async () => {
    const metas = [{ id: "m2", poster: "/p2.jpg", background: "/b2.jpg" }];
    // mockImplementation (not mockResolvedValue) so each call gets a fresh
    // Response — a Response body can only be read (.json()) once, and a real
    // (non-cached) bypass call reads it more than once across this file's
    // tests.
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async () => catalogResponse(metas));

    const url = "https://fake.catalog.test/direct-cache-bypass";
    await resolveCatalog(url, 10, [], { directKey: "my-own-key" });
    await resolveCatalog(url, 10, [], { directKey: "my-own-key" });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("bypasses the cache when resolved via a registered token", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "catalog-token-key" });
    const metas = [{ id: "m3", poster: "/p3.jpg", background: "/b3.jpg" }];
    // mockImplementation (not mockResolvedValue) so each call gets a fresh
    // Response — a Response body can only be read (.json()) once, and a real
    // (non-cached) bypass call reads it more than once across this file's
    // tests.
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async () => catalogResponse(metas));

    const url = "https://fake.catalog.test/token-cache-bypass";
    await resolveCatalog(url, 10, [], { token: created!.token });
    await resolveCatalog(url, 10, [], { token: created!.token });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT bypass the cache for an unresolvable token (falls open to source: server)", async () => {
    const metas = [{ id: "m4", poster: "/p4.jpg", background: "/b4.jpg" }];
    // mockImplementation (not mockResolvedValue) so each call gets a fresh
    // Response — a Response body can only be read (.json()) once, and a real
    // (non-cached) bypass call reads it more than once across this file's
    // tests.
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async () => catalogResponse(metas));

    const url = "https://fake.catalog.test/unresolvable-token-still-cached";
    await resolveCatalog(url, 10, [], {
      token: "00000000-0000-0000-0000-000000000000",
    });
    await resolveCatalog(url, 10, [], {
      token: "00000000-0000-0000-0000-000000000000",
    });

    // An unresolvable token resolves to source "server" (data-model.md), so
    // it participates in the shared cache like any other server-key request.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("resolveCatalog surfaces a rejected resolved credential (contracts/tmdb-key-param.md)", () => {
  it("throws instead of silently falling back to the catalog's own images", async () => {
    // A meta with a moviedb_id triggers a per-item TMDB call from
    // resolveMeta — that's the call that must see (and propagate) the 401.
    const metas = [{ id: "m5", moviedb_id: 603, poster: "/p5.jpg" }];
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url;
      if (url.includes("fake.catalog.test")) {
        return new Response(JSON.stringify({ metas }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // Any TMDB Base call: reject the credential.
      return new Response("nope", { status: 401 });
    });

    await expect(
      resolveCatalog(
        "https://fake.catalog.test/credential-rejected",
        10,
        [],
        { directKey: "bad-key" }
      )
    ).rejects.toThrow(/credencial/i);
  });
});
