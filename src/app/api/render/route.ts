import { NextRequest, NextResponse, after } from "next/server";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import { configFromParams, renderMosaic } from "@/lib/mosaic";
import { resolveCatalogs, CatalogItem } from "@/lib/catalog";
import { resolveCreationParams } from "@/lib/profile";
import {
  computeConfigHash,
  computeFreshnessToken,
  resolveImageKitKey,
  ResolvedImageKitKey,
  saveToCache,
  tryServeCached,
} from "@/lib/cdnCache";

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

function urlsFromCatalogItems(
  items: CatalogItem[],
  type: "poster" | "backdrop"
): string[] {
  return items
    .map((it) => (type === "backdrop" ? it.backdrop || it.poster : it.poster || it.backdrop))
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .map((u) => (u.startsWith("/") ? tmdbImageUrl(u, type) : u));
}

export async function GET(req: NextRequest) {
  // ?creation=<id> (+ ?token=): URL corta guardada desde el Editor -- se
  // resuelve a los parámetros reales ANTES de leer nada más (ver
  // resolveCreationParams).
  const resolvedCreation = await resolveCreationParams(req.nextUrl.searchParams);
  if (resolvedCreation.error) {
    return NextResponse.json(
      { error: resolvedCreation.error.message },
      { status: resolvedCreation.error.status }
    );
  }
  const params = resolvedCreation.params;
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
  // Items ya resueltos del/de los catálogo(s) (specs/002-cdn-render-cache):
  // se necesitan aparte de `urls` para poder hashear el contenido actual del
  // catálogo como freshnessToken (FR-007). `hasCatalog` distingue "hubo
  // ?catalog=" de "catalogItems sigue vacío porque no hubo catálogo" — solo
  // en el primer caso el freshnessToken deja de ser la constante "static".
  let catalogItems: CatalogItem[] = [];
  let hasCatalog = false;
  try {
    // Se admiten varios ?catalog= (se mezclan intercalados)
    const catalogs = params.getAll("catalog").filter(Boolean);
    hasCatalog = catalogs.length > 0;
    if (hasCatalog) {
      const limit = Math.min(
        Number(params.get("limit")) || MAX_IMAGES,
        MAX_IMAGES
      );
      const exclude = (params.get("exclude") ?? "")
        .split(",")
        .filter(Boolean);
      // resolveCatalogs intenta obtener arte limpio de TMDB (sin etiquetas
      // superpuestas), mezcla los catálogos intercalados y devuelve paths de
      // TMDB o URLs absolutas de fallback.
      catalogItems = await resolveCatalogs(catalogs, limit, exclude, keyInput);
      urls = urlsFromCatalogItems(catalogItems, cfg.imageType);
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

  // ---- Caché de renders vía CDN propio (specs/002-cdn-render-cache) ----
  // Opcional: si ?token= o ?imagekit_key= resuelven una credencial de
  // ImageKit, se comprueba si ya existe un asset cacheado para esta
  // configuración exacta (+ contenido actual del catálogo, si aplica) antes
  // de pagar el costo del render. Cualquier fallo de esta capa (credencial
  // inválida, red caída, respuesta no-2xx de ImageKit) se traga aquí mismo:
  // nunca debe romper ni bloquear la respuesta del render (FR-011).
  let cdnKey: ResolvedImageKitKey | null = null;
  let cacheConfigHash: string | null = null;
  let cacheFreshnessToken: string | null = null;
  try {
    cdnKey = await resolveImageKitKey({
      directKey: params.get("imagekit_key") ?? undefined,
      token: params.get("token") ?? undefined,
    });
    if (cdnKey) {
      cacheConfigHash = computeConfigHash(params);
      cacheFreshnessToken = computeFreshnessToken(hasCatalog ? catalogItems : undefined);
      const hit = await tryServeCached(cacheConfigHash, cacheFreshnessToken, cdnKey);
      if (hit) {
        return NextResponse.redirect(hit.url, 302);
      }
    }
  } catch (err) {
    console.error("[cdnCache] Fallo comprobando caché de /api/render:", err);
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

  if (cdnKey && cacheConfigHash && cacheFreshnessToken) {
    // after(): responde ya mismo con el PNG y garantiza (Vercel y
    // self-hosted) que la subida a ImageKit se complete en segundo plano,
    // sin sumar su latencia a esta respuesta.
    const key = cdnKey;
    const configHash = cacheConfigHash;
    const freshnessToken = cacheFreshnessToken;
    const saveTask = async () => {
      try {
        await saveToCache(configHash, freshnessToken, png, key);
      } catch (err) {
        console.error("[cdnCache] Fallo guardando en caché desde /api/render:", err);
      }
    };
    try {
      after(saveTask);
    } catch {
      // after() requiere el contexto de request de Next.js
      // (AsyncLocalStorage), ausente al invocar el handler directamente
      // como hacen los tests de este repo (tests/api/*.test.ts). Fuera de
      // ese caso puntual, se completa de forma síncrona en vez de perderse.
      await saveTask();
    }
  }

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Cache corto en CDN para que los catálogos se refresquen pronto
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
