// Unit tests for src/lib/profile.ts — CRUD, encryption, and validation
// behavior, exercised directly (no HTTP layer). See
// specs/003-user-profiles/tasks.md T007-T009, T019-T020, T036 and
// specs/003-user-profiles/data-model.md for the contract being verified.
//
// Isolation: this module caches its libSQL client and encryption key in
// module-level state, read lazily from process.env the first time a DB/crypto
// call is made. We set MOSAIQ_DB_URL/TOKEN_ENCRYPTION_KEY to values unique to
// this file in beforeAll (before any test body runs), so this file never
// collides with tests/api/profile.test.ts even when vitest runs them
// concurrently in separate worker threads/processes.
//
// libSQL's file client does NOT create missing parent directories, so `data/`
// must exist before the first connection — mkdir'd below.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

import {
  createCreation,
  createOrUpdateProfile,
  decryptSecret,
  deleteCreation,
  deleteCredential,
  encryptSecret,
  getCreation,
  getDecryptedCredential,
  getProfile,
  listCreations,
  updateCreation,
} from "@/lib/profile";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILENAME = `test-profile-${randomBytes(6).toString("hex")}.db`;
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
const DB_URL = `file:./data/${DB_FILENAME}`;

// A second, independent libSQL connection to the exact same file, used only
// to peek at columns the module's own public API never exposes (raw
// `updated_at`) and to exercise the cascade-delete check (T036) — there is no
// `deleteProfile` export, so that row deletion is done directly here rather
// than by adding a new export to src/lib/profile.ts.
let rawClient: Client;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rawProfileUpdatedAt(token: string): Promise<number> {
  const rs = await rawClient.execute({
    sql: "SELECT updated_at FROM profiles WHERE token = ?",
    args: [token],
  });
  return Number(rs.rows[0].updated_at);
}

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true });
  process.env.MOSAIQ_DB_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

  // Trigger schema creation via the module itself before opening the raw
  // side-channel connection, so both connections agree the tables exist.
  await createOrUpdateProfile({});

  rawClient = createClient({ url: DB_URL });
});

afterAll(() => {
  rawClient?.close();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const p = DB_PATH + suffix;
    if (existsSync(p)) rmSync(p);
  }
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a value", () => {
    const encrypted = encryptSecret("super-secret-tmdb-key");
    expect(encrypted).not.toContain("super-secret-tmdb-key");
    expect(decryptSecret(encrypted)).toBe("super-secret-tmdb-key");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-value");
    expect(decryptSecret(b)).toBe("same-value");
  });

  it("throws on tampered ciphertext (auth tag mismatch)", () => {
    const encrypted = encryptSecret("tamper-me");
    const raw = Buffer.from(encrypted, "base64");
    // Flip a byte inside the ciphertext portion (after iv[12] + authTag[16]).
    raw[raw.length - 1] ^= 0xff;
    const tampered = raw.toString("base64");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("createOrUpdateProfile", () => {
  it("creates a new profile with a generated UUID token when token is omitted", async () => {
    const result = await createOrUpdateProfile({ tmdbKey: "tmdb-abc" });
    expect(result).not.toBeNull();
    expect(result!.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(result!.hasTmdbKey).toBe(true);
    expect(result!.hasImagekitKey).toBe(false);
    expect(result!.creations).toEqual([]);
  });

  it("generates a different token on each call without a token", async () => {
    const a = await createOrUpdateProfile({});
    const b = await createOrUpdateProfile({});
    expect(a!.token).not.toBe(b!.token);
  });

  it("upserts a single credential onto an existing profile, leaving the other untouched", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "tmdb-1" });
    const token = created!.token;

    const updated = await createOrUpdateProfile({ token, imagekitKey: "ik-1" });
    expect(updated).not.toBeNull();
    expect(updated!.token).toBe(token);
    expect(updated!.hasTmdbKey).toBe(true);
    expect(updated!.hasImagekitKey).toBe(true);
  });

  it("updates both credentials at once when both are provided", async () => {
    const created = await createOrUpdateProfile({});
    const token = created!.token;

    const updated = await createOrUpdateProfile({
      token,
      tmdbKey: "tmdb-2",
      imagekitKey: "ik-2",
    });
    expect(updated!.hasTmdbKey).toBe(true);
    expect(updated!.hasImagekitKey).toBe(true);
    expect(await getDecryptedCredential(token, "tmdb")).toBe("tmdb-2");
    expect(await getDecryptedCredential(token, "imagekit")).toBe("ik-2");
  });

  it("returns null (does not throw) when updating an unknown token", async () => {
    const result = await createOrUpdateProfile({
      token: "00000000-0000-4000-8000-000000000000",
      tmdbKey: "irrelevant",
    });
    expect(result).toBeNull();
  });

  it("only bumps updated_at when a credential is actually replaced, not on every call", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "bump-1" });
    const token = created!.token;
    const t0 = await rawProfileUpdatedAt(token);

    await sleep(5);
    // Neither tmdbKey nor imagekitKey provided -> no-op per the module's own
    // comment ("Solo tocar la fila ... si realmente se está reemplazando
    // alguna credencial").
    const noop = await createOrUpdateProfile({ token });
    expect(noop).not.toBeNull();
    const t1 = await rawProfileUpdatedAt(token);
    expect(t1).toBe(t0);

    await sleep(5);
    const bumped = await createOrUpdateProfile({ token, tmdbKey: "bump-2" });
    expect(bumped).not.toBeNull();
    const t2 = await rawProfileUpdatedAt(token);
    expect(t2).toBeGreaterThan(t1);
  });
});

