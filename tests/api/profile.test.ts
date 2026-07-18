// Integration-style tests for the /api/profile* route handlers, invoked
// directly (no real HTTP server) per specs/003-user-profiles/tasks.md
// T010-T012, T021, T032, exercising the exact contract documented in
// specs/003-user-profiles/contracts/profile-api.md.
//
// Isolation: same approach as tests/lib/profile.test.ts, but with its own
// unique MOSAIQ_DB_URL so the two test files never share a database file even
// when vitest runs them concurrently in separate worker threads/processes.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

import { DELETE as deleteProfile, GET as getProfile, POST as postProfile } from "@/app/api/profile/route";
import { POST as postCreation } from "@/app/api/profile/creations/route";
import {
  DELETE as deleteCreation,
  GET as getCreation,
  PUT as putCreation,
} from "@/app/api/profile/creations/[id]/route";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILENAME = `test-api-profile-${randomBytes(6).toString("hex")}.db`;
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
const DB_URL = `file:./data/${DB_FILENAME}`;

beforeAll(() => {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.MOSAIQ_DB_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const p = DB_PATH + suffix;
    if (existsSync(p)) rmSync(p);
  }
});

function getReq(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

function bodyReq(url: string, method: string, rawBody: string) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method,
    body: rawBody,
    headers: { "content-type": "application/json" },
  });
}

function jsonReq(url: string, method: string, body: unknown) {
  return bodyReq(url, method, JSON.stringify(body));
}

