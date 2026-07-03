import { NextRequest, NextResponse } from "next/server";
import { hasTmdbKey, tmdbFetch } from "@/lib/tmdb";

// Logos de plataformas/estudios con fondo transparente (wordmarks):
//   /api/providers?q=netflix
// Usa /search/company de TMDB: sus logos de compañía son los wordmarks
// horizontales en PNG transparente, servidos desde el CDN de TMDB.

export const runtime = "nodejs";

const cache = new Map<
  string,
  { at: number; items: { id: number; name: string; logo: string }[] }
>();
const TTL_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  if (!hasTmdbKey()) {
    return NextResponse.json(
      { error: "Falta TMDB_API_KEY en .env.local" },
      { status: 500 }
    );
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ results: hit.items });
  }

  try {
    const res = await tmdbFetch("/search/company", { query: q });
    if (!res.ok) throw new Error(`TMDB respondió ${res.status}`);
    const data: {
      results?: {
        id: number;
        name: string;
        logo_path: string | null;
      }[];
    } = await res.json();

    // Solo compañías con logo; se deduplica por logo (el mismo wordmark
    // aparece en varias filiales por país)
    const seenLogos = new Set<string>();
    const items = (data.results ?? [])
      .filter((c) => {
        if (!c.logo_path || seenLogos.has(c.logo_path)) return false;
        seenLogos.add(c.logo_path);
        return true;
      })
      .slice(0, 12)
      .map((c) => ({
        id: c.id,
        name: c.name,
        logo: `https://image.tmdb.org/t/p/w500${c.logo_path}`,
      }));

    cache.set(key, { at: Date.now(), items });
    return NextResponse.json({ results: items });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron buscar los logos" },
      { status: 502 }
    );
  }
}
