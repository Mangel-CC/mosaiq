import { NextRequest, NextResponse } from "next/server";

// Proxy de búsqueda de TMDB: la API key se queda en el servidor.

const TMDB_BASE = "https://api.themoviedb.org/3";

function tmdbAuth(url: URL): HeadersInit {
  const key = process.env.TMDB_API_KEY ?? "";
  // Los tokens v4 (JWT) empiezan por "ey" y van como Bearer; las keys v3
  // van como query param.
  if (key.startsWith("ey")) return { Authorization: `Bearer ${key}` };
  url.searchParams.set("api_key", key);
  return {};
}

export interface SearchItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string;
  poster: string | null;
  backdrop: string | null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });
  if (!process.env.TMDB_API_KEY) {
    return NextResponse.json(
      { error: "Falta TMDB_API_KEY en .env.local" },
      { status: 500 }
    );
  }

  const url = new URL(`${TMDB_BASE}/search/multi`);
  url.searchParams.set("query", q);
  url.searchParams.set("include_adult", "false");
  const headers = tmdbAuth(url);

  const res = await fetch(url, { headers });
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
