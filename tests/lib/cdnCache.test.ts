// Unit tests for src/lib/cdnCache.ts — CDN render caching via ImageKit
// (specs/002-cdn-render-cache). See tasks.md T008, T009, T015, T016, T021.
//
// Isolation: own MOSAIQ_DB_URL/TOKEN_ENCRYPTION_KEY, unique to this file,
// same approach as tests/lib/tmdb.test.ts. ImageKit HTTP calls are mocked
// via global.fetch, branching on hostname (upload.imagekit.io vs
// api.imagekit.io) the same way existing TMDB/catalog tests branch on
// api.themoviedb.org — no real ImageKit account is used.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { createOrUpdateProfile } from "@/lib/profile";
import type { CatalogItem } from "@/lib/catalog";
import {
  computeConfigHash,
  computeFreshnessToken,
  resolveImageKitKey,
  saveToCache,
  tryServeCached,
  ResolvedImageKitKey,
} from "@/lib/cdnCache";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILENAME = `test-cdncache-${randomBytes(6).toString("hex")}.db`;
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
const DB_URL = `file:./data/${DB_FILENAME}`;

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.MOSAIQ_DB_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  // Trigger schema creation before any test runs.
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

// ---- In-memory ImageKit stand-in ----
//
// Simulates enough of ImageKit's Upload / List-Search / Delete Files APIs
// (path/name-based lookup, `useUniqueFileName: false` overwrite semantics)
// for tryServeCached/saveToCache to exercise their real HTTP call shapes
// against, without a real ImageKit account.
function mockImageKitStore() {
  const files = new Map<string, { fileId: string; name: string; url: string }>();
  let counter = 0;

  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as URL).toString());
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.hostname === "upload.imagekit.io") {
      const form = init?.body as FormData;
      const fileName = form.get("fileName") as string;
      // useUniqueFileName: false → overwrite any existing file with the
      // same name instead of accumulating.
      for (const [id, f] of files) {
        if (f.name === fileName) files.delete(id);
      }
      const fileId = `file_${++counter}`;
      const record = {
        fileId,
        name: fileName,
        url: `https://ik.imagekit.io/demo/mosaiq-cache/${fileName}`,
      };
      files.set(fileId, record);
      return new Response(JSON.stringify(record), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.hostname === "api.imagekit.io" && method === "GET") {
      return new Response(JSON.stringify([...files.values()]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.hostname === "api.imagekit.io" && method === "DELETE") {
      const fileId = url.pathname.split("/").pop()!;
      files.delete(fileId);
      return new Response(null, { status: 204 });
    }

    throw new Error(`Unexpected fetch in mockImageKitStore: ${method} ${url.toString()}`);
  });

  return files;
}

describe("resolveImageKitKey", () => {
  it("uses the direct key when present, ignoring any token (direct > token)", async () => {
    const created = await createOrUpdateProfile({ imagekitKey: "token-key-ignored" });
    const result = await resolveImageKitKey({ directKey: "direct-ik-key", token: created!.token });
    expect(result).toEqual({ key: "direct-ik-key", source: "direct" });
  });

  it("treats a blank/whitespace direct key as absent, falling through to the token", async () => {
    const created = await createOrUpdateProfile({ imagekitKey: "ik-token-key-2" });
    const result = await resolveImageKitKey({ directKey: "   ", token: created!.token });
    expect(result).toEqual({ key: "ik-token-key-2", source: "token" });
  });

  it("resolves via a registered token when no direct key is present", async () => {
    const created = await createOrUpdateProfile({ imagekitKey: "personal-ik-key" });
    const result = await resolveImageKitKey({ token: created!.token });
    expect(result).toEqual({ key: "personal-ik-key", source: "token" });
  });

  it("resolves to null (NOT a server fallback) when the token doesn't resolve to any profile", async () => {
    const result = await resolveImageKitKey({ token: "00000000-0000-0000-0000-000000000000" });
    expect(result).toBeNull();
  });

  it("resolves to null when the token resolves but has no ImageKit credential registered", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "tmdb-only-no-ik" });
    const result = await resolveImageKitKey({ token: created!.token });
    expect(result).toBeNull();
  });

  it("resolves to null when neither direct key nor token is present", async () => {
    const result = await resolveImageKitKey({});
    expect(result).toBeNull();
  });

  it("treats a blank token the same as absent", async () => {
    const result = await resolveImageKitKey({ token: "   " });
    expect(result).toBeNull();
  });
});

describe("computeConfigHash", () => {
  it("is deterministic regardless of parameter order", () => {
    const a = new URLSearchParams("w=800&h=450&preset=netflix&imgs=/a.jpg,/b.jpg");
    const b = new URLSearchParams("imgs=/a.jpg,/b.jpg&preset=netflix&h=450&w=800");
    expect(computeConfigHash(a)).toBe(computeConfigHash(b));
  });

  it("excludes credential params (key, token, tmdb_key, imagekit_key) from the hash", () => {
    const withCreds = new URLSearchParams(
      "w=800&h=450&token=abc&tmdb_key=x&imagekit_key=y&key=z"
    );
    const withoutCreds = new URLSearchParams("w=800&h=450");
    expect(computeConfigHash(withCreds)).toBe(computeConfigHash(withoutCreds));
  });

  it("differs when any output-affecting parameter changes", () => {
    const base = new URLSearchParams("w=800&h=450&preset=netflix");
    const changedWidth = new URLSearchParams("w=1280&h=450&preset=netflix");
    const changedPreset = new URLSearchParams("w=800&h=450&preset=grid");
    expect(computeConfigHash(base)).not.toBe(computeConfigHash(changedWidth));
    expect(computeConfigHash(base)).not.toBe(computeConfigHash(changedPreset));
  });
});

