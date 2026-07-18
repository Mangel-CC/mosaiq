// Caché de renders vía CDN propio del llamador (ImageKit inicialmente). Ver
// specs/002-cdn-render-cache. Módulo framework-free (Constitution Principio
// IV): solo lo llaman src/app/api/render/route.ts y src/app/api/cover/route.ts.
//
// A diferencia de src/lib/tmdb.ts, aquí NO existe una credencial compartida
// del servidor: si ni ?token= ni ?imagekit_key= resuelven una key, la
// caché queda simplemente inactiva para esa request (FR-002) — no hay un
// tercer nivel "server" como en resolveTmdbKey.
//
// Todas las funciones de este módulo pueden lanzar (fallos de red, HTTP no-2xx
// de ImageKit, credencial inválida): es responsabilidad de quien las llama
// (los route handlers) envolverlas en try/catch para que un problema de CDN
// nunca rompa ni bloquee la respuesta del render (FR-011) — ver T022.

import { createHash } from "crypto";
import { getDecryptedCredential } from "./profile";
import type { CatalogItem } from "./catalog";

// ---- Resolución de credencial (research.md Decision 8) ----

export interface ImageKitKeyInput {
  /** Valor crudo de ?imagekit_key=, si viene en la request. */
  directKey?: string;
  /** Valor crudo de ?token=, si viene en la request. */
  token?: string;
}

export interface ResolvedImageKitKey {
  key: string;
  /** De dónde salió la key. Nunca "server": no hay CDN compartido del servidor. */
  source: "direct" | "token";
}

/**
 * Precedencia (data-model.md): directKey > token > ninguna.
 * Un token que no resuelve (o cuyo perfil no tiene ImageKit registrado) no
 * es un error — simplemente no hay credencial y la feature queda inactiva
 * para esta request (Edge Cases de spec.md).
 */
export async function resolveImageKitKey(
  params: ImageKitKeyInput
): Promise<ResolvedImageKitKey | null> {
  const direct = params.directKey?.trim();
  if (direct) return { key: direct, source: "direct" };

  const token = params.token?.trim();
  if (token) {
    try {
      const key = await getDecryptedCredential(token, "imagekit");
      if (key) return { key, source: "token" };
    } catch {
      // Token irresoluble (DB caída, formato raro, etc.): sin fallback de
      // servidor posible, esto simplemente equivale a "sin credencial".
    }
  }

  return null;
}

// ---- Cache key (research.md Decision 3) ----

const CREDENTIAL_PARAMS = new Set(["key", "token", "tmdb_key", "imagekit_key"]);

/**
 * SHA-256 (hex, truncado a 16 chars) de todos los parámetros de query que
 * afectan el resultado renderizado, normalizados (orden estable) y
 * excluyendo los parámetros de credencial — nunca deben afectar la cache
 * key (FR-005).
 */
export function computeConfigHash(searchParams: URLSearchParams): string {
  const entries: string[] = [];
  for (const [k, v] of searchParams.entries()) {
    if (CREDENTIAL_PARAMS.has(k)) continue;
    entries.push(`${k}=${v}`);
  }
  entries.sort();
  return createHash("sha256").update(entries.join("&")).digest("hex").slice(0, 16);
}

/**
 * "static" para requests puramente ?imgs= (sin fuente externa que revisar,
 * FR-006). Para ?catalog=, un hash del contenido actual del catálogo ya
 * resuelto (CatalogItem[]) — así la caché se invalida cuando el catálogo
 * realmente cambia, no por temporizador (FR-007).
 */
