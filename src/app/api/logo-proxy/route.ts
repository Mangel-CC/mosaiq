// Dominios permitidos para evitar abuso del proxy
const ALLOWED_DOMAINS = [
  "image.tmdb.org",
  "media.kitsu.app",
  "plugin.mangelcc.dev",
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return new Response("Missing URL", { status: 400 });
  }

  try {
    const urlObj = new URL(url);
    const isAllowed = ALLOWED_DOMAINS.some((domain) =>
      urlObj.hostname.endsWith(domain)
    );

    if (!isAllowed) {
      return new Response("Domain not allowed", { status: 403 });
    }

    const res = await fetch(url);
    if (!res.ok) return new Response("Not found", { status: 404 });

    const buffer = await res.arrayBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/png",
        "Cache-Control": "public, max-age=2592000", // 30 días
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("Proxy error", { status: 500 });
  }
}
