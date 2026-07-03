import { NextResponse } from "next/server";

// Indica al editor si el servidor exige access key (no revela la key).
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    required: Boolean(process.env.ACCESS_KEY),
  });
}
