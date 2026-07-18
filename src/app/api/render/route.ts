import { NextRequest, NextResponse } from "next/server";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import { configFromParams, renderMosaic } from "@/lib/mosaic";
import { resolveCatalogs } from "@/lib/catalog";

// Genera el mosaico como PNG en el servidor con el mismo motor que usa el
// editor. Dos fuentes de imágenes:
//   ?imgs=/ruta1,/ruta2   → paths de TMDB (o URLs absolutas codificadas)
//   ?catalog=<url>        → catálogo formato Stremio/Nuvio ({ metas: [...] })
// El modo catálogo se resuelve en cada petición, así el fondo se actualiza
// solo cuando el catálogo cambia.

export const runtime = "nodejs";

const MAX_IMAGES = 60;

function tmdbImageUrl(path: string, type: "poster" | "backdrop"): string {
  const size = type === "poster" ? "w500" : "w1280";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

async function urlsFromCatalogs(
  catalogUrls: string[],
  type: "poster" | "backdrop",
  limit: number,
  exclude: string[],
  keyInput: { directKey?: string; token?: string }
): Promise<string[]> {
  // resolveCatalogs intenta obtener arte limpio de TMDB (sin etiquetas
  // superpuestas), mezcla los catálogos intercalados y devuelve paths de
  // TMDB o URLs absolutas de fallback.
  const items = await resolveCatalogs(catalogUrls, limit, exclude, keyInput);
  return items
    .map((it) => (type === "backdrop" ? it.backdrop || it.poster : it.poster || it.backdrop))
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .map((u) => (u.startsWith("/") ? tmdbImageUrl(u, type) : u));
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const cfg = configFromParams(params);
  // Credencial TMDB personal opcional (specs/001-tmdb-byo-key): ?token= o
  // ?tmdb_key=, en vez de la key compartida del servidor.
  const keyInput = {
    directKey: params.get("tmdb_key") ?? undefined,
    token: params.get("token") ?? undefined,
  };

  // catalog e imgs se pueden combinar: catálogo dinámico + títulos
  // añadidos a mano en el editor.
  let urls: string[] = [];
  try {
    // Se admiten varios ?catalog= (se mezclan intercalados)
    const catalogs = params.getAll("catalog").filter(Boolean);
    if (catalogs.length > 0) {
      const limit = Math.min(
        Number(params.get("limit")) || MAX_IMAGES,
        MAX_IMAGES
      );
      const exclude = (params.get("exclude") ?? "")
        .split(",")
        .filter(Boolean);
      urls = await urlsFromCatalogs(
        catalogs,
        cfg.imageType,
        limit,
        exclude,
        keyInput
      );
    }
    const imgs = params.get("imgs");
    if (imgs) {
      urls = urls.concat(
        imgs
          .split(",")
          .filter(Boolean)
          .map((p) => (p.startsWith("/") ? tmdbImageUrl(p, cfg.imageType) : p))
      );
    }
    urls = urls.slice(0, MAX_IMAGES);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error leyendo fuente" },
      { status: 502 }
    );
  }

  if (urls.length === 0) {
    return NextResponse.json(
      { error: "Sin imágenes: usa ?imgs= o ?catalog=" },
      { status: 400 }
    );
  }

  const loaded = await Promise.allSettled(
    urls.map(async (u) => {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`${res.status}`);
      return loadImage(Buffer.from(await res.arrayBuffer()));
    })
  );
  const images = loaded
    .filter((r): r is PromiseFulfilledResult<Image> => r.status === "fulfilled")
    .map((r) => r.value);

  if (images.length === 0) {
    return NextResponse.json(
      { error: "No se pudo cargar ninguna imagen" },
      { status: 502 }
    );
  }

  const canvas = createCanvas(cfg.width, cfg.height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  renderMosaic(
    ctx,
    images as unknown as { width: number; height: number }[],
    cfg
  );

  const png = canvas.toBuffer("image/png");
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Cache corto en CDN para que los catálogos se refresquen pronto
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
