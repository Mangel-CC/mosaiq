// Perfil de usuario: token opaco -> credenciales de terceros encriptadas +
// creaciones guardadas. Ver specs/003-user-profiles. Nunca se exponen valores
// crudos de credenciales fuera de este módulo.

import { createClient, type Client } from "@libsql/client";
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from "crypto";

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function getClient(): Client {
  if (!client) {
    client = createClient({
      url: process.env.MOSAIQ_DB_URL ?? "file:./data/mosaiq.db",
      authToken: process.env.MOSAIQ_DB_AUTH_TOKEN,
    });
  }
  return client;
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getClient();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS profiles (
          token TEXT PRIMARY KEY,
          tmdb_key_encrypted TEXT,
          imagekit_key_encrypted TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS creations (
          id TEXT PRIMARY KEY,
          profile_token TEXT NOT NULL REFERENCES profiles(token) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('mosaic', 'cover')),
          config TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_creations_profile_token ON creations(profile_token)`
      );
    })();
  }
  return schemaReady;
}

async function db(): Promise<Client> {
  await ensureSchema();
  return getClient();
}

// ---- Encriptación (AES-256-GCM, key del servidor) ----

function getEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY no está configurada: requerida para guardar credenciales de usuario"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY debe ser 32 bytes en base64 (AES-256)");
  }
  return key;
}

// Exportadas (no solo de uso interno) para que puedan probarse directamente
// (round-trip) sin pasar por el resto del módulo — ver tests/lib/profile.test.ts.
export function encryptSecret(value: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const key = getEncryptionKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ---- Profile ----
//
// Convención de "no encontrado" en todo este módulo: las funciones de
// lectura/escritura sobre un token o una creación devuelven `null` (o
// `false` en el caso puntual de `deleteCreation`, que ya es booleano) en
// vez de lanzar, para que la capa de rutas (src/app/api/profile/**) las
// traduzca de forma uniforme a un 404. Errores de validación (p. ej. config
// con una clave de credencial) sí se lanzan como `Error`, ya que esos son
// errores del llamador (400), no un "no encontrado".

export interface ProfileState {
  hasTmdbKey: boolean;
  hasImagekitKey: boolean;
  creations: CreationSummary[];
}

interface ProfileRow {
  token: string;
  tmdb_key_encrypted: string | null;
  imagekit_key_encrypted: string | null;
}

async function findProfileRow(token: string): Promise<ProfileRow | null> {
  const conn = await db();
  const rs = await conn.execute({
    sql: "SELECT token, tmdb_key_encrypted, imagekit_key_encrypted FROM profiles WHERE token = ?",
    args: [token],
  });
  if (rs.rows.length === 0) return null;
  const row = rs.rows[0];
  return {
    token: row.token as string,
    tmdb_key_encrypted: row.tmdb_key_encrypted as string | null,
    imagekit_key_encrypted: row.imagekit_key_encrypted as string | null,
  };
}

export async function createOrUpdateProfile(params: {
  token?: string;
  tmdbKey?: string;
  imagekitKey?: string;
}): Promise<(ProfileState & { token: string }) | null> {
  const conn = await db();
  const now = Date.now();

  if (!params.token) {
    const token = randomUUID();
    await conn.execute({
      sql: `INSERT INTO profiles (token, tmdb_key_encrypted, imagekit_key_encrypted, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        token,
        params.tmdbKey ? encryptSecret(params.tmdbKey) : null,
        params.imagekitKey ? encryptSecret(params.imagekitKey) : null,
        now,
        now,
      ],
    });
    const state = await getProfile(token);
    if (!state) throw new Error("No se pudo crear el perfil");
    return { token, ...state };
  }

  const existing = await findProfileRow(params.token);
  if (!existing) return null;

  // Solo tocar la fila (y su updated_at) si realmente se está reemplazando
  // alguna credencial — data-model.md: "Bumped on any credential change".
  if (params.tmdbKey !== undefined || params.imagekitKey !== undefined) {
    const tmdbEncrypted =
      params.tmdbKey !== undefined ? encryptSecret(params.tmdbKey) : existing.tmdb_key_encrypted;
    const imagekitEncrypted =
      params.imagekitKey !== undefined
        ? encryptSecret(params.imagekitKey)
        : existing.imagekit_key_encrypted;

    await conn.execute({
      sql: `UPDATE profiles SET tmdb_key_encrypted = ?, imagekit_key_encrypted = ?, updated_at = ?
            WHERE token = ?`,
      args: [tmdbEncrypted, imagekitEncrypted, now, params.token],
    });
  }

  const state = await getProfile(params.token);
  if (!state) throw new Error("No se pudo actualizar el perfil");
  return { token: params.token, ...state };
}

export async function getProfile(token: string): Promise<ProfileState | null> {
  const row = await findProfileRow(token);
  if (!row) return null;
  const creations = await listCreations(token);
  return {
    hasTmdbKey: Boolean(row.tmdb_key_encrypted),
    hasImagekitKey: Boolean(row.imagekit_key_encrypted),
    creations,
  };
}

/**
 * Resuelve la credencial cruda de un servicio para uso interno (features
 * 001/002). Nunca se expone vía API — solo se llama server-side al hacer
 * peticiones a TMDB/ImageKit.
 */
