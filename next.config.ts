import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  // Genera .next/standalone para la imagen Docker (server.js autocontenido)
  output: "standalone",
};

export default nextConfig;
