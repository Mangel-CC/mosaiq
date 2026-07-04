// Proxy de imágenes para el preview del navegador (evita problemas de CORS al
// dibujar en canvas). Acepta cualquier host público, pero solo sirve la
// respuesta si es realmente una imagen y no supera un tamaño máximo, para no
// convertirse en un proxy abierto de uso general.

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// Bloquea hosts internos/privados para reducir el riesgo de SSRF
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  // IPs privadas / loopback / link-local más comunes
  if (
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "0.0.0.0" ||
    h === "::1"
  )
    return true;
  return false;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return new Response("Missing URL", { status: 400 });
  }

  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
    return new Response("Unsupported protocol", { status: 400 });
  }
  if (isBlockedHost(urlObj.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return new Response("Not found", { status: 404 });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return new Response("Not an image", { status: 415 });
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return new Response("Image too large", { status: 413 });
    }

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=2592000", // 30 días
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("Proxy error", { status: 500 });
  }
}
