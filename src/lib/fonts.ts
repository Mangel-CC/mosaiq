import { registerFont } from "@napi-rs/canvas";

// Caché de fuentes registradas
const registeredFonts = new Set<string>();

// Mapeo de nombres de fuentes a Google Fonts IDs
const GOOGLE_FONTS_MAP: Record<string, string> = {
  "Roboto": "roboto",
  "Open Sans": "open-sans",
  "Lato": "lato",
  "Montserrat": "montserrat",
  "Inter": "inter",
  "Raleway": "raleway",
  "Ubuntu": "ubuntu",
  "Poppins": "poppins",
  "Playfair Display": "playfair-display",
  "Merriweather": "merriweather",
  "Courier Prime": "courier-prime",
  "IBM Plex Mono": "ibm-plex-mono",
};

/**
 * Obtiene la URL del archivo TTF para una fuente de Google Fonts
 */
function getGoogleFontUrl(fontName: string, variant: "regular" | "bold" = "regular"): string {
  const fontId = GOOGLE_FONTS_MAP[fontName];
  if (!fontId) return "";

  // Mapping de variantes a códigos de Google Fonts
  const variantMap: Record<string, string> = {
    regular: "400",
    bold: "700",
  };

  const code = variantMap[variant];
  // URL aproximada (Google Fonts sirve los TTF con esta estructura)
  return `https://fonts.gstatic.com/s/${fontId}/v1/${fontId}-${code}.ttf`;
}

/**
 * Registra una fuente de Google Fonts dinámicamente
 */
export async function ensureFontLoaded(fontName: string): Promise<void> {
  // Validar que sea una fuente soportada
  if (!GOOGLE_FONTS_MAP[fontName]) {
    console.warn(`Fuente no soportada: ${fontName}`);
    return;
  }

  // Si ya está registrada, no hacer nada
  if (registeredFonts.has(fontName)) {
    return;
  }

  try {
    // Descargar el TTF de Google Fonts
    const url = getGoogleFontUrl(fontName);
    if (!url) return;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`No se pudo descargar fuente ${fontName}: ${res.status}`);
      return;
    }

    const buffer = await res.arrayBuffer();

    // Guardar en /tmp o memoria (en Vercel, /tmp es temporal)
    const fs = await import("fs").then(m => m.promises);
    const path = await import("path").then(m => m);
    const tmpFile = path.join("/tmp", `${fontName.replace(/\s+/g, "-")}.ttf`);

    await fs.writeFile(tmpFile, Buffer.from(buffer));

    // Registrar en Canvas
    registerFont(tmpFile, { family: fontName });
    registeredFonts.add(fontName);
    console.log(`Fuente registrada: ${fontName}`);
  } catch (err) {
    console.error(`Error cargando fuente ${fontName}:`, err);
  }
}

/**
 * Registra múltiples fuentes
 */
export async function ensureFontsLoaded(fontNames: string[]): Promise<void> {
  await Promise.allSettled(fontNames.map(ensureFontLoaded));
}