describe("getProfile", () => {
  it("returns only boolean credential presence, never raw/decrypted values", async () => {
    const created = await createOrUpdateProfile({
      tmdbKey: "raw-tmdb-value",
      imagekitKey: "raw-ik-value",
    });
    const token = created!.token;

    const state = await getProfile(token);
    expect(state).not.toBeNull();
    expect(state!.hasTmdbKey).toBe(true);
    expect(state!.hasImagekitKey).toBe(true);

    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("raw-tmdb-value");
    expect(serialized).not.toContain("raw-ik-value");
    expect(Object.keys(state!).sort()).toEqual(
      ["creations", "hasImagekitKey", "hasTmdbKey"].sort()
    );
  });

  it("returns null for an unknown token", async () => {
    expect(await getProfile("nonexistent-token")).toBeNull();
  });
});

describe("getDecryptedCredential", () => {
  it("resolves the raw value for a stored credential", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "resolve-me" });
    expect(await getDecryptedCredential(created!.token, "tmdb")).toBe("resolve-me");
  });

  it("returns null when the credential was never set", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "only-tmdb" });
    expect(await getDecryptedCredential(created!.token, "imagekit")).toBeNull();
  });

  it("returns null for an unknown token", async () => {
    expect(await getDecryptedCredential("nonexistent-token", "tmdb")).toBeNull();
  });
});

describe("deleteCredential", () => {
  it("removes one credential and leaves the other in place", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "t", imagekitKey: "i" });
    const token = created!.token;

    const result = await deleteCredential(token, "tmdb");
    expect(result).not.toBeNull();
    expect(result!.hasTmdbKey).toBe(false);
    expect(result!.hasImagekitKey).toBe(true);
    expect(await getDecryptedCredential(token, "tmdb")).toBeNull();
    expect(await getDecryptedCredential(token, "imagekit")).toBe("i");
  });

  it("is a no-op success when deleting a credential that was never set", async () => {
    const created = await createOrUpdateProfile({ tmdbKey: "only-tmdb" });
    const token = created!.token;

    const result = await deleteCredential(token, "imagekit");
    expect(result).not.toBeNull();
    expect(result!.hasImagekitKey).toBe(false);
    expect(result!.hasTmdbKey).toBe(true);
  });

  it("returns null for an unknown token", async () => {
    expect(await deleteCredential("nonexistent-token", "tmdb")).toBeNull();
  });
});

