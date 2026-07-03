// Resolución de catálogos Stremio/Nuvio. Muchos catálogos traen posters con
// etiquetas/insignias dibujadas encima; para obtener arte limpio se intenta
// resolver cada meta a su ficha de TMDB (vía id imdb "tt..." o "tmdb:...")
// y usar sus poster_path/backdrop_path. Si no se puede, se usa la imagen
// del propio catálogo como fallback.

import { hasTmdbKey, tmdbFetch } from "./tmdb";

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

async function resolveMeta(meta: StremioMeta): Promise<CatalogItem> {
  const fallback: CatalogItem = {
    id: meta.id ?? meta.name ?? "",
    title: meta.name ?? "",
    poster: meta.poster ?? null,
    backdrop: meta.background ?? meta.poster ?? null,
  };
  if (!hasTmdbKey()) return fallback;

  const mediaType = meta.type === "series" || meta.type === "tv" ? "tv" : "movie";
  try {
    let detail: { poster_path?: string; backdrop_path?: string } | null = null;

    const imdbId =
      meta.imdb_id ?? (meta.id?.startsWith("tt") ? meta.id : undefined);
    const tmdbId =
      meta.moviedb_id ??
      (meta.id?.startsWith("tmdb:") ? Number(meta.id.slice(5)) : undefined);

    if (tmdbId) {
      const res = await tmdbFetch(`/${mediaType}/${tmdbId}`);
      if (res.ok) detail = await res.json();
    } else if (imdbId) {
      const res = await tmdbFetch(`/find/${imdbId}`, {
        external_source: "imdb_id",
      });
      if (res.ok) {
        const data = await res.json();
        detail =
          data.movie_results?.[0] ??
          data.tv_results?.[0] ??
          null;
      }
    }

    if (detail && (detail.poster_path || detail.backdrop_path)) {
      return {
        ...fallback,
        poster: detail.poster_path ?? fallback.poster,
        backdrop: detail.backdrop_path ?? fallback.backdrop,
      };
    }
  } catch {
    // TMDB caído o meta sin id conocido: usamos las imágenes del catálogo
  }
  return fallback;
}

export async function resolveCatalog(
  catalogUrl: string,
  limit: number,
  exclude: string[] = []
): Promise<CatalogItem[]> {
  const cacheKey = `${catalogUrl}|${limit}|${[...exclude].sort().join(",")}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const res = await fetch(catalogUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
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

  const items = (
    await Promise.all(metas.slice(0, limit).map(resolveMeta))
  ).filter((it) => it.poster || it.backdrop);

  cache.set(cacheKey, { at: Date.now(), items });
  return items;
}

/**
 * Resuelve varios catálogos y los mezcla intercalados (round-robin), de
 * forma que en el mosaico se alternen los títulos de cada uno (p. ej.
 * top 10 películas + top 10 series). `limit` es por catálogo.
 */
export async function resolveCatalogs(
  catalogUrls: string[],
  limit: number,
  exclude: string[] = []
): Promise<CatalogItem[]> {
  const lists = await Promise.all(
    catalogUrls.map((u) => resolveCatalog(u, limit, exclude))
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
