import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://mosaiq.mangelcc.dev";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "mosaiq — Netflix-style mosaic & cover generator",
    template: "%s · mosaiq",
  },
  description:
    "Free generator of Netflix-style mosaic backgrounds, wallpapers and covers from TMDB posters and backdrops. Works with Stremio and Nuvio catalogs: dynamic images that update when your catalog changes.",
  keywords: [
    "mosaic background generator",
    "netflix background",
    "poster collage",
    "TMDB posters",
    "Stremio catalog",
    "Nuvio",
    "cover generator",
    "wallpaper generator",
    "movie poster grid",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "mosaiq",
    title: "mosaiq — Netflix-style mosaic & cover generator",
    description:
      "Create mosaic backgrounds, wallpapers and covers from TMDB posters. Dynamic images from Stremio/Nuvio catalogs that update automatically.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Netflix-style poster mosaic generated with mosaiq",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "mosaiq — Netflix-style mosaic & cover generator",
    description:
      "Create mosaic backgrounds, wallpapers and covers from TMDB posters and Stremio/Nuvio catalogs.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
  icons: { icon: "/logo.svg" },
};

// Datos estructurados: ayudan a Google a mostrar la app con nombre, tipo y
// descripción correctos en los resultados
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "mosaiq",
  url: SITE_URL,
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Generator of Netflix-style mosaic backgrounds, wallpapers and covers from TMDB posters and Stremio/Nuvio catalogs.",
  screenshot: `${SITE_URL}/og.png`,
  author: { "@type": "Person", name: "Mangel-CC", url: "https://github.com/Mangel-CC" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
