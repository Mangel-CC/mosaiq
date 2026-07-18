import { NextRequest, NextResponse } from "next/server";
import { deleteCreation, getCreation, updateCreation } from "@/lib/profile";

// GET/PUT/DELETE /api/profile/creations/:id — lee, actualiza o elimina una
// creación existente. El mismo 404 se usa para "token desconocido" y "id no
// pertenece a ese token", para no filtrar si un id existe bajo otro token.
// Ver specs/003-user-profiles/contracts/profile-api.md

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Falta token" }, { status: 400 });
  }

  const creation = await getCreation(id, token);
  if (!creation) {
    return NextResponse.json({ error: "Creation not found" }, { status: 404 });
  }
  return NextResponse.json(creation);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const { token, name, config } = body as {
    token?: string;
    name?: string;
    config?: Record<string, unknown>;
  };
  if (!token) {
    return NextResponse.json({ error: "Falta token" }, { status: 400 });
  }

  try {
    const result = await updateCreation(id, token, { name, config });
    if (!result) {
      return NextResponse.json({ error: "Creation not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error actualizando la creación" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const token = (body as { token?: string } | null)?.token;
  if (!token) {
    return NextResponse.json({ error: "Falta token" }, { status: 400 });
  }

  const deleted = await deleteCreation(id, token);
  if (!deleted) {
    return NextResponse.json({ error: "Creation not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
