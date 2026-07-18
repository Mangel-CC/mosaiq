import { NextRequest, NextResponse } from "next/server";
import { createOrUpdateProfile, deleteCredential, getProfile } from "@/lib/profile";

// Gestión de perfil de usuario (token -> credenciales + creaciones guardadas):
//   GET    /api/profile?token=<uuid>        lectura, sin secretos en la request
//   POST   /api/profile                     crea o actualiza credenciales (body)
//   DELETE /api/profile                     elimina una credencial (body)
// Ver specs/003-user-profiles/contracts/profile-api.md

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Falta ?token=" }, { status: 400 });
  }
  const profile = await getProfile(token);
  if (!profile) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }
  return NextResponse.json(profile);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const { token, tmdbKey, imagekitKey } = body as {
    token?: string;
    tmdbKey?: string;
    imagekitKey?: string;
  };

  const result = await createOrUpdateProfile({ token, tmdbKey, imagekitKey });
  if (!result) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }
  return NextResponse.json(
    {
      token: result.token,
      hasTmdbKey: result.hasTmdbKey,
      hasImagekitKey: result.hasImagekitKey,
    },
    { status: token ? 200 : 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const { token, service } = body as { token?: string; service?: "tmdb" | "imagekit" };
  if (!token || (service !== "tmdb" && service !== "imagekit")) {
    return NextResponse.json(
      { error: 'Falta token o service ("tmdb" | "imagekit")' },
      { status: 400 }
    );
  }

  const result = await deleteCredential(token, service);
  if (!result) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }
  return NextResponse.json({
    hasTmdbKey: result.hasTmdbKey,
    hasImagekitKey: result.hasImagekitKey,
  });
}