describe("creation CRUD", () => {
  async function freshToken() {
    const created = await createOrUpdateProfile({});
    return created!.token;
  }

  it("createCreation returns an id and getCreation returns the full detail", async () => {
    const token = await freshToken();
    const created = await createCreation(token, "Top Netflix", "mosaic", {
      preset: "netflix",
      cols: 8,
    });
    expect(created).not.toBeNull();
    expect(typeof created!.id).toBe("string");

    const detail = await getCreation(created!.id, token);
    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      id: created!.id,
      name: "Top Netflix",
      type: "mosaic",
      config: { preset: "netflix", cols: 8 },
    });
    expect(typeof detail!.updatedAt).toBe("number");
  });

  it("createCreation returns null for an unknown token", async () => {
    const result = await createCreation(
      "nonexistent-token",
      "name",
      "mosaic",
      {}
    );
    expect(result).toBeNull();
  });

  it.each(["tmdb_key", "imagekit_key", "key"])(
    "createCreation rejects config containing forbidden key %s",
    async (forbiddenKey) => {
      const token = await freshToken();
      await expect(
        createCreation(token, "bad", "mosaic", { [forbiddenKey]: "x" })
      ).rejects.toThrow();
    }
  );

  it.each(["tmdb_key", "imagekit_key", "key"])(
    "updateCreation rejects config containing forbidden key %s",
    async (forbiddenKey) => {
      const token = await freshToken();
      const created = await createCreation(token, "ok", "mosaic", { cols: 4 });
      await expect(
        updateCreation(created!.id, token, { config: { [forbiddenKey]: "x" } })
      ).rejects.toThrow();
    }
  );

  it("updateCreation updates in place: id is stable, updatedAt advances", async () => {
    const token = await freshToken();
    const created = await createCreation(token, "Original", "cover", { cols: 3 });
    const before = await getCreation(created!.id, token);

    await sleep(5);
    const updated = await updateCreation(created!.id, token, { name: "Renamed" });
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created!.id);
    expect(updated!.updatedAt).toBeGreaterThan(before!.updatedAt);

    const after = await getCreation(created!.id, token);
    expect(after!.name).toBe("Renamed");
    // config untouched when only `name` was supplied
    expect(after!.config).toEqual({ cols: 3 });
  });

  it("updateCreation can update config only, leaving name untouched", async () => {
    const token = await freshToken();
    const created = await createCreation(token, "Keep My Name", "mosaic", { cols: 3 });

    await updateCreation(created!.id, token, { config: { cols: 9 } });
    const after = await getCreation(created!.id, token);
    expect(after!.name).toBe("Keep My Name");
    expect(after!.config).toEqual({ cols: 9 });
  });

  it("updateCreation can update both name and config together", async () => {
    const token = await freshToken();
    const created = await createCreation(token, "Old", "mosaic", { cols: 3 });

    await updateCreation(created!.id, token, { name: "New", config: { cols: 5 } });
    const after = await getCreation(created!.id, token);
    expect(after!.name).toBe("New");
    expect(after!.config).toEqual({ cols: 5 });
  });

  it("deleteCreation removes the row; a second delete reports false", async () => {
    const token = await freshToken();
    const created = await createCreation(token, "Doomed", "mosaic", {});

    expect(await deleteCreation(created!.id, token)).toBe(true);
    expect(await getCreation(created!.id, token)).toBeNull();
    expect(await deleteCreation(created!.id, token)).toBe(false);
  });

  it("listCreations orders results by updated_at DESC", async () => {
    const token = await freshToken();
    const first = await createCreation(token, "First", "mosaic", {});
    await sleep(5);
    const second = await createCreation(token, "Second", "mosaic", {});
    await sleep(5);
    const third = await createCreation(token, "Third", "mosaic", {});

    // Touch the first one last so it should now sort ahead of the others.
    await sleep(5);
    await updateCreation(first!.id, token, { name: "First (touched)" });

    const list = await listCreations(token);
    expect(list.map((c) => c.id)).toEqual([first!.id, third!.id, second!.id]);
  });

  it("listCreations scopes strictly to the given token", async () => {
    const tokenA = await freshToken();
    const tokenB = await freshToken();
    await createCreation(tokenA, "A's creation", "mosaic", {});

    expect(await listCreations(tokenB)).toEqual([]);
    const listA = await listCreations(tokenA);
    expect(listA).toHaveLength(1);
    expect(listA[0].name).toBe("A's creation");
  });

  describe("non-disclosure: wrong token vs nonexistent id (T020)", () => {
    it("updateCreation returns null identically whether the id doesn't exist or belongs to another token", async () => {
      const tokenA = await freshToken();
      const tokenB = await freshToken();
      const owned = await createCreation(tokenA, "Owned by A", "mosaic", {});

      const wrongToken = await updateCreation(owned!.id, tokenB, { name: "Hijack" });
      const nonexistentId = await updateCreation(
        "00000000-0000-4000-8000-000000000001",
        tokenA,
        { name: "Ghost" }
      );

      expect(wrongToken).toBeNull();
      expect(nonexistentId).toBeNull();
      expect(wrongToken).toStrictEqual(nonexistentId);

      // Confirm it genuinely wasn't touched, not just that the return value looked right.
      const stillOwnedByA = await getCreation(owned!.id, tokenA);
      expect(stillOwnedByA!.name).toBe("Owned by A");
    });

    it("deleteCreation returns false identically whether the id doesn't exist or belongs to another token", async () => {
      const tokenA = await freshToken();
      const tokenB = await freshToken();
      const owned = await createCreation(tokenA, "Owned by A", "mosaic", {});

      const wrongToken = await deleteCreation(owned!.id, tokenB);
      const nonexistentId = await deleteCreation(
        "00000000-0000-4000-8000-000000000002",
        tokenA
      );

      expect(wrongToken).toBe(false);
      expect(nonexistentId).toBe(false);

      // Confirm it genuinely wasn't deleted.
      expect(await getCreation(owned!.id, tokenA)).not.toBeNull();
    });

    it("getCreation returns null identically whether the id doesn't exist or belongs to another token", async () => {
      const tokenA = await freshToken();
      const tokenB = await freshToken();
      const owned = await createCreation(tokenA, "Owned by A", "mosaic", {});

      expect(await getCreation(owned!.id, tokenB)).toBeNull();
      expect(
        await getCreation("00000000-0000-4000-8000-000000000003", tokenA)
      ).toBeNull();
    });
  });
});

describe("cascade delete (T036): deleting a profiles row removes its creations", () => {
  it("orphans (and effectively removes) creations when the owning profile row is deleted", async () => {
    const created = await createOrUpdateProfile({});
    const token = created!.token;
    const creation = await createCreation(token, "Will be orphaned", "mosaic", {});
    expect(await getCreation(creation!.id, token)).not.toBeNull();

    // No `deleteProfile` export exists on src/lib/profile.ts, so the profile
    // row is removed directly here via a second connection to the same
    // database file, per the schema's
    // `profile_token TEXT NOT NULL REFERENCES profiles(token) ON DELETE CASCADE`.
    await rawClient.execute({
      sql: "DELETE FROM profiles WHERE token = ?",
      args: [token],
    });

    expect(await getCreation(creation!.id, token)).toBeNull();
    expect(await listCreations(token)).toEqual([]);
  });
});
