// Route tests for GET /api/cover — TMDB credential resolution for
// `?notext=1` and `catalog=` (specs/001-tmdb-byo-key). See tasks.md T014
// (and T025 for the no-param regression case, included below).
//
// Isolation: own MOSAIQ_DB_URL/TOKEN_ENCRYPTION_KEY. TMDB and image fetches
// are mocked; a 1x1 transparent PNG stands in for real image bytes so
// @napi-rs/canvas can render without any real network access.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

import { GET as coverRoute } from "@/app/api/cover/route";
import { createOrUpdateProfile } from "@/lib/profile";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILENAME = `test-api-cover-${randomBytes(6).toString("hex")}.db`;
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
const DB_URL = `file:./data/${DB_FILENAME}`;

const ORIGINAL_SERVER_KEY = process.env.TMDB_API_KEY;

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.MOSAIQ_DB_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 25).toString("base64");
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

// ?notext=1&id=<numeric>&media=movie: resolveTmdbRef never itself calls
// TMDB for a numeric id, so only fetchTextlessArt's /movie/{id}/images call
// needs stubbing, followed by the actual image byte fetch.
function mockTextlessFetch(opts: { expectedApiKey: string; textlessPoster?: string }) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = new URL(typeof input === "string" ? input : (input as URL).toString());
    if (url.hostname === "api.themoviedb.org") {
      expect(url.searchParams.get("api_key")).toBe(opts.expectedApiKey);
      return new Response(
        JSON.stringify({
          posters: opts.textlessPoster ? [{ file_path: opts.textlessPoster }] : [],
          backdrops: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(TINY_PNG, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });
}

describe("GET /api/cover — TMDB credential resolution", () => {
  describe("?notext=1 (textless art)", () => {
    it("uses the server key when neither token nor tmdb_key is supplied (US3 regression, T025)", async () => {
      const fetchSpy = mockTextlessFetch({
        expectedApiKey: "server-key",
        textlessPoster: "/textless.jpg",
      });
      const res = await coverRoute(
        req("/api/cover?img=https://fake.cover.test/bg.png&notext=1&id=603&media=movie&w=64&h=64")
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("uses a directly-supplied tmdb_key", async () => {
      mockTextlessFetch({
        expectedApiKey: "cover-direct-key",
        textlessPoster: "/textless2.jpg",
      });
      const res = await coverRoute(
        req(
          "/api/cover?img=https://fake.cover.test/bg.png&notext=1&id=603&media=movie&w=64&h=64&tmdb_key=cover-direct-key"
        )
      );
      expect(res.status).toBe(200);
    });

    it("resolves via a registered token", async () => {
      const created = await createOrUpdateProfile({ tmdbKey: "cover-token-key" });
      mockTextlessFetch({
        expectedApiKey: "cover-token-key",
        textlessPoster: "/textless3.jpg",
      });
      const res = await coverRoute(
        req(
          `/api/cover?img=https://fake.cover.test/bg.png&notext=1&id=603&media=movie&w=64&h=64&token=${created!.token}`
        )
      );
      expect(res.status).toBe(200);
    });

    it("surfaces a clear error when TMDB rejects a directly-supplied key, instead of falling back to the plain background image (contracts/tmdb-key-param.md)", async () => {
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = new URL(typeof input === "string" ? input : (input as URL).toString());
        if (url.hostname === "api.themoviedb.org") {
          return new Response("nope", { status: 401 });
        }
        return new Response(TINY_PNG, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      });
      const res = await coverRoute(
        req(
          "/api/cover?img=https://fake.cover.test/bg.png&notext=1&id=603&media=movie&w=64&h=64&tmdb_key=bad-cover-key"
        )
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toMatch(/credencial/i);
    });
  });

  describe("catalog=", () => {
    it("resolves catalog art using the resolved credential", async () => {
      const catalogUrl = "https://fake.cover-catalog.test/top.json";
      const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = new URL(typeof input === "string" ? input : (input as URL).toString());
        if (url.toString().startsWith(catalogUrl)) {
          return new Response(
            JSON.stringify({
              metas: [
                { id: "c1", name: "Cover Catalog Item", poster: "https://fake.img.test/c1.png" },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.hostname === "api.themoviedb.org") {
          expect(url.searchParams.get("api_key")).toBe("cover-catalog-key");
          return new Response(JSON.stringify({ results: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(TINY_PNG, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      });

      const res = await coverRoute(
        req(
          `/api/cover?catalog=${encodeURIComponent(catalogUrl)}&pick=1&w=64&h=64&tmdb_key=cover-catalog-key`
        )
      );
      expect(res.status).toBe(200);
      fetchSpy.mockRestore();
    });
  });
});
