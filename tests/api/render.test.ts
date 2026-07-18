// Route tests for GET /api/render — TMDB credential resolution for
// `catalog=` (specs/001-tmdb-byo-key). See tasks.md T013 (and T025 for the
// no-param regression case, included below).
//
// Isolation: own MOSAIQ_DB_URL/TOKEN_ENCRYPTION_KEY. Both the catalog JSON
// fetch and any TMDB calls are mocked; a 1x1 transparent PNG stands in for
// the actual poster bytes @napi-rs/canvas needs to load so the route can
// render a real (tiny) PNG without any real network access.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

import { GET as renderRoute } from "@/app/api/render/route";
import { createOrUpdateProfile } from "@/lib/profile";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILENAME = `test-api-render-${randomBytes(6).toString("hex")}.db`;
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
const DB_URL = `file:./data/${DB_FILENAME}`;

const ORIGINAL_SERVER_KEY = process.env.TMDB_API_KEY;

// A real (if trivial) 1x1 transparent PNG, so @napi-rs/canvas's loadImage
// can decode it like a genuine poster/backdrop fetch would return.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.MOSAIQ_DB_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 24).toString("base64");
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

// Metas carry an absolute fallback poster URL and no imdb/tmdb id, but DO
// have a `name`, so resolveMeta (src/lib/catalog.ts) will still attempt a
// TMDB "search by name" call before falling back to that poster — that call
// is stubbed to return no results so the fallback image is what actually
// gets rendered.
function mockRenderFetch(opts: {
  expectedApiKey: string;
  catalogUrl: string;
  metas: unknown[];
}) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = new URL(typeof input === "string" ? input : (input as URL).toString());
    if (url.toString().startsWith(opts.catalogUrl)) {
      return new Response(JSON.stringify({ metas: opts.metas }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "api.themoviedb.org") {
      expect(url.searchParams.get("api_key")).toBe(opts.expectedApiKey);
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Poster fetch (the fallback absolute URL from the catalog meta).
    return new Response(TINY_PNG, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });
}

describe("GET /api/render — TMDB credential resolution for catalog=", () => {
  it("resolves catalog art using the server key by default (US3 regression, T025)", async () => {
    const catalogUrl = "https://fake.render.test/catalog1.json";
    const metas = [{ id: "r1", name: "Render Item", poster: "https://fake.img.test/r1.png" }];
    mockRenderFetch({ expectedApiKey: "server-key", catalogUrl, metas });

    const res = await renderRoute(
      req(`/api/render?catalog=${encodeURIComponent(catalogUrl)}&limit=1&w=64&h=64`)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("resolves catalog art using a directly-supplied tmdb_key", async () => {
    const catalogUrl = "https://fake.render.test/catalog2.json";
    const metas = [{ id: "r2", name: "Render Item 2", poster: "https://fake.img.test/r2.png" }];
    mockRenderFetch({ expectedApiKey: "render-direct-key", catalogUrl, metas });

    const res = await renderRoute(
      req(
        `/api/render?catalog=${encodeURIComponent(catalogUrl)}&limit=1&w=64&h=64&tmdb_key=render-direct-key`
      )
    );
    expect(res.status).toBe(200);
  });

  it("resolves catalog art using a registered token", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "render-token-key" });
    const catalogUrl = "https://fake.render.test/catalog3.json";
    const metas = [{ id: "r3", name: "Render Item 3", poster: "https://fake.img.test/r3.png" }];
    mockRenderFetch({ expectedApiKey: "render-token-key", catalogUrl, metas });

    const res = await renderRoute(
      req(
        `/api/render?catalog=${encodeURIComponent(catalogUrl)}&limit=1&w=64&h=64&token=${created!.token}`
      )
    );
    expect(res.status).toBe(200);
  });

  it("surfaces a clear error when TMDB rejects a directly-supplied key, instead of falling back to a fallback poster (contracts/tmdb-key-param.md)", async () => {
    const catalogUrl = "https://fake.render.test/catalog4.json";
    // moviedb_id forces resolveMeta to call TMDB directly (not "search by
    // name"), so the mock below can reject that specific call with a 401.
    const metas = [{ id: "r4", moviedb_id: 603, poster: "https://fake.img.test/r4.png" }];
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = new URL(typeof input === "string" ? input : (input as URL).toString());
      if (url.toString().startsWith(catalogUrl)) {
        return new Response(JSON.stringify({ metas }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.hostname === "api.themoviedb.org") {
        return new Response("nope", { status: 401 });
      }
      return new Response(TINY_PNG, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });

    const res = await renderRoute(
      req(
        `/api/render?catalog=${encodeURIComponent(catalogUrl)}&limit=1&w=64&h=64&tmdb_key=bad-render-key`
      )
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/credencial/i);
  });
});

// ---- CDN render caching (specs/002-cdn-render-cache) ----
//
// In-memory ImageKit stand-in, same shape as tests/lib/cdnCache.test.ts's
// mockImageKitStore, optionally combined with a catalog-JSON branch so a
// single mock can serve both the ?catalog= fetch and the ImageKit calls.
function mockCdnFetch(opts: {
  files: Map<string, { fileId: string; name: string; url: string }>;
  catalogUrl?: string;
  getMetas?: () => unknown[];
}) {
  let counter = 0;
  return vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as URL).toString());
    const method = (init?.method ?? "GET").toUpperCase();

    if (opts.catalogUrl && url.toString().startsWith(opts.catalogUrl)) {
      return new Response(JSON.stringify({ metas: opts.getMetas ? opts.getMetas() : [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.hostname === "upload.imagekit.io") {
      const form = init?.body as FormData;
      const fileName = form.get("fileName") as string;
      for (const [id, f] of opts.files) {
        if (f.name === fileName) opts.files.delete(id);
      }
      const fileId = `file_${++counter}`;
      const record = {
        fileId,
        name: fileName,
        url: `https://ik.imagekit.io/demo/mosaiq-cache/${fileName}`,
      };
      opts.files.set(fileId, record);
      return new Response(JSON.stringify(record), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.hostname === "api.imagekit.io" && method === "GET") {
      return new Response(JSON.stringify([...opts.files.values()]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.hostname === "api.imagekit.io" && method === "DELETE") {
      const fileId = url.pathname.split("/").pop()!;
      opts.files.delete(fileId);
      return new Response(null, { status: 204 });
    }

    // Poster/backdrop bytes (imgs= or catalog fallback poster URLs).
    return new Response(TINY_PNG, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });
}

describe("GET /api/render — CDN render caching (specs/002-cdn-render-cache)", () => {
  it("US1 (T010): cache miss renders+uploads (200), identical repeat is a 302 redirect, changed params get a distinct entry", async () => {
    const created = await createOrUpdateProfile({ imagekitKey: "render-ik-key" });
    const files = new Map<string, { fileId: string; name: string; url: string }>();
    mockCdnFetch({ files });

    const url = `/api/render?preset=netflix&w=64&h=64&imgs=/x1.jpg,/x2.jpg&token=${created!.token}`;

    const first = await renderRoute(req(url));
    expect(first.status).toBe(200);
    expect(first.headers.get("Content-Type")).toBe("image/png");
    expect(files.size).toBe(1);

    const second = await renderRoute(req(url));
    expect(second.status).toBe(302);
    expect(second.headers.get("Location")).toContain("imagekit.io");
    expect(files.size).toBe(1);

    const changed = await renderRoute(
      req(`/api/render?preset=netflix&w=128&h=64&imgs=/x1.jpg,/x2.jpg&token=${created!.token}`)
    );
    expect(changed.status).toBe(200);
    expect(files.size).toBe(2);
  });

  it("US1: works via a directly-supplied imagekit_key too (secondary mechanism)", async () => {
    const files = new Map<string, { fileId: string; name: string; url: string }>();
    mockCdnFetch({ files });

    const url = "/api/render?preset=netflix&w=64&h=64&imgs=/direct1.jpg&imagekit_key=direct-render-ik-key";
    const first = await renderRoute(req(url));
    expect(first.status).toBe(200);
    expect(files.size).toBe(1);

    const second = await renderRoute(req(url));
    expect(second.status).toBe(302);
  });

  it("US2 (T017): catalog requests hit when content is unchanged, and produce a fresh render replacing the old file when content changes", async () => {
    const created = await createOrUpdateProfile({ imagekitKey: "render-ik-catalog-key" });
    const files = new Map<string, { fileId: string; name: string; url: string }>();
    const catalogUrl = "https://fake.render-cache.test/top.json";
    let metas: unknown[] = [
      { id: "m1", name: "Item One", poster: "https://fake.img.test/m1.png" },
    ];
    mockCdnFetch({ files, catalogUrl, getMetas: () => metas });

    // tmdb_key (source "direct") bypasses src/lib/catalog.ts's own 5-minute
    // in-memory TTL cache (research.md Decision 4 there), so this test can
    // isolate the CDN-caching layer's freshness detection (specs/002) from
    // that unrelated, separately-scoped cache.
    const url = `/api/render?preset=netflix&w=64&h=64&catalog=${encodeURIComponent(catalogUrl)}&limit=1&token=${created!.token}&tmdb_key=bypass-catalog-cache`;

    const first = await renderRoute(req(url));
    expect(first.status).toBe(200);
    expect(files.size).toBe(1);
    const firstFileName = [...files.values()][0].name;

    const second = await renderRoute(req(url));
    expect(second.status).toBe(302);
    expect(files.size).toBe(1);

    // Catalog content changes.
    metas = [{ id: "m1", name: "Item One Renamed", poster: "https://fake.img.test/m1-changed.png" }];

    const third = await renderRoute(req(url));
    expect(third.status).toBe(200);
    expect(files.size).toBe(1); // replaced, not accumulated (FR-008)
    const thirdFileName = [...files.values()][0].name;
    expect(thirdFileName).not.toBe(firstFileName);
  });

  it("US3 (T020): makes no ImageKit calls when no token/imagekit_key is supplied", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = new URL(typeof input === "string" ? input : (input as URL).toString());
      if (url.hostname === "api.imagekit.io" || url.hostname === "upload.imagekit.io") {
        throw new Error(`Unexpected ImageKit call: ${url.toString()}`);
      }
      return new Response(TINY_PNG, { status: 200, headers: { "content-type": "image/png" } });
    });

    const res = await renderRoute(req("/api/render?preset=netflix&w=64&h=64&imgs=/noik1.jpg"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    fetchSpy.mockRestore();
  });

  it("US3 (T020): still renders (200, valid PNG) when the resolved ImageKit credential/CDN is unreachable or rejects", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = new URL(typeof input === "string" ? input : (input as URL).toString());
      if (url.hostname === "api.imagekit.io" || url.hostname === "upload.imagekit.io") {
        return new Response("unauthorized", { status: 401 });
      }
      return new Response(TINY_PNG, { status: 200, headers: { "content-type": "image/png" } });
    });

    const res = await renderRoute(
      req("/api/render?preset=netflix&w=64&h=64&imgs=/noik2.jpg&imagekit_key=not-a-real-key")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    fetchSpy.mockRestore();
  });
});
