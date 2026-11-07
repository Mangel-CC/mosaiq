// Links cortos para URLs de /api/render y /api/cover. Algunos clientes
// (p. ej. Nuvio Legacy en TVs) descartan URLs de imagen de más de 511
// caracteres, y las de mosaiq llevan toda la configuración en la query.
// El id es un hash del destino: acortar la misma URL dos veces da el mismo link.

import { createHash } from "crypto";
import { db } from "@/lib/profile";

export const SHORT_TARGETS = ["/api/render", "/api/cover"] as const;
const MAX_TARGET_LENGTH = 16_384;
const ID_LENGTH = 10;
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function hashId(target: string): string {
  const digest = createHash("sha256").update(target).digest();
  let n = BigInt("0x" + digest.toString("hex"));
  let id = "";
  while (id.length < ID_LENGTH) {
    id += ALPHABET[Number(n % BigInt(62))];
    n /= BigInt(62);
  }
  return id;
}

// Normaliza a "path?query" (sin origen) y valida que apunte a un endpoint de imagen.
export function normalizeTarget(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input, "http://local");
  } catch {
    return null;
  }
  if (!(SHORT_TARGETS as readonly string[]).includes(url.pathname)) return null;
  if (!url.search) return null;
  const target = url.pathname + url.search;
  return target.length <= MAX_TARGET_LENGTH ? target : null;
}

export async function createShortLink(target: string): Promise<string> {
  const id = hashId(target);
  const client = await db();
  await client.execute({
    sql: "INSERT OR IGNORE INTO short_links (id, target, created_at) VALUES (?, ?, ?)",
    args: [id, target, Date.now()],
  });
  return id;
}

export async function getShortLink(id: string): Promise<string | null> {
  if (!/^[0-9A-Za-z]{1,32}$/.test(id)) return null;
  const client = await db();
  const res = await client.execute({ sql: "SELECT target FROM short_links WHERE id = ?", args: [id] });
  const target = res.rows[0]?.target;
  return typeof target === "string" ? target : null;
}
