import { NextRequest, NextResponse } from "next/server";
import { createShortLink, normalizeTarget } from "@/lib/shortLinks";

// POST /api/shorten {"url": "https://.../api/render?..."} -> {"short": "https://.../s/<id>"}
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const target = normalizeTarget(typeof body?.url === "string" ? body.url : "");
  if (!target) {
    return NextResponse.json(
      { error: "url debe apuntar a /api/render o /api/cover con parámetros" },
      { status: 400 }
    );
  }
  const id = await createShortLink(target);
  return NextResponse.json({ id, short: new URL(`/s/${id}`, req.nextUrl.origin).toString() });
}