describe("computeFreshnessToken", () => {
  it('returns the constant "static" when called with no catalog items', () => {
    expect(computeFreshnessToken()).toBe("static");
  });

  it("produces a stable hash for identical CatalogItem[] input", () => {
    const items: CatalogItem[] = [
      { id: "1", title: "A", poster: "/a.jpg", backdrop: null },
      { id: "2", title: "B", poster: "/b.jpg", backdrop: null },
    ];
    expect(computeFreshnessToken(items)).toBe(computeFreshnessToken([...items]));
  });

  it("produces a different hash when the underlying items differ", () => {
    const a: CatalogItem[] = [{ id: "1", title: "A", poster: "/a.jpg", backdrop: null }];
    const b: CatalogItem[] = [{ id: "1", title: "A", poster: "/changed.jpg", backdrop: null }];
    expect(computeFreshnessToken(a)).not.toBe(computeFreshnessToken(b));
  });

  it("differs from the static token even for an empty (but present) catalog result", () => {
    expect(computeFreshnessToken([])).not.toBe("static");
  });
});

describe("tryServeCached / saveToCache round-trip (T009)", () => {
  it("misses before saving, then serves a hit with freshnessToken 'static'", async () => {
    mockImageKitStore();
    const resolved: ResolvedImageKitKey = { key: "ik-key", source: "direct" };
    const configHash = "abc123def456";

    const missBefore = await tryServeCached(configHash, "static", resolved);
    expect(missBefore).toBeNull();

    await saveToCache(configHash, "static", Buffer.from("fake-png-bytes"), resolved);

    const hit = await tryServeCached(configHash, "static", resolved);
    expect(hit).not.toBeNull();
    expect(hit!.url).toContain(`${configHash}--static.png`);
  });

  it("does not hit for a different freshnessToken under the same configHash", async () => {
    mockImageKitStore();
    const resolved: ResolvedImageKitKey = { key: "ik-key", source: "direct" };
    const configHash = "hash-777";

    await saveToCache(configHash, "freshness-a", Buffer.from("v1"), resolved);

    const miss = await tryServeCached(configHash, "freshness-b", resolved);
    expect(miss).toBeNull();

    const hit = await tryServeCached(configHash, "freshness-a", resolved);
    expect(hit).not.toBeNull();
  });
});

describe("saveToCache stale cleanup (T016, FR-008)", () => {
  it("replaces a prior cached file with a different freshnessToken, leaving exactly one file behind", async () => {
    const files = mockImageKitStore();
    const resolved: ResolvedImageKitKey = { key: "ik-key", source: "direct" };
    const configHash = "def456";

    await saveToCache(configHash, "hash-old", Buffer.from("v1"), resolved);
    expect([...files.values()].filter((f) => f.name.startsWith(`${configHash}--`))).toHaveLength(1);

    await saveToCache(configHash, "hash-new", Buffer.from("v2"), resolved);

    const remaining = [...files.values()].filter((f) => f.name.startsWith(`${configHash}--`));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe(`${configHash}--hash-new.png`);
  });

  it("re-saving the identical configHash+freshnessToken overwrites in place (no accumulation)", async () => {
    const files = mockImageKitStore();
    const resolved: ResolvedImageKitKey = { key: "ik-key", source: "direct" };
    const configHash = "same-hash";

    await saveToCache(configHash, "static", Buffer.from("v1"), resolved);
    await saveToCache(configHash, "static", Buffer.from("v2"), resolved);

    const remaining = [...files.values()].filter((f) => f.name.startsWith(`${configHash}--`));
    expect(remaining).toHaveLength(1);
  });

  it("does not disturb files under a different configHash", async () => {
    const files = mockImageKitStore();
    const resolved: ResolvedImageKitKey = { key: "ik-key", source: "direct" };

    await saveToCache("hash-one", "static", Buffer.from("v1"), resolved);
    await saveToCache("hash-two", "static", Buffer.from("v2"), resolved);

    expect(files.size).toBe(2);
  });
});

describe("failure propagation — cdnCache functions throw, callers (routes, T022) must catch (T021)", () => {
  it("tryServeCached rejects when ImageKit's list call returns non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const resolved: ResolvedImageKitKey = { key: "bad-key", source: "direct" };
    await expect(tryServeCached("hash", "static", resolved)).rejects.toThrow();
  });

  it("saveToCache rejects when ImageKit's upload call returns non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("server error", { status: 500 }));
    const resolved: ResolvedImageKitKey = { key: "bad-key", source: "direct" };
    await expect(
      saveToCache("hash", "static", Buffer.from("x"), resolved)
    ).rejects.toThrow();
  });

  it("tryServeCached rejects when the network call itself fails", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));
    const resolved: ResolvedImageKitKey = { key: "any-key", source: "direct" };
    await expect(tryServeCached("hash", "static", resolved)).rejects.toThrow();
  });

  it("saveToCache rejects when the stale-cleanup list call fails after a successful upload", async () => {
    let uploadDone = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = new URL(typeof input === "string" ? input : (input as URL).toString());
      if (url.hostname === "upload.imagekit.io") {
        uploadDone = true;
        return new Response(
          JSON.stringify({ fileId: "f1", name: "hash--static.png", url: "https://ik.imagekit.io/x" }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("server error", { status: 500 });
    });
    const resolved: ResolvedImageKitKey = { key: "any-key", source: "direct" };
    await expect(
      saveToCache("hash", "static", Buffer.from("x"), resolved)
    ).rejects.toThrow();
    expect(uploadDone).toBe(true);
  });
});
