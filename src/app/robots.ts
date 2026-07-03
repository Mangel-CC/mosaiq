import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Los endpoints generan PNG bajo demanda: no tiene sentido indexarlos
      // y cada visita del crawler costaría un render
      disallow: "/api/",
    },
    sitemap: "https://mosaiq.mangelcc.dev/sitemap.xml",
  };
}
