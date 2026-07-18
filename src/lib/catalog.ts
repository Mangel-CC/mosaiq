// Resolución de catálogos Stremio/Nuvio. Muchos catálogos traen posters con
// etiquetas/insignias dibujadas encima; para obtener arte limpio se intenta
// resolver cada meta a su ficha de TMDB (vía id imdb "tt..." o "tmdb:...")
// y usar sus poster_path/backdrop_path. Si no se puede, se usa la imagen
// del propio catálogo como fallback.

import {
  assertCredentialAccepted,
  hasTmdbKey,
  resolveTmdbKey,
  tmdbFetch,
  ResolvedTmdbKey,
  TmdbCredentialRejectedError,
  TmdbKeyInput,
} from "./tmdb";

export interface CatalogItem {
  id: string;
  title: string;
  /** Path de TMDB ("/abc.jpg") o URL absoluta de fallback */
  poster: string | null;
  backdrop: string | null;
}

interface StremioMeta {
  id?: string;
  imdb_id?: string;
  moviedb_id?: number;
  type?: string;
  name?: string;
  poster?: string;
  background?: string;
}

// Caché en memoria para no repetir N llamadas a TMDB en cada render/preview
const cache = new Map<string, { at: number; items: CatalogItem[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveMeta(
  meta: StremioMeta,
  resolved: ResolvedTmdbKey
): Promise<CatalogItem> {
  const fallback: CatalogItem = {
    id: meta.id ?? meta.name ?? "",
    title: meta.name ?? "",
    poster: meta.poster ?? null,
    backdrop: meta.background ?? meta.poster ?? null,
  };
  if (!hasTmdbKey(resolved)) return fallback;

  const mediaType = meta.type === "series" || meta.type === "tv" ? "tv" : "movie";
  try {
    let detail: { poster_path?: string; backdrop_path?: string } | null = null;

    const imdbId =
      meta.imdb_id ?? (meta.id?.startsWith("tt") ? meta.id : undefined);
    const tmdbId =
      meta.moviedb_id ??
      (meta.id?.startsWith("tmdb:") ? Number(meta.id.slice(5)) : undefined);

    if (tmdbId) {
      const res = await tmdbFetch(`/${mediaType}/${tmdbId}`, {}, resolved);
      assertCredentialAccepted(res, resolved);
      if (res.ok) detail = await res.json();
    } else if (imdbId) {
      const res = await tmdbFetch(
        `/find/${imdbId}`,
        { external_source: "imdb_id" },
        resolved
      );
      assertCredentialAccepted(res, resolved);
      if (res.ok) {
        const data = await res.json();
        detail =
          data.movie_results?.[0] ??
          data.tv_results?.[0] ??
          null;
      }
    } else if (meta.name) {
      // Si no hay ID, intentar buscar por nombre
      const res = await tmdbFetch(
        "/search/" + mediaType,
        { query: meta.name },
        resolved
      );
      assertCredentialAccepted(res, resolved);
      if (res.ok) {
        const data = await res.json();
        detail = data.results?.[0] ?? null;
      }
    }

    if (detail && (detail.poster_path || detail.backdrop_path)) {
      return {
        ...fallback,
        poster: detail.poster_path ?? fallback.poster,
        backdrop: detail.backdrop_path ?? fallback.backdrop,
      };
    }
  } catch (err) {
    // Una credencial personal rechazada por TMDB debe fallar de forma
    // visible (contracts/tmdb-key-param.md), no degradar en silencio a las
    // imágenes del catálogo como el resto de fallos (TMDB caído, meta sin
    // id conocido, etc.)
    if (err instanceof TmdbCredentialRejectedError) throw err;
  }
  return fallback;
}

async function resolveCatalogWithKey(
  catalogUrl: string,
  limit: number,
  exclude: string[],
  resolved: ResolvedTmdbKey
): Promise<CatalogItem[]> {
  // Solo las requests resueltas con la key compartida del servidor
  // participan de esta caché: una request con credencial propia (directa o
  // vía token) no debe leer ni escribir resultados resueltos con la key de
  // otro (research.md Decision 4).
  const bypassCache = resolved.source !== "server";
  const cacheKey = `${catalogUrl}|${limit}|${[...exclude].sort().join(",")}`;
  if (!bypassCache) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  }

  // Timeout de 10s para descargar el catálogo
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let res: Response;
  try {
    res = await fetch(catalogUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`El catálogo respondió ${res.status}`);
  let data: { metas?: StremioMeta[]; items?: StremioMeta[] };
  try {
    data = await res.json();
  } catch {
    throw new Error(
      "La URL no devolvió JSON de catálogo (¿seguro que es la URL del catálogo y no de una imagen?)"
    );
  }
  const excludeSet = new Set(exclude);
  const metas: StremioMeta[] = (data.metas ?? data.items ?? []).filter(
    (m) => !excludeSet.has(m.id ?? "")
  );

  // Procesar máximo 5 items en paralelo para no sobrecargar TMDB
  const itemsToResolve = metas.slice(0, limit);
  const items: CatalogItem[] = [];
  for (let i = 0; i < itemsToResolve.length; i += 5) {
    const batch = itemsToResolve.slice(i, i + 5);
    const batchItems = await Promise.all(
      batch.map((m) => resolveMeta(m, resolved))
    );
    items.push(...batchItems.filter((it) => it.poster || it.backdrop));
  }

  if (!bypassCache) cache.set(cacheKey, { at: Date.now(), items });
  return items;
}

export async function resolveCatalog(
  catalogUrl: string,
  limit: number,
  exclude: string[] = [],
  keyInput: TmdbKeyInput = {}
): Promise<CatalogItem[]> {
  const resolved = await resolveTmdbKey(keyInput);
  return resolveCatalogWithKey(catalogUrl, limit, exclude, resolved);
}

/**
 * Resuelve varios catálogos y los mezcla intercalados (round-robin), de
 * forma que en el mosaico se alternen los títulos de cada uno (p. ej.
 * top 10 películas + top 10 series). `limit` es por catálogo.
 */
export async function resolveCatalogs(
  catalogUrls: string[],
  limit: number,
  exclude: string[] = [],
  keyInput: TmdbKeyInput = {}
): Promise<CatalogItem[]> {
  const resolved = await resolveTmdbKey(keyInput);
  const lists = await Promise.all(
    catalogUrls.map((u) => resolveCatalogWithKey(u, limit, exclude, resolved))
  );
  const merged: CatalogItem[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (i < list.length) merged.push(list[i]);
    }
  }
  // Un mismo título puede venir en varios catálogos
  const seen = new Set<string>();
  return merged.filter((it) => {
    const key = it.id || `${it.poster}|${it.backdrop}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