export function computeFreshnessToken(catalogItems?: CatalogItem[]): string {
  if (!catalogItems) return "static";
  const normalized = catalogItems
    .map((it) => `${it.id}|${it.title}|${it.poster ?? ""}|${it.backdrop ?? ""}`)
    .join(",");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

// ---- Wrappers REST de ImageKit (research.md Decisions 4, 6) ----
//
// Sin SDK: fetch directo con HTTP Basic Auth (key privada como usuario,
// password vacío). Las tres llamadas necesarias (upload, list/search,
// delete) son account-scoped solo por esa key; cada respuesta trae la
// `url` de entrega del archivo, usada directamente para el redirect.

const IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";
const IMAGEKIT_FILES_URL = "https://api.imagekit.io/v1/files";

/** Ubicación dedicada dentro de la cuenta del llamador (FR-010). */
export const CACHE_FOLDER = "mosaiq-cache";

function authHeader(key: string): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` };
}

export interface ImageKitFile {
  fileId: string;
  name: string;
  url: string;
}

export async function uploadFile(
  key: string,
  fileName: string,
  buffer: Buffer
): Promise<ImageKitFile> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "image/png" }), fileName);
  form.append("fileName", fileName);
  form.append("folder", `/${CACHE_FOLDER}`);
  // Decision 5: sobrescribir en vez de acumular duplicados con sufijo random.
  form.append("useUniqueFileName", "false");

  const res = await fetch(IMAGEKIT_UPLOAD_URL, {
    method: "POST",
    headers: authHeader(key),
    body: form,
  });
  if (!res.ok) {
    throw new Error(`ImageKit upload falló (${res.status})`);
  }
  const data = (await res.json()) as { fileId: string; name: string; url: string };
  return { fileId: data.fileId, name: data.name, url: data.url };
}

export async function listFilesByPrefix(
  key: string,
  prefix: string
): Promise<ImageKitFile[]> {
  const url = new URL(IMAGEKIT_FILES_URL);
  url.searchParams.set("path", `/${CACHE_FOLDER}`);
  url.searchParams.set("limit", "100");
  // El wildcard `*` de ImageKit resultó no ser fiable en pruebas contra una
  // cuenta real (con o sin comillas, con o sin escapar como %2A, a veces
  // devuelve 0 resultados o un 400 "name field must be string"). El
  // operador `:` ya hace un match tipo "contains" sin necesidad de `*` — se
  // usa así, y el filtro `.startsWith(prefix)` de abajo se encarga de
  // acotar a coincidencias reales de prefijo (ImageKit no distingue
  // contains de starts-with).
  url.searchParams.set("searchQuery", `name : "${prefix}"`);

  const res = await fetch(url, { headers: authHeader(key) });
  if (!res.ok) {
    throw new Error(`ImageKit list falló (${res.status})`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (f): f is { fileId: string; name: string; url: string } =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as Record<string, unknown>).fileId === "string" &&
        typeof (f as Record<string, unknown>).name === "string" &&
        typeof (f as Record<string, unknown>).url === "string"
    )
    // El searchQuery de ImageKit es un "starts with" de mejor esfuerzo;
    // filtramos de nuevo aquí para quedarnos solo con coincidencias reales.
    .filter((f) => f.name.startsWith(prefix))
    .map((f) => ({ fileId: f.fileId, name: f.name, url: f.url }));
}

export async function deleteFile(key: string, fileId: string): Promise<void> {
  const res = await fetch(`${IMAGEKIT_FILES_URL}/${fileId}`, {
    method: "DELETE",
    headers: authHeader(key),
  });
  // 404 = ya no existe (p. ej. borrado por una request concurrente): no es
  // un fallo real para nuestros propósitos de limpieza.
  if (!res.ok && res.status !== 404) {
    throw new Error(`ImageKit delete falló (${res.status})`);
  }
}

// ---- Lookup / guardado de alto nivel (Decisions 3, 5) ----

/**
 * Busca `mosaiq-cache/{configHash}--{freshnessToken}.png`. Solo hay hit si
 * existe un archivo con el freshnessToken EXACTO actual — un archivo con el
 * mismo configHash pero un freshnessToken distinto es la entrada obsoleta
 * (se limpia en saveToCache, no aquí).
 */
export async function tryServeCached(
  configHash: string,
  freshnessToken: string,
  resolved: ResolvedImageKitKey
): Promise<{ url: string } | null> {
  const prefix = `${configHash}--`;
  const files = await listFilesByPrefix(resolved.key, prefix);
  const match = files.find((f) => f.name === `${prefix}${freshnessToken}.png`);
  return match ? { url: match.url } : null;
}

/**
 * Sube el PNG bajo el nombre determinístico y luego borra cualquier otro
 * archivo con el mismo configHash pero un freshnessToken distinto, para que
 * solo quede una versión por configuración (FR-008, "replace, don't
 * accumulate").
 */
export async function saveToCache(
  configHash: string,
  freshnessToken: string,
  imageBuffer: Buffer,
  resolved: ResolvedImageKitKey
): Promise<void> {
  const fileName = `${configHash}--${freshnessToken}.png`;
  await uploadFile(resolved.key, fileName, imageBuffer);

  const prefix = `${configHash}--`;
  const files = await listFilesByPrefix(resolved.key, prefix);
  const stale = files.filter((f) => f.name !== fileName);
  await Promise.all(stale.map((f) => deleteFile(resolved.key, f.fileId)));
}
