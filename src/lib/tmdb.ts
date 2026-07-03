// Helpers de TMDB para el servidor. La key nunca se expone al cliente.

export const TMDB_BASE = "https://api.themoviedb.org/3";

export function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const key = process.env.TMDB_API_KEY ?? "";
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: HeadersInit = {};
  // Los tokens v4 (JWT) empiezan por "ey" y van como Bearer; las keys v3
  // van como query param.
  if (key.startsWith("ey")) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);
  return fetch(url, { headers });
}

export function hasTmdbKey(): boolean {
  return Boolean(process.env.TMDB_API_KEY);
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
  id: number
): Promise<ArtPaths> {
  const res = await tmdbFetch(`/${media}/${id}/images`, {
    include_image_language: "null",
  });
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
  hint?: "movie" | "tv"
): Promise<{ media: "movie" | "tv"; id: number } | null> {
  if (/^\d+$/.test(raw)) return { media: hint ?? "movie", id: Number(raw) };
  if (raw.startsWith("tmdb:"))
    return { media: hint ?? "movie", id: Number(raw.slice(5)) };
  if (raw.startsWith("tt")) {
    const res = await tmdbFetch(`/find/${raw}`, {
      external_source: "imdb_id",
    });
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
