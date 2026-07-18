// Helpers de TMDB para el servidor. La key nunca se expone al cliente.

import { getDecryptedCredential } from "./profile";

export const TMDB_BASE = "https://api.themoviedb.org/3";

// ---- Resolución de credencial (specs/001-tmdb-byo-key) ----
//
// Cada request puede traer su propia key de TMDB en vez de usar la
// compartida del servidor: directamente vía ?tmdb_key= o indirectamente
// vía ?token= (resuelto a través del perfil de specs/003-user-profiles).
// `resolveTmdbKey` centraliza esa precedencia; el resto de este módulo (y
// lib/catalog.ts) recibe siempre el resultado ya resuelto, nunca vuelve a
// leer process.env.TMDB_API_KEY directamente.

export interface TmdbKeyInput {
  /** Valor crudo de ?tmdb_key=, si viene en la request. */
  directKey?: string;
  /** Valor crudo de ?token=, si viene en la request. */
  token?: string;
}

export interface ResolvedTmdbKey {
  key: string;
  /** De dónde salió la key: usado para decidir si se puede usar la caché
   *  compartida en memoria (solo "server" participa de ella). */
  source: "direct" | "token" | "server";
}

function serverResolved(): ResolvedTmdbKey {
  return { key: process.env.TMDB_API_KEY ?? "", source: "server" };
}

/**
 * Un `token`/`tmdb_key` resuelto (no el del servidor) que TMDB rechaza
 * (401/403) debe fallar de forma visible en vez de degradar en silencio a
 * "no encontrado" — contracts/tmdb-key-param.md: "Resolved credential...
 * rejected by TMDB: TMDB's error surfaced to the caller; no fallback
 * attempted". La key del servidor mantiene el comportamiento previo a esta
 * feature (no se toca aquí).
 */
export class TmdbCredentialRejectedError extends Error {
  constructor(status: number) {
    super(`TMDB rechazó la credencial (${status})`);
    this.name = "TmdbCredentialRejectedError";
  }
}

export function assertCredentialAccepted(
  res: Response,
  resolved: ResolvedTmdbKey
): void {
  if (
    resolved.source !== "server" &&
    (res.status === 401 || res.status === 403)
  ) {
    throw new TmdbCredentialRejectedError(res.status);
  }
}

/**
 * Precedencia (data-model.md): directKey > token > server.
 * Un token que no resuelve (o cuyo perfil no tiene TMDB registrado) no es
 * un error aquí — cae abierto a la key del servidor. Solo una credencial
 * ya resuelta (directa o vía token) que TMDB rechace debe fallar de forma
 * visible; ver el uso de este resultado en los routes.
 */
export async function resolveTmdbKey(
  params: TmdbKeyInput
): Promise<ResolvedTmdbKey> {
  const direct = params.directKey?.trim();
  if (direct) return { key: direct, source: "direct" };

  const token = params.token?.trim();
  if (token) {
    try {
      const key = await getDecryptedCredential(token, "tmdb");
      if (key) return { key, source: "token" };
    } catch {
      // Token irresoluble (DB caída, formato raro, etc.): falla abierto a
      // la key del servidor en vez de romper una request no relacionada.
    }
  }

  return serverResolved();
}

export function tmdbFetch(
  path: string,
  params: Record<string, string> = {},
  resolved: ResolvedTmdbKey = serverResolved()
) {
  const key = resolved.key;
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: HeadersInit = {};
  // Los tokens v4 (JWT) empiezan por "ey" y van como Bearer; las keys v3
  // van como query param.
  if (key.startsWith("ey")) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);
  return fetch(url, { headers });
}

export function hasTmdbKey(resolved: ResolvedTmdbKey = serverResolved()): boolean {
  return Boolean(resolved.key);
}

export interface ArtPaths {
  poster: string | null;
  backdrop: string | null;
}

/**
 * Arte "textless" (sin título impreso): imágenes con idioma `null` del
 * endpoint /images de TMDB. Los backdrops sin idioma no llevan logo/título
 * y los posters sin idioma son los "clean" de la ficha.
 */
export async function fetchTextlessArt(
  media: "movie" | "tv",
  id: number,
  keyInput: TmdbKeyInput = {}
): Promise<ArtPaths> {
  const resolved = await resolveTmdbKey(keyInput);
  const res = await tmdbFetch(
    `/${media}/${id}/images`,
    { include_image_language: "null" },
    resolved
  );
  assertCredentialAccepted(res, resolved);
  if (!res.ok) return { poster: null, backdrop: null };
  const data: {
    posters?: { file_path: string }[];
    backdrops?: { file_path: string }[];
  } = await res.json();
  // TMDB los devuelve ordenados por votos: el primero es el mejor
  const pick = (arr?: { file_path: string }[]) => arr?.[0]?.file_path ?? null;
  return { poster: pick(data.posters), backdrop: pick(data.backdrops) };
}

/**
 * Resuelve un id arbitrario ("tt..." de imdb, "tmdb:123" o "123") a la
 * referencia de TMDB { media, id }.
 */
export async function resolveTmdbRef(
  raw: string,
  hint?: "movie" | "tv",
  keyInput: TmdbKeyInput = {}
): Promise<{ media: "movie" | "tv"; id: number } | null> {
  if (/^\d+$/.test(raw)) return { media: hint ?? "movie", id: Number(raw) };
  if (raw.startsWith("tmdb:"))
    return { media: hint ?? "movie", id: Number(raw.slice(5)) };
  if (raw.startsWith("tt")) {
    const resolved = await resolveTmdbKey(keyInput);
    const res = await tmdbFetch(
      `/find/${raw}`,
      { external_source: "imdb_id" },
      resolved
    );
    assertCredentialAccepted(res, resolved);
    if (!res.ok) return null;
    const data: {
      movie_results?: { id: number }[];
      tv_results?: { id: number }[];
    } = await res.json();
    if (data.movie_results?.[0])
      return { media: "movie", id: data.movie_results[0].id };
    if (data.tv_results?.[0])
      return { media: "tv", id: data.tv_results[0].id };
  }
  return null;
}
