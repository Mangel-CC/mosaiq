// Tamano/formato de SALIDA (?ow=640&ofmt=jpeg): la imagen se sigue generando y guardando
// en cache a su tamano completo; solo lo que se entrega se reduce. Pensado para TVs
// (Nuvio Legacy) que si no bajan un PNG de 1920x1080 de ~2 MB y lo reducen ellas mismas
// para una tarjeta de ~600 px. No entra en el hash de cache (ver computeConfigHash).
import { createCanvas, loadImage } from "@napi-rs/canvas";

export const OUTPUT_PARAMS = new Set(["ow", "ofmt"]);

export interface OutputSpec { width: number | null; format: "png" | "jpeg"; }

export function outputSpec(params: URLSearchParams): OutputSpec | null {
  const owRaw = Number(params.get("ow"));
  const width = Number.isFinite(owRaw) && owRaw >= 64 && owRaw <= 3840 ? Math.round(owRaw) : null;
  const f = (params.get("ofmt") || "").toLowerCase();
  const format: "png" | "jpeg" = f === "jpeg" || f === "jpg" ? "jpeg" : "png";
  if (!width && format === "png") return null;
  return { width, format };
}

// URL de ImageKit con la transformacion equivalente (redimension en su CDN).
export function imagekitOutputUrl(url: string, spec: OutputSpec | null): string {
  if (!spec) return url;
  const tr = [spec.width ? `w-${spec.width}` : null, spec.format === "jpeg" ? "f-jpg,q-82" : null]
    .filter(Boolean).join(",");
  return `${url}${url.includes("?") ? "&" : "?"}tr=${tr}`;
}

export async function encodeOutput(png: Buffer, spec: OutputSpec | null): Promise<{ body: Buffer; type: string }> {
  if (!spec) return { body: png, type: "image/png" };
  const img = await loadImage(png);
  const w = spec.width && spec.width < img.width ? spec.width : img.width;
  const h = Math.max(1, Math.round((img.height * w) / img.width));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return spec.format === "jpeg"
    ? { body: canvas.toBuffer("image/jpeg", 82), type: "image/jpeg" }
    : { body: canvas.toBuffer("image/png"), type: "image/png" };
}
