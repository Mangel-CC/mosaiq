import { NextRequest, NextResponse } from "next/server";
import { fetchTextlessArt, hasTmdbKey, resolveTmdbRef } from "@/lib/tmdb";

// Arte "textless" (sin título impreso) de un título:
//   /api/art?id=<tmdb id | tt... | tmdb:...>&media=movie|tv
// Devuelve { poster, backdrop } con paths de TMDB (o null si no hay).

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasTmdbKey()) {
    return NextResponse.json(
      { error: "Falta TMDB_API_KEY en .env.local" },
      { status: 500 }
    );
  }
  const p = req.nextUrl.searchParams;
  const id = p.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta ?id=" }, { status: 400 });
  }
  const media = p.get("media");
  const hint = media === "tv" ? "tv" : media === "movie" ? "movie" : undefined;
  const ref = await resolveTmdbRef(id, hint);
  if (!ref) {
    return NextResponse.json(
      { error: "No se pudo resolver el título en TMDB" },
      { status: 404 }
    );
  }
  const art = await fetchTextlessArt(ref.media, ref.id);
  return NextResponse.json(art, {
    headers: { "Cache-Control": "public, s-maxage=3600" },
  });
}
