import { NextRequest, NextResponse } from "next/server";
import {
  fetchTextlessArt,
  hasTmdbKey,
  resolveTmdbKey,
  resolveTmdbRef,
} from "@/lib/tmdb";

// Arte "textless" (sin título impreso) de un título:
//   /api/art?id=<tmdb id | tt... | tmdb:...>&media=movie|tv
// Devuelve { poster, backdrop } con paths de TMDB (o null si no hay).
//
// Acepta ?token=/?tmdb_key= para usar una credencial personal (specs/
// 001-tmdb-byo-key) en vez de la compartida del servidor.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const keyInput = {
    directKey: p.get("tmdb_key") ?? undefined,
    token: p.get("token") ?? undefined,
  };
  const resolved = await resolveTmdbKey(keyInput);
  if (!hasTmdbKey(resolved)) {
    return NextResponse.json(
      { error: "Falta TMDB_API_KEY en .env.local" },
      { status: 500 }
    );
  }
  const id = p.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta ?id=" }, { status: 400 });
  }
  const media = p.get("media");
  const hint = media === "tv" ? "tv" : media === "movie" ? "movie" : undefined;
  try {
    const ref = await resolveTmdbRef(id, hint, keyInput);
    if (!ref) {
      return NextResponse.json(
        { error: "No se pudo resolver el título en TMDB" },
        { status: 404 }
      );
    }
    const art = await fetchTextlessArt(ref.media, ref.id, keyInput);
    return NextResponse.json(art, {
      headers: { "Cache-Control": "public, s-maxage=3600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error consultando TMDB" },
      { status: 502 }
    );
  }
}
