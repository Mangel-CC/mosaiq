import { NextRequest, NextResponse } from "next/server";
import { hasTmdbKey, resolveTmdbKey, tmdbFetch } from "@/lib/tmdb";

// Logos de plataformas/estudios con fondo transparente (wordmarks):
//   /api/providers?q=netflix
// Usa /search/company de TMDB: sus logos de compañía son los wordmarks
// horizontales en PNG transparente, servidos desde el CDN de TMDB.
//
// Acepta ?token=/?tmdb_key= para usar una credencial personal (specs/
// 001-tmdb-byo-key) en vez de la compartida del servidor; en ese caso la
// caché en memoria de abajo se salta (research.md Decision 4).

export const runtime = "nodejs";

const cache = new Map<
  string,
  { at: number; items: { id: number; name: string; logo: string }[] }
>();
const TTL_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
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
  const q = (params.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  const bypassCache = resolved.source !== "server";
  const cacheKey = q.toLowerCase();
  if (!bypassCache) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json({ results: hit.items });
    }
  }

  try {
    const res = await tmdbFetch("/search/company", { query: q }, resolved);
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

    if (!bypassCache) cache.set(cacheKey, { at: Date.now(), items });
    return NextResponse.json({ results: items });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron buscar los logos" },
      { status: 502 }
    );
  }
}
