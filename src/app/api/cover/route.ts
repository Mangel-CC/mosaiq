import { NextRequest, NextResponse } from "next/server";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import { coverConfigFromParams, renderCover } from "@/lib/cover";
import { resolveCatalogs } from "@/lib/catalog";
import { fetchTextlessArt, resolveTmdbRef } from "@/lib/tmdb";
import { registerServerFonts } from "@/lib/serverFonts";

// Registra las fuentes empaquetadas al cargar el módulo del route
registerServerFonts();

// Genera la portada como PNG en el servidor. Fondo:
//   ?catalog=<url>&pick=1&type=poster|backdrop → título nº `pick` del top
//     (dinámico: si el top cambia, la portada cambia)
//   ?img=<path tmdb o URL>                     → imagen fija
// Logo opcional: ?logo=<URL de un PNG accesible públicamente>

export const runtime = "nodejs";

function tmdbImageUrl(path: string, type: "poster" | "backdrop"): string {
  const size = type === "poster" ? "w780" : "w1280";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

async function fetchImage(url: string): Promise<Image> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return loadImage(Buffer.from(await res.arrayBuffer()));
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const cfg = coverConfigFromParams(params);
  const type = params.get("type") === "backdrop" ? "backdrop" : "poster";
  // Credencial TMDB personal opcional (specs/001-tmdb-byo-key): ?token= o
  // ?tmdb_key=, en vez de la key compartida del servidor.
  const keyInput = {
    directKey: params.get("tmdb_key") ?? undefined,
    token: params.get("token") ?? undefined,
  };

  // ?notext=1 → intenta usar arte "textless" (sin título impreso) de TMDB
  const noText = params.get("notext") === "1";
  const idParam = params.get("id");
  const mediaParam = params.get("media");
  const mediaHint =
    mediaParam === "tv" ? "tv" : mediaParam === "movie" ? "movie" : undefined;

  const textlessPath = async (
    raw: string,
    hint?: "movie" | "tv"
  ): Promise<string | null> => {
    const ref = await resolveTmdbRef(raw, hint, keyInput);
    if (!ref) return null;
    const art = await fetchTextlessArt(ref.media, ref.id, keyInput);
    return type === "backdrop"
      ? art.backdrop ?? art.poster
      : art.poster ?? art.backdrop;
  };

  let bgUrl: string | null = null;
  try {
    const catalogs = params.getAll("catalog").filter(Boolean);
    const img = params.get("img");
    if (img) {
      let path: string | null = null;
      if (noText && idParam) path = await textlessPath(idParam, mediaHint);
      const chosen = path ?? img;
      bgUrl = chosen.startsWith("/") ? tmdbImageUrl(chosen, type) : chosen;
    } else if (catalogs.length > 0) {
      const pick = Math.max(1, Number(params.get("pick")) || 1);
      const items = await resolveCatalogs(catalogs, pick + 5, [], keyInput);
      const item = items[pick - 1];
      if (!item) throw new Error(`El catálogo no tiene ${pick} títulos`);
      let path =
        type === "backdrop"
          ? item.backdrop ?? item.poster
          : item.poster ?? item.backdrop;
      if (noText && item.id) path = (await textlessPath(item.id)) ?? path;
      if (!path) throw new Error("El título elegido no tiene imagen");
      bgUrl = path.startsWith("/") ? tmdbImageUrl(path, type) : path;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error leyendo fuente" },
      { status: 502 }
    );
  }

  if (!bgUrl) {
    return NextResponse.json(
      { error: "Sin fondo: usa ?img= o ?catalog= (+ ?pick=)" },
      { status: 400 }
    );
  }

  try {
    const bg = await fetchImage(bgUrl);
    const logoUrl = params.get("logo");
    const logo = logoUrl ? await fetchImage(logoUrl) : null;

    const canvas = createCanvas(cfg.width, cfg.height);
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    renderCover(
      ctx,
      bg as unknown as { width: number; height: number },
      logo as unknown as { width: number; height: number } | null,
      cfg
    );

    const png = canvas.toBuffer("image/png");
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando portada" },
      { status: 502 }
    );
  }
}
