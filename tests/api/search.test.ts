// Route tests for GET /api/search — TMDB credential resolution
// (specs/001-tmdb-byo-key). Exercises the exact contract in
// specs/001-tmdb-byo-key/contracts/tmdb-key-param.md: direct tmdb_key >
// token > server key, no silent fallback on a rejected credential, and an
// unresolvable token failing open to the server key. See tasks.md T010
// (and T025 for the no-param regression case, included below).
//
// Isolation: own MOSAIQ_DB_URL/TOKEN_ENCRYPTION_KEY, like
// tests/api/profile.test.ts, so registering a token here never collides
// with other test files running concurrently. TMDB itself is never hit for
// real — global fetch is mocked per test.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

import { GET as searchRoute } from "@/app/api/search/route";
import { createOrUpdateProfile } from "@/lib/profile";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILENAME = `test-api-search-${randomBytes(6).toString("hex")}.db`;
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
const DB_URL = `file:./data/${DB_FILENAME}`;

const ORIGINAL_SERVER_KEY = process.env.TMDB_API_KEY;

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.MOSAIQ_DB_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 21).toString("base64");
  process.env.TMDB_API_KEY = "server-key";
  await createOrUpdateProfile({});
});

afterAll(() => {
  if (ORIGINAL_SERVER_KEY === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = ORIGINAL_SERVER_KEY;
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const p = DB_PATH + suffix;
    if (existsSync(p)) rmSync(p);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

function searchOk() {
  return new Response(JSON.stringify({ results: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockTmdb(handler: (apiKey: string | null, url: URL) => Response) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = new URL(typeof input === "string" ? input : (input as URL).toString());
    return handler(url.searchParams.get("api_key"), url);
  });
}

describe("GET /api/search — TMDB credential resolution", () => {
  it("uses the server key when neither token nor tmdb_key is supplied (US3 regression, T025)", async () => {
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("server-key");
      return searchOk();
    });
    const res = await searchRoute(req("/api/search?q=matrix"));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("uses a directly-supplied tmdb_key over the server key", async () => {
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("my-direct-key");
      return searchOk();
    });
    const res = await searchRoute(req("/api/search?q=matrix&tmdb_key=my-direct-key"));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("treats an empty tmdb_key as absent, falling back to the server key", async () => {
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("server-key");
      return searchOk();
    });
    const res = await searchRoute(req("/api/search?q=matrix&tmdb_key="));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves a registered token to its personal TMDB credential", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "profile-key" });
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("profile-key");
      return searchOk();
    });
    const res = await searchRoute(req(`/api/search?q=matrix&token=${created!.token}`));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls open to the server key for an unresolvable token, without erroring", async () => {
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("server-key");
      return searchOk();
    });
    const res = await searchRoute(
      req("/api/search?q=matrix&token=00000000-0000-0000-0000-000000000000")
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a direct tmdb_key wins over a token when both are supplied", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "token-key-loses" });
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("direct-wins");
      return searchOk();
    });
    const res = await searchRoute(
      req(`/api/search?q=matrix&token=${created!.token}&tmdb_key=direct-wins`)
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces a TMDB rejection of a resolved credential without falling back to the server key", async () => {
    const fetchSpy = mockTmdb(() => new Response("nope", { status: 401 }));
    const res = await searchRoute(req("/api/search?q=matrix&tmdb_key=bad-key"));
    expect(res.status).toBe(502);
    expect(await res.json()).toHaveProperty("error");
    // No silent retry with the server key: exactly one upstream call.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
