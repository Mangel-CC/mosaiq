// Route tests for GET /api/art — TMDB credential resolution
// (specs/001-tmdb-byo-key). See tasks.md T011 (and T025 for the no-param
// regression case, included below).
//
// Isolation: own MOSAIQ_DB_URL/TOKEN_ENCRYPTION_KEY. TMDB is never hit for
// real — global fetch is mocked per test. A numeric `id` is used throughout
// so resolveTmdbRef never itself calls TMDB (only fetchTextlessArt does),
// keeping each test to a single upstream call.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

import { GET as artRoute } from "@/app/api/art/route";
import { createOrUpdateProfile } from "@/lib/profile";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILENAME = `test-api-art-${randomBytes(6).toString("hex")}.db`;
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
const DB_URL = `file:./data/${DB_FILENAME}`;

const ORIGINAL_SERVER_KEY = process.env.TMDB_API_KEY;

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.MOSAIQ_DB_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 22).toString("base64");
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

function artOk(paths: { poster?: string; backdrop?: string } = {}) {
  return new Response(
    JSON.stringify({
      posters: paths.poster ? [{ file_path: paths.poster }] : [],
      backdrops: paths.backdrop ? [{ file_path: paths.backdrop }] : [],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function mockTmdb(handler: (apiKey: string | null, url: URL) => Response) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = new URL(typeof input === "string" ? input : (input as URL).toString());
    return handler(url.searchParams.get("api_key"), url);
  });
}

describe("GET /api/art — TMDB credential resolution", () => {
  it("uses the server key when neither token nor tmdb_key is supplied (US3 regression, T025)", async () => {
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("server-key");
      return artOk({ poster: "/p.jpg" });
    });
    const res = await artRoute(req("/api/art?id=603&media=movie"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ poster: "/p.jpg", backdrop: null });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("uses a directly-supplied tmdb_key", async () => {
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("direct-art-key");
      return artOk({ backdrop: "/b.jpg" });
    });
    const res = await artRoute(
      req("/api/art?id=603&media=movie&tmdb_key=direct-art-key")
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves via a registered token", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "art-profile-key" });
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("art-profile-key");
      return artOk({ poster: "/p2.jpg" });
    });
    const res = await artRoute(
      req(`/api/art?id=603&media=movie&token=${created!.token}`)
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns 500 'not configured' only when there is truly no key anywhere", async () => {
    const original = process.env.TMDB_API_KEY;
    delete process.env.TMDB_API_KEY;
    try {
      const res = await artRoute(req("/api/art?id=603&media=movie"));
      expect(res.status).toBe(500);
    } finally {
      process.env.TMDB_API_KEY = original;
    }
  });

  it("a direct key still works even when the server has no key configured (SC-001/SC-002)", async () => {
    const original = process.env.TMDB_API_KEY;
    delete process.env.TMDB_API_KEY;
    try {
      const fetchSpy = mockTmdb((apiKey) => {
        expect(apiKey).toBe("only-this-one");
        return artOk({ poster: "/p3.jpg" });
      });
      const res = await artRoute(
        req("/api/art?id=603&media=movie&tmdb_key=only-this-one")
      );
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      process.env.TMDB_API_KEY = original;
    }
  });

  it("surfaces a TMDB rejection of a resolved credential without falling back to the server key", async () => {
    const fetchSpy = mockTmdb(() => new Response("nope", { status: 401 }));
    const res = await artRoute(
      req("/api/art?id=603&media=movie&tmdb_key=bad-key")
    );
    // contracts/tmdb-key-param.md: a resolved (non-server) credential that
    // TMDB rejects must surface a clear error, never silently degrade to
    // "no art"/not-found — and must never retry with a different key.
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/credencial/i);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
