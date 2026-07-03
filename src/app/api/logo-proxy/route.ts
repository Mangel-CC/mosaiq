export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url || !url.startsWith("https://image.tmdb.org/")) {
    return new Response("Invalid URL", { status: 400 });
  }

  try {
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
