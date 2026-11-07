import { NextRequest, NextResponse } from "next/server";
import { getShortLink } from "@/lib/shortLinks";
import { GET as renderGET } from "@/app/api/render/route";
import { GET as coverGET } from "@/app/api/cover/route";

// GET /s/<id>: sirve la imagen directamente (sin redirección) para que el
// cliente solo vea la URL corta.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const target = await getShortLink(id);
  if (!target) return NextResponse.json({ error: "Link not found" }, { status: 404 });
  const url = new URL(target, req.nextUrl.origin);
  const inner = new NextRequest(url, { headers: req.headers });
  return url.pathname === "/api/cover" ? coverGET(inner) : renderGET(inner);
}
