import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  // Genera .next/standalone para la imagen Docker (server.js autocontenido)
  output: "standalone",
  // Empaqueta los TTF junto a la función serverless de /api/cover para que
  // GlobalFonts pueda leerlos en runtime (Vercel/standalone no los incluye
  // por sí solo al leerse por ruta de fichero)
  outputFileTracingIncludes: {
    "/api/cover": ["./src/assets/fonts/**"],
  },
};

export default nextConfig;
