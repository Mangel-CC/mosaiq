// Route tests for GET /api/providers — TMDB credential resolution +
// in-memory cache bypass (specs/001-tmdb-byo-key). See tasks.md T012 (and
// T025 for the no-param regression case, included below).
//
// Isolation: own MOSAIQ_DB_URL/TOKEN_ENCRYPTION_KEY. TMDB is never hit for
// real — global fetch is mocked per test. Each test uses a distinct ?q=
// value so the module-level cache in src/app/api/providers/route.ts can't
// leak results between tests.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

import { GET as providersRoute } from "@/app/api/providers/route";
import { createOrUpdateProfile } from "@/lib/profile";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILENAME = `test-api-providers-${randomBytes(6).toString("hex")}.db`;
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
const DB_URL = `file:./data/${DB_FILENAME}`;

const ORIGINAL_SERVER_KEY = process.env.TMDB_API_KEY;

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.MOSAIQ_DB_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 23).toString("base64");
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

function companyOk(logoPath: string) {
  return new Response(
    JSON.stringify({ results: [{ id: 1, name: "Test Co", logo_path: logoPath }] }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function mockTmdb(handler: (apiKey: string | null, url: URL) => Response) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = new URL(typeof input === "string" ? input : (input as URL).toString());
    return handler(url.searchParams.get("api_key"), url);
  });
}

describe("GET /api/providers — TMDB credential resolution + cache bypass", () => {
  it("uses the server key when neither token nor tmdb_key is supplied (US3 regression, T025)", async () => {
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("server-key");
      return companyOk("/logo1.png");
    });
    const res = await providersRoute(req("/api/providers?q=uniqueq1"));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("caches a server-key result: a repeat identical query doesn't hit TMDB again", async () => {
    const fetchSpy = mockTmdb(() => companyOk("/logo2.png"));
    await providersRoute(req("/api/providers?q=uniqueq2"));
    await providersRoute(req("/api/providers?q=uniqueq2"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("bypasses the cache for a direct-key-resolved query, even for a repeat query", async () => {
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("direct-provider-key");
      return companyOk("/logo3.png");
    });
    await providersRoute(req("/api/providers?q=uniqueq3&tmdb_key=direct-provider-key"));
    await providersRoute(req("/api/providers?q=uniqueq3&tmdb_key=direct-provider-key"));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("resolves via a registered token, bypassing the cache too", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "providers-profile-key" });
    const fetchSpy = mockTmdb((apiKey) => {
      expect(apiKey).toBe("providers-profile-key");
      return companyOk("/logo4.png");
    });
    await providersRoute(req(`/api/providers?q=uniqueq4&token=${created!.token}`));
    await providersRoute(req(`/api/providers?q=uniqueq4&token=${created!.token}`));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("surfaces a TMDB rejection of a resolved credential without falling back to the server key", async () => {
    const fetchSpy = mockTmdb(() => new Response("nope", { status: 401 }));
    const res = await providersRoute(req("/api/providers?q=uniqueq5&tmdb_key=bad-key"));
    expect(res.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
