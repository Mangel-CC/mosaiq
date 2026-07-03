import { NextRequest, NextResponse } from "next/server";

// Access key opcional (estilo PostersPlus): si ACCESS_KEY está definida en el
// entorno, todas las rutas /api/* exigen ?key=<ACCESS_KEY> (o el header
// x-access-key). Sin ACCESS_KEY, la app es pública.
// /api/auth queda fuera para que el editor pueda saber si hace falta key.

export function middleware(req: NextRequest) {
  const required = process.env.ACCESS_KEY;
  if (!required) return NextResponse.next();
  const provided =
    req.nextUrl.searchParams.get("key") ?? req.headers.get("x-access-key");
  if (provided === required) return NextResponse.next();
  return NextResponse.json(
    { error: "Acceso denegado: falta o es incorrecta la access key (?key=)" },
    { status: 401 }
  );
}

export const config = {
  matcher: ["/api/((?!auth).*)"],
};
