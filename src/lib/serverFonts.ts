import path from "path";
import { GlobalFonts } from "@napi-rs/canvas";

// Fuentes empaquetadas en el repo (src/assets/fonts). Se registran una sola
// vez en el proceso del servidor para que @napi-rs/canvas pueda dibujar texto
// en Vercel, donde el entorno serverless no trae ninguna fuente del sistema.
// Los mismos nombres de familia se cargan en el navegador (ver layout), así
// el preview coincide con la imagen que genera la API.

// [familia CSS, archivo(s) TTF]
const FONT_FILES: [family: string, files: string[]][] = [
  ["Poppins", ["Poppins-Regular.ttf", "Poppins-Bold.ttf"]],
  ["Roboto", ["Roboto-Regular.ttf", "Roboto-Bold.ttf"]],
  ["Oswald", ["Oswald.ttf"]],
  ["Playfair Display", ["PlayfairDisplay.ttf"]],
  ["Bebas Neue", ["BebasNeue-Regular.ttf"]],
  ["Anton", ["Anton-Regular.ttf"]],
];

let registered = false;

export function registerServerFonts(): void {
  if (registered) return;
  registered = true;
  const dir = path.join(process.cwd(), "src", "assets", "fonts");
  for (const [family, files] of FONT_FILES) {
    for (const file of files) {
      try {
        GlobalFonts.registerFromPath(path.join(dir, file), family);
      } catch (err) {
        console.error(`No se pudo registrar la fuente ${family} (${file}):`, err);
      }
    }
  }
}
