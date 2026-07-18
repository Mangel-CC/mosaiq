import { NextRequest, NextResponse } from "next/server";
import { hasTmdbKey, resolveTmdbKey, tmdbFetch } from "@/lib/tmdb";

// Proxy de búsqueda de TMDB: la API key se queda en el servidor.
//
// Acepta ?token= (perfil de specs/003-user-profiles) o ?tmdb_key= (key
// directa) para usar una credencial personal en vez de la compartida del
// servidor — ver specs/001-tmdb-byo-key.

export interface SearchItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string;
  poster: string | null;
  backdrop: string | null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const resolved = await resolveTmdbKey({
    directKey: params.get("tmdb_key") ?? undefined,
    token: params.get("token") ?? undefined,
  });
  if (!hasTmdbKey(resolved)) {
    return NextResponse.json(
      { error: "Falta TMDB_API_KEY en .env.local" },
      { status: 500 }
    );
  }

  const res = await tmdbFetch(
    "/search/multi",
    { query: q, include_adult: "false" },
    resolved
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `TMDB respondió ${res.status}` },
      { status: 502 }
    );
  }
  const data = await res.json();

  const results: SearchItem[] = (data.results ?? [])
    .filter(
      (r: Record<string, unknown>) =>
        (r.media_type === "movie" || r.media_type === "tv") &&
        (r.poster_path || r.backdrop_path)
    )
    .map((r: Record<string, unknown>) => ({
      id: r.id as number,
      mediaType: r.media_type as "movie" | "tv",
      title: (r.title ?? r.name ?? "") as string,
      year: String(r.release_date ?? r.first_air_date ?? "").slice(0, 4),
      poster: (r.poster_path ?? null) as string | null,
      backdrop: (r.backdrop_path ?? null) as string | null,
    }));

  return NextResponse.json({ results });
}