export async function getDecryptedCredential(
  token: string,
  service: "tmdb" | "imagekit"
): Promise<string | null> {
  const row = await findProfileRow(token);
  if (!row) return null;
  const encrypted = service === "tmdb" ? row.tmdb_key_encrypted : row.imagekit_key_encrypted;
  return encrypted ? decryptSecret(encrypted) : null;
}

export async function deleteCredential(
  token: string,
  service: "tmdb" | "imagekit"
): Promise<ProfileState | null> {
  const existing = await findProfileRow(token);
  if (!existing) return null;
  const conn = await db();
  const column = service === "tmdb" ? "tmdb_key_encrypted" : "imagekit_key_encrypted";
  await conn.execute({
    sql: `UPDATE profiles SET ${column} = NULL, updated_at = ? WHERE token = ?`,
    args: [Date.now(), token],
  });
  return getProfile(token);
}

// ---- Creations ----

export interface CreationSummary {
  id: string;
  name: string;
  type: "mosaic" | "cover";
  updatedAt: number;
}

export interface CreationDetail extends CreationSummary {
  config: Record<string, unknown>;
}

const FORBIDDEN_CONFIG_KEYS = ["tmdb_key", "imagekit_key", "key"];

function assertConfigHasNoCredentials(config: Record<string, unknown>) {
  for (const forbidden of FORBIDDEN_CONFIG_KEYS) {
    if (forbidden in config) {
      throw new Error(`config no puede incluir el parámetro de credencial "${forbidden}"`);
    }
  }
}

export async function createCreation(
  token: string,
  name: string,
  type: "mosaic" | "cover",
  config: Record<string, unknown>
): Promise<{ id: string } | null> {
  const profile = await findProfileRow(token);
  if (!profile) return null;
  assertConfigHasNoCredentials(config);

  const conn = await db();
  const id = randomUUID();
  const now = Date.now();
  await conn.execute({
    sql: `INSERT INTO creations (id, profile_token, name, type, config, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, token, name, type, JSON.stringify(config), now, now],
  });
  return { id };
}

export async function updateCreation(
  id: string,
  token: string,
  updates: { name?: string; config?: Record<string, unknown> }
): Promise<{ id: string; updatedAt: number } | null> {
  const existing = await getCreation(id, token);
  if (!existing) return null;
  if (updates.config) assertConfigHasNoCredentials(updates.config);

  const conn = await db();
  const now = Date.now();
  const name = updates.name ?? existing.name;
  const config = updates.config ? JSON.stringify(updates.config) : JSON.stringify(existing.config);
  await conn.execute({
    sql: `UPDATE creations SET name = ?, config = ?, updated_at = ? WHERE id = ? AND profile_token = ?`,
    args: [name, config, now, id, token],
  });
  return { id, updatedAt: now };
}

export async function deleteCreation(id: string, token: string): Promise<boolean> {
  const existing = await getCreation(id, token);
  if (!existing) return false;
  const conn = await db();
  await conn.execute({
    sql: `DELETE FROM creations WHERE id = ? AND profile_token = ?`,
    args: [id, token],
  });
  return true;
}

export async function listCreations(token: string): Promise<CreationSummary[]> {
  const conn = await db();
  const rs = await conn.execute({
    sql: `SELECT id, name, type, updated_at FROM creations WHERE profile_token = ? ORDER BY updated_at DESC`,
    args: [token],
  });
  return rs.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    type: row.type as "mosaic" | "cover",
    updatedAt: Number(row.updated_at),
  }));
}

export async function getCreation(id: string, token: string): Promise<CreationDetail | null> {
  const conn = await db();
  const rs = await conn.execute({
    sql: `SELECT id, name, type, config, updated_at FROM creations WHERE id = ? AND profile_token = ?`,
    args: [id, token],
  });
  if (rs.rows.length === 0) return null;
  const row = rs.rows[0];
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as "mosaic" | "cover",
    config: JSON.parse(row.config as string),
    updatedAt: Number(row.updated_at),
  };
}

export interface CreationParamsError {
  message: string;
  status: 400 | 404;
}

/**
 * Resuelve `?token=&creation=<id>` (la "URL corta y estable" que arma
 * getCreationUrl() en el Editor) a los parámetros reales guardados para esa
 * creación. Usada por /api/render y /api/cover: sin esto, esa URL corta
 * nunca resolvía nada -- devolvía siempre 400 "Sin imágenes"/"Sin fondo"
 * porque ninguno de los dos endpoints leía `creation` (confirmado en vivo,
 * 2026-08-27: la URL copiada por el botón de "creaciones" siempre daba 400).
 * `token` se reinyecta en el resultado para que resolveTmdbKey/
 * resolveImageKitKey (que también leen `token` de los params) sigan
 * funcionando igual que si el caller hubiera mandado los parámetros a mano.
 * Sin `?creation=`, devuelve `params` tal cual (no-op).
 */
export async function resolveCreationParams(
  params: URLSearchParams
): Promise<{ params: URLSearchParams; error?: undefined } | { params?: undefined; error: CreationParamsError }> {
  const creationId = params.get("creation");
  if (!creationId) return { params };
  const token = params.get("token");
  if (!token) return { error: { message: "Falta token", status: 400 } };
  const creation = await getCreation(creationId, token);
  if (!creation) return { error: { message: "Creation not found", status: 404 } };
  const resolved = new URLSearchParams();
  for (const [k, v] of Object.entries(creation.config)) {
    if (typeof v === "string") resolved.append(k, v);
  }
  resolved.set("token", token);
  return { params: resolved };
}
