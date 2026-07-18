import { NextRequest, NextResponse } from "next/server";
import { createCreation } from "@/lib/profile";

// POST /api/profile/creations — guarda una nueva creación bajo un perfil.
// Ver specs/003-user-profiles/contracts/profile-api.md

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const { token, name, type, config } = body as {
    token?: string;
    name?: string;
    type?: "mosaic" | "cover";
    config?: Record<string, unknown>;
  };
  if (!token || !name || (type !== "mosaic" && type !== "cover") || !config) {
    return NextResponse.json(
      { error: "Faltan campos: token, name, type ('mosaic'|'cover'), config" },
      { status: 400 }
    );
  }

  try {
    const result = await createCreation(token, name, type, config);
    if (!result) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error creando la creación" },
      { status: 400 }
    );
  }
}
