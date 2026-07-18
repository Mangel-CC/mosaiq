// Unit tests for src/lib/tmdb.ts's resolveTmdbKey — precedence and
// fail-open behavior per specs/001-tmdb-byo-key/data-model.md and
// contracts/tmdb-key-param.md. See specs/001-tmdb-byo-key/tasks.md T008.
//
// Isolation: same approach as tests/lib/profile.test.ts — a DB file unique
// to this test file, set up in beforeAll before any test body runs, so this
// file never collides with other test files even when vitest runs them
// concurrently in separate worker threads/processes.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { createOrUpdateProfile } from "@/lib/profile";
import { hasTmdbKey, resolveTmdbKey, tmdbFetch } from "@/lib/tmdb";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILENAME = `test-tmdb-${randomBytes(6).toString("hex")}.db`;
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
const DB_URL = `file:./data/${DB_FILENAME}`;

const ORIGINAL_SERVER_KEY = process.env.TMDB_API_KEY;

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.MOSAIQ_DB_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  process.env.TMDB_API_KEY = "server-shared-key";
  // Trigger schema creation before any test runs.
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

describe("resolveTmdbKey", () => {
  it("uses the direct key when present, ignoring any token (direct > token)", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "token-key-ignored" });
    const result = await resolveTmdbKey({
      directKey: "direct-key",
      token: created!.token,
    });
    expect(result).toEqual({ key: "direct-key", source: "direct" });
  });

  it("treats a blank/whitespace direct key as absent, falling through to the token", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "token-key-2" });
    const result = await resolveTmdbKey({
      directKey: "   ",
      token: created!.token,
    });
    expect(result).toEqual({ key: "token-key-2", source: "token" });
  });

  it("resolves via a registered token when no direct key is present (token > server)", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "personal-key" });
    const result = await resolveTmdbKey({ token: created!.token });
    expect(result).toEqual({ key: "personal-key", source: "token" });
  });

  it("falls open to the server key when the token doesn't resolve to any profile", async () => {
    const result = await resolveTmdbKey({
      token: "00000000-0000-0000-0000-000000000000",
    });
    expect(result).toEqual({ key: "server-shared-key", source: "server" });
  });

  it("falls open to the server key when the token resolves but has no TMDB credential registered", async () => {
    const created = await createOrUpdateProfile({ imagekitKey: "ik-only-no-tmdb" });
    const result = await resolveTmdbKey({ token: created!.token });
    expect(result).toEqual({ key: "server-shared-key", source: "server" });
  });

  it("falls back to the server key when neither direct key nor token is present", async () => {
    const result = await resolveTmdbKey({});
    expect(result).toEqual({ key: "server-shared-key", source: "server" });
  });

  it("treats a blank token the same as absent", async () => {
    const result = await resolveTmdbKey({ token: "   " });
    expect(result).toEqual({ key: "server-shared-key", source: "server" });
  });
});

describe("hasTmdbKey", () => {
  it("reflects whether the resolved key is non-empty", () => {
    expect(hasTmdbKey({ key: "x", source: "direct" })).toBe(true);
    expect(hasTmdbKey({ key: "", source: "server" })).toBe(false);
  });

  it("defaults to checking the server key when called with no argument", () => {
    expect(hasTmdbKey()).toBe(true);
  });
});

describe("tmdbFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends v3-style keys as ?api_key= and v4 (JWT) tokens as a Bearer header", async () => {
    const calls: { url: URL; headers: HeadersInit | undefined }[] = [];
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input, init) => {
        calls.push({
          url: new URL(typeof input === "string" ? input : (input as URL).toString()),
          headers: init?.headers,
        });
        return new Response("{}", { status: 200 });
      });

    await tmdbFetch("/search/multi", { query: "matrix" }, { key: "v3-key", source: "direct" });
    await tmdbFetch(
      "/search/multi",
      { query: "matrix" },
      { key: "eyJhbGciOiJIUzI1NiJ9.fake.jwt", source: "direct" }
    );

    expect(calls[0].url.searchParams.get("api_key")).toBe("v3-key");
    expect(calls[0].headers).toEqual({});

    expect(calls[1].url.searchParams.get("api_key")).toBeNull();
    expect((calls[1].headers as Record<string, string>).Authorization).toBe(
      "Bearer eyJhbGciOiJIUzI1NiJ9.fake.jwt"
    );

    fetchSpy.mockRestore();
  });
});