function withId(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createProfile(body: Record<string, unknown> = {}) {
  const res = await postProfile(jsonReq("/api/profile", "POST", body));
  const json = await res.json();
  return { res, json };
}

describe("GET /api/profile", () => {
  it("400s when ?token= is missing", async () => {
    const res = await getProfile(getReq("/api/profile"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty("error");
  });

  it("404s with { error: 'Token not found' } for an unknown token", async () => {
    const res = await getProfile(getReq("/api/profile?token=does-not-exist"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Token not found" });
  });

  it("200s with the documented shape for a known token", async () => {
    const { json: created } = await createProfile({ tmdbKey: "k1" });
    const res = await getProfile(getReq(`/api/profile?token=${created.token}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      hasTmdbKey: true,
      hasImagekitKey: false,
      creations: [],
    });
  });
});

describe("POST /api/profile", () => {
  it("400s on an invalid (non-JSON) body", async () => {
    const res = await postProfile(bodyReq("/api/profile", "POST", "not-json-at-all"));
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("400s when the JSON body parses but isn't an object", async () => {
    const res = await postProfile(bodyReq("/api/profile", "POST", JSON.stringify("just a string")));
    expect(res.status).toBe(400);
  });

  it("201s and returns a fresh token when token is omitted", async () => {
    const res = await postProfile(jsonReq("/api/profile", "POST", { tmdbKey: "abc123" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ hasTmdbKey: true, hasImagekitKey: false });
    expect(typeof json.token).toBe("string");
    expect(JSON.stringify(json)).not.toContain("abc123");
  });

  it("200s and upserts credentials when an existing token is supplied", async () => {
    const { json: created } = await createProfile({ tmdbKey: "abc123" });
    const res = await postProfile(
      jsonReq("/api/profile", "POST", { token: created.token, imagekitKey: "ik-xyz" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      token: created.token,
      hasTmdbKey: true,
      hasImagekitKey: true,
    });
    expect(JSON.stringify(json)).not.toContain("ik-xyz");
  });

  it("404s when an unknown token is supplied", async () => {
    const res = await postProfile(
      jsonReq("/api/profile", "POST", { token: "does-not-exist", tmdbKey: "x" })
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Token not found" });
  });

  it("allows creating a token with no credentials at all", async () => {
    const res = await postProfile(jsonReq("/api/profile", "POST", {}));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ hasTmdbKey: false, hasImagekitKey: false });
  });
});

describe("DELETE /api/profile", () => {
  it("400s when token or service is missing", async () => {
    const res1 = await deleteProfile(jsonReq("/api/profile", "DELETE", { service: "tmdb" }));
    expect(res1.status).toBe(400);

    const { json: created } = await createProfile({ tmdbKey: "x" });
    const res2 = await deleteProfile(jsonReq("/api/profile", "DELETE", { token: created.token }));
    expect(res2.status).toBe(400);
  });

  it("400s when service is not 'tmdb' or 'imagekit'", async () => {
    const { json: created } = await createProfile({ tmdbKey: "x" });
    const res = await deleteProfile(
      jsonReq("/api/profile", "DELETE", { token: created.token, service: "bogus" })
    );
    expect(res.status).toBe(400);
  });

  it("404s for an unknown token", async () => {
    const res = await deleteProfile(
      jsonReq("/api/profile", "DELETE", { token: "does-not-exist", service: "tmdb" })
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Token not found" });
  });

  it("removes exactly one credential, leaving the other untouched", async () => {
    const { json: created } = await createProfile({ tmdbKey: "t", imagekitKey: "i" });

    const res = await deleteProfile(
      jsonReq("/api/profile", "DELETE", { token: created.token, service: "tmdb" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasTmdbKey: false, hasImagekitKey: true });

    const check = await getProfile(getReq(`/api/profile?token=${created.token}`));
    expect(await check.json()).toMatchObject({ hasTmdbKey: false, hasImagekitKey: true });
  });
});

describe("POST /api/profile/creations", () => {
  it("400s when required fields are missing", async () => {
    const res = await postCreation(jsonReq("/api/profile/creations", "POST", { token: "x" }));
    expect(res.status).toBe(400);
  });

  it("400s when type is neither 'mosaic' nor 'cover'", async () => {
    const { json: created } = await createProfile({});
    const res = await postCreation(
      jsonReq("/api/profile/creations", "POST", {
        token: created.token,
        name: "n",
        type: "bogus",
        config: {},
      })
    );
    expect(res.status).toBe(400);
  });

  it("404s for an unknown token", async () => {
    const res = await postCreation(
      jsonReq("/api/profile/creations", "POST", {
        token: "does-not-exist",
        name: "n",
        type: "mosaic",
        config: {},
      })
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Token not found" });
  });

  it("400s when config contains a forbidden credential key", async () => {
    const { json: created } = await createProfile({});
    const res = await postCreation(
      jsonReq("/api/profile/creations", "POST", {
        token: created.token,
        name: "n",
        type: "mosaic",
        config: { tmdb_key: "leaked" },
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("201s with { id } on success", async () => {
    const { json: created } = await createProfile({});
    const res = await postCreation(
      jsonReq("/api/profile/creations", "POST", {
        token: created.token,
        name: "Top Netflix",
        type: "mosaic",
        config: { preset: "netflix", cols: 8 },
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(typeof json.id).toBe("string");
  });
});

async function makeCreation(token: string, overrides: Record<string, unknown> = {}) {
  const res = await postCreation(
    jsonReq("/api/profile/creations", "POST", {
      token,
      name: "Some Creation",
      type: "mosaic",
      config: { cols: 4 },
      ...overrides,
    })
  );
  const json = await res.json();
  return json.id as string;
}

describe("GET /api/profile/creations/:id", () => {
  it("400s when ?token= is missing", async () => {
    const { json: created } = await createProfile({});
    const id = await makeCreation(created.token);
    const res = await getCreation(getReq(`/api/profile/creations/${id}`), withId(id));
    expect(res.status).toBe(400);
  });

  it("200s with the full creation detail", async () => {
    const { json: created } = await createProfile({});
    const id = await makeCreation(created.token, { name: "Detail Me", config: { cols: 6 } });

    const res = await getCreation(
      getReq(`/api/profile/creations/${id}?token=${created.token}`),
      withId(id)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      id,
      name: "Detail Me",
      type: "mosaic",
      config: { cols: 6 },
    });
    expect(typeof json.updatedAt).toBe("number");
  });

  it("404s identically for an unknown id and for an id owned by a different token (non-disclosure)", async () => {
    const { json: ownerA } = await createProfile({});
    const { json: ownerB } = await createProfile({});
    const id = await makeCreation(ownerA.token);

    const wrongTokenRes = await getCreation(
      getReq(`/api/profile/creations/${id}?token=${ownerB.token}`),
      withId(id)
    );
    const nonexistentIdRes = await getCreation(
      getReq(`/api/profile/creations/00000000-0000-4000-8000-000000000099?token=${ownerA.token}`),
      withId("00000000-0000-4000-8000-000000000099")
    );

    expect(wrongTokenRes.status).toBe(404);
    expect(nonexistentIdRes.status).toBe(404);
    const [wrongTokenBody, nonexistentIdBody] = await Promise.all([
      wrongTokenRes.json(),
      nonexistentIdRes.json(),
    ]);
    expect(wrongTokenBody).toEqual(nonexistentIdBody);
    expect(wrongTokenBody).toEqual({ error: "Creation not found" });
  });
});

describe("PUT /api/profile/creations/:id", () => {
  it("400s when token is missing from the body", async () => {
    const { json: created } = await createProfile({});
    const id = await makeCreation(created.token);
    const res = await putCreation(
      jsonReq(`/api/profile/creations/${id}`, "PUT", { name: "x" }),
      withId(id)
    );
    expect(res.status).toBe(400);
  });

  it("400s on an invalid body", async () => {
    const { json: created } = await createProfile({});
    const id = await makeCreation(created.token);
    const res = await putCreation(
      bodyReq(`/api/profile/creations/${id}`, "PUT", "not-json"),
      withId(id)
    );
    expect(res.status).toBe(400);
  });

  it("400s when config contains a forbidden credential key", async () => {
    const { json: created } = await createProfile({});
    const id = await makeCreation(created.token);
    const res = await putCreation(
      jsonReq(`/api/profile/creations/${id}`, "PUT", {
        token: created.token,
        config: { imagekit_key: "leak" },
      }),
      withId(id)
    );
    expect(res.status).toBe(400);
  });

  it("200s with { id, updatedAt } and persists the update in place (same id)", async () => {
    const { json: created } = await createProfile({});
    const id = await makeCreation(created.token, { name: "Before" });

    const res = await putCreation(
      jsonReq(`/api/profile/creations/${id}`, "PUT", {
        token: created.token,
        name: "After",
      }),
      withId(id)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(id);
    expect(typeof json.updatedAt).toBe("number");

    const check = await getCreation(
      getReq(`/api/profile/creations/${id}?token=${created.token}`),
      withId(id)
    );
    expect((await check.json()).name).toBe("After");
  });

  it("404s identically for an unknown id and for an id owned by a different token (non-disclosure)", async () => {
    const { json: ownerA } = await createProfile({});
    const { json: ownerB } = await createProfile({});
    const id = await makeCreation(ownerA.token);

    const wrongTokenRes = await putCreation(
      jsonReq(`/api/profile/creations/${id}`, "PUT", { token: ownerB.token, name: "Hijack" }),
      withId(id)
    );
    const nonexistentIdRes = await putCreation(
      jsonReq("/api/profile/creations/00000000-0000-4000-8000-000000000098", "PUT", {
        token: ownerA.token,
        name: "Ghost",
      }),
      withId("00000000-0000-4000-8000-000000000098")
    );

    expect(wrongTokenRes.status).toBe(404);
    expect(nonexistentIdRes.status).toBe(404);
    expect(await wrongTokenRes.json()).toEqual(await nonexistentIdRes.json());
  });
});

describe("DELETE /api/profile/creations/:id", () => {
  it("400s when token is missing from the body", async () => {
    const { json: created } = await createProfile({});
    const id = await makeCreation(created.token);
    const res = await deleteCreation(
      jsonReq(`/api/profile/creations/${id}`, "DELETE", {}),
      withId(id)
    );
    expect(res.status).toBe(400);
  });

  it("200s with { deleted: true } and the creation is actually gone", async () => {
    const { json: created } = await createProfile({});
    const id = await makeCreation(created.token);

    const res = await deleteCreation(
      jsonReq(`/api/profile/creations/${id}`, "DELETE", { token: created.token }),
      withId(id)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    const check = await getCreation(
      getReq(`/api/profile/creations/${id}?token=${created.token}`),
      withId(id)
    );
    expect(check.status).toBe(404);
  });

  it("404s identically for an unknown id and for an id owned by a different token (non-disclosure)", async () => {
    const { json: ownerA } = await createProfile({});
    const { json: ownerB } = await createProfile({});
    const id = await makeCreation(ownerA.token);

    const wrongTokenRes = await deleteCreation(
      jsonReq(`/api/profile/creations/${id}`, "DELETE", { token: ownerB.token }),
      withId(id)
    );
    const nonexistentIdRes = await deleteCreation(
      jsonReq("/api/profile/creations/00000000-0000-4000-8000-000000000097", "DELETE", {
        token: ownerA.token,
      }),
      withId("00000000-0000-4000-8000-000000000097")
    );

    expect(wrongTokenRes.status).toBe(404);
    expect(nonexistentIdRes.status).toBe(404);
    expect(await wrongTokenRes.json()).toEqual(await nonexistentIdRes.json());

    // Confirm ownerA's creation genuinely survived the wrong-token attempt.
    const stillThere = await getCreation(
      getReq(`/api/profile/creations/${id}?token=${ownerA.token}`),
      withId(id)
    );
    expect(stillThere.status).toBe(200);
  });
});

describe("T032: full profile restores identically from a separate context via the same token", () => {
  it("recovers credential presence and all creations exactly, as if from a different device/browser", async () => {
    // "Device A": register a profile and save a couple of creations.
    const { json: created } = await createProfile({ tmdbKey: "device-a-tmdb", imagekitKey: "device-a-ik" });
    const token = created.token;

    const id1 = await makeCreation(token, { name: "Creation One", config: { cols: 4 } });
    const id2 = await makeCreation(token, { name: "Creation Two", config: { cols: 8 } });

    // "Device B": a separate call sequence with only the UUID token in hand
    // (fresh NextRequest objects, nothing shared with device A beyond the token
    // string itself) reconstructs the exact same state.
    const res = await getProfile(getReq(`/api/profile?token=${token}`));
    expect(res.status).toBe(200);
    const state = await res.json();

    expect(state.hasTmdbKey).toBe(true);
    expect(state.hasImagekitKey).toBe(true);
    expect(state.creations).toHaveLength(2);
    expect(new Set(state.creations.map((c: { id: string }) => c.id))).toEqual(
      new Set([id1, id2])
    );

    const namesById = Object.fromEntries(
      state.creations.map((c: { id: string; name: string }) => [c.id, c.name])
    );
    expect(namesById[id1]).toBe("Creation One");
    expect(namesById[id2]).toBe("Creation Two");

    // And each individual creation's full config also comes back intact.
    const detail1 = await getCreation(
      getReq(`/api/profile/creations/${id1}?token=${token}`),
      withId(id1)
    );
    expect((await detail1.json()).config).toEqual({ cols: 4 });
  });
});
