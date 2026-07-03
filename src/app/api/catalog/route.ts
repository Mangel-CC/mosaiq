import { NextRequest, NextResponse } from "next/server";
import { resolveCatalogs } from "@/lib/catalog";

// Devuelve los items de uno o varios catálogos Stremio/Nuvio (repitiendo
// ?url=) ya resueltos a imágenes limpias de TMDB y mezclados intercalados,
// en el mismo formato que /api/search para que el editor pueda cargarlos
// en la colección y previsualizarlos.

export async function GET(req: NextRequest) {
  const urls = req.nextUrl.searchParams.getAll("url").filter(Boolean);
  if (urls.length === 0) {
    return NextResponse.json({ error: "Falta ?url=" }, { status: 400 });
  }
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit")) || 30,
    60
  );
  try {
    const items = await resolveCatalogs(urls, limit);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error leyendo catálogo" },
      { status: 502 }
    );
  }
}
