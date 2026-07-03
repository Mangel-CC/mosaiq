// Motor del generador de portadas: una imagen de fondo (poster/backdrop del
// título elegido, p. ej. el nº1 del top) + logo PNG superpuesto + overlays.
// Igual que el mosaico, es código puro de Canvas 2D compartido entre el
// preview del navegador y /api/cover en el servidor.

import { applyOverlays, drawCover } from "./mosaic";

export type PlateSide = "none" | "top" | "bottom" | "left" | "right";

export interface CoverConfig {
  width: number;
  height: number;
  /** Zoom del fondo */
  bgScale: number;
  bgColor: string;
  darken: number;
  vignette: number;
  bottomFade: number;
  /** Ancho del logo como fracción del ancho del lienzo (0..1) */
  logoScale: number;
  /** Posición del centro del logo (0..1) */
  logoX: number;
  logoY: number;
  /** Rotación del logo en grados */
  logoAngle: number;
  /** Texto sobre la portada (p. ej. el nombre de un género); "" = sin texto */
  text: string;
  textFont: string;
  textColor: string;
  textBold: boolean;
  /** Tamaño de fuente como fracción del ancho del lienzo */
  textSize: number;
  /** Posición del centro del texto (0..1) */
  textX: number;
  textY: number;
  /** Rotación del texto en grados */
  textAngle: number;
  /** Intensidad de la sombra del texto (0..1) */
  textShadow: number;
  /** Placa detrás del logo, anclada a uno de los 4 lados del lienzo */
  plate: PlateSide;
  plateColor: string;
  /** Opacidad del color de la placa (0..1) */
  plateOpacity: number;
  /** Grosor de la placa como fracción del lienzo (0..1) */
  plateSize: number;
  /** Inclinación del borde interior (solo izquierda/derecha): fracción de
   *  ancho que se desplaza el borde en la parte inferior */
  plateSlant: number;
  /** Suavizado del borde interior (0 = corte duro) */
  plateFade: number;
  /** Blur del fondo dentro de la placa, en px (0 = sin blur) */
  plateBlur: number;
}

export const DEFAULT_COVER_CONFIG: CoverConfig = {
  // A juego con el tipo por defecto del editor ("backdrop")
  width: 1920,
  height: 1080,
  bgScale: 1,
  bgColor: "#000000",
  darken: 0.2,
  vignette: 0.35,
  bottomFade: 0.55,
  logoScale: 0.7,
  logoX: 0.5,
  logoY: 0.78,
  logoAngle: 0,
  text: "",
  textFont: "sans-serif",
  textColor: "#ffffff",
  textBold: true,
  textSize: 0.14,
  textX: 0.5,
  textY: 0.5,
  textAngle: 0,
  textShadow: 0.4,
  plate: "none",
  plateColor: "#000000",
  plateOpacity: 0.6,
  plateSize: 0.4,
  plateSlant: 0,
  plateFade: 0.5,
  plateBlur: 0,
};

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type Drawable = { width: number; height: number };

export function renderCover(
  ctx: CanvasRenderingContext2D,
  bg: Drawable | null,
  logo: Drawable | null,
  cfg: CoverConfig
) {
  const { width: w, height: h } = cfg;

  ctx.save();
  ctx.fillStyle = cfg.bgColor;
  ctx.fillRect(0, 0, w, h);

  const drawBg = () => {
    if (!bg) return;
    const bw = w * cfg.bgScale;
    const bh = h * cfg.bgScale;
    drawCover(ctx, bg, (w - bw) / 2, (h - bh) / 2, bw, bh);
  };
  drawBg();

  applyOverlays(ctx, w, h, cfg);

  // ---- Placa detrás del logo (anclada a un lado del lienzo) ----
  if (cfg.plate !== "none") {
    const horizontal = cfg.plate === "top" || cfg.plate === "bottom";
    // Grosor en px sobre la dimensión correspondiente
    const thick = (horizontal ? h : w) * cfg.plateSize;
    // Desplazamiento diagonal del borde interior (solo laterales)
    const slant = horizontal ? 0 : w * cfg.plateSlant;
    const clampX = (x: number) => Math.max(0, Math.min(w, x));

    // Borde interior de la placa: de (ax, ay) a (bx, by)
    let ax = 0, ay = 0, bx = 0, by = 0;
    switch (cfg.plate) {
      case "top":
        ax = 0; ay = thick; bx = w; by = thick;
        break;
      case "bottom":
        ax = 0; ay = h - thick; bx = w; by = h - thick;
        break;
      case "left":
        ax = thick; ay = 0; bx = clampX(thick + slant); by = h;
        break;
      case "right":
        ax = w - thick; ay = 0; bx = clampX(w - thick - slant); by = h;
        break;
    }

    const tracePlate = () => {
      ctx.beginPath();
      switch (cfg.plate) {
        case "top":
          ctx.moveTo(0, 0); ctx.lineTo(w, 0);
          ctx.lineTo(bx, by); ctx.lineTo(ax, ay);
          break;
        case "bottom":
          ctx.moveTo(0, h); ctx.lineTo(ax, ay);
          ctx.lineTo(bx, by); ctx.lineTo(w, h);
          break;
        case "left":
          ctx.moveTo(0, 0); ctx.lineTo(ax, ay);
          ctx.lineTo(bx, by); ctx.lineTo(0, h);
          break;
        case "right":
          ctx.moveTo(w, 0); ctx.lineTo(ax, ay);
          ctx.lineTo(bx, by); ctx.lineTo(w, h);
          break;
      }
      ctx.closePath();
    };

    // Blur: se vuelve a dibujar el fondo desenfocado, recortado a la placa
    if (cfg.plateBlur > 0 && bg) {
      ctx.save();
      tracePlate();
      ctx.clip();
      ctx.filter = `blur(${cfg.plateBlur}px)`;
      drawBg();
      ctx.filter = "none";
      ctx.restore();
    }

    // Color con fade perpendicular al borde interior, hacia el lado anclado
    const [r, g, b] = hexToRgb(cfg.plateColor);
    const solid = `rgba(${r},${g},${b},${cfg.plateOpacity})`;
    ctx.save();
    if (cfg.plateFade > 0) {
      // El ancho efectivo cuenta también la parte diagonal, para que el
      // fade no desaparezca cuando el grosor base es 0
      const effThick = thick + Math.abs(slant) / 2;
      const fadeDist = Math.max(1, cfg.plateFade * effThick);
      const evx = bx - ax;
      const evy = by - ay;
      const len = Math.hypot(evx, evy) || 1;
      // Normal al borde interior
      let nx = evy / len;
      let ny = -evx / len;
      // Punto medio del borde y centro del lado anclado, para orientar
      // la normal hacia el interior de la placa
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const anchor =
        cfg.plate === "top"
          ? [w / 2, 0]
          : cfg.plate === "bottom"
          ? [w / 2, h]
          : cfg.plate === "left"
          ? [0, h / 2]
          : [w, h / 2];
      if (nx * (anchor[0] - mx) + ny * (anchor[1] - my) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const grad = ctx.createLinearGradient(
        mx,
        my,
        mx + nx * fadeDist,
        my + ny * fadeDist
      );
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(1, solid);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = solid;
    }
    tracePlate();
    ctx.fill();
    ctx.restore();
  }

  if (logo) {
    const lw = w * cfg.logoScale;
    const lh = lw * (logo.height / logo.width);
    ctx.save();
    // Rotación alrededor del centro del logo
    ctx.translate(w * cfg.logoX, h * cfg.logoY);
    ctx.rotate((cfg.logoAngle * Math.PI) / 180);
    ctx.drawImage(
      logo as unknown as CanvasImageSource,
      -lw / 2,
      -lh / 2,
      lw,
      lh
    );
    ctx.restore();
  }

  // ---- Texto (p. ej. nombre de género) ----
  if (cfg.text.trim()) {
    ctx.save();
    ctx.translate(w * cfg.textX, h * cfg.textY);
    ctx.rotate((cfg.textAngle * Math.PI) / 180);
    const px = Math.max(4, w * cfg.textSize);
    ctx.font = `${cfg.textBold ? "bold " : ""}${px}px ${cfg.textFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (cfg.textShadow > 0) {
      ctx.shadowColor = `rgba(0,0,0,${Math.min(1, cfg.textShadow)})`;
      ctx.shadowBlur = px * 0.25 * cfg.textShadow;
      ctx.shadowOffsetY = px * 0.04 * cfg.textShadow;
    }
    ctx.fillStyle = cfg.textColor;
    ctx.fillText(cfg.text.trim(), 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

export function coverConfigFromParams(params: URLSearchParams): CoverConfig {
  const num = (key: string) => {
    const v = params.get(key);
    if (v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const cfg = { ...DEFAULT_COVER_CONFIG };
  const assign = <K extends keyof CoverConfig>(
    key: K,
    value: CoverConfig[K] | undefined
  ) => {
    if (value !== undefined) cfg[key] = value;
  };
  assign("width", num("w"));
  assign("height", num("h"));
  assign("bgScale", num("bgscale"));
  assign("darken", num("darken"));
  assign("vignette", num("vignette"));
  assign("bottomFade", num("fade"));
  assign("logoScale", num("logoscale"));
  assign("logoX", num("logox"));
  assign("logoY", num("logoy"));
  assign("logoAngle", num("logoangle"));
  const text = params.get("text");
  if (text) cfg.text = text.slice(0, 80);
  const font = params.get("font");
  if (font && /^[\w\s-]+$/.test(font)) cfg.textFont = font;
  const tc = params.get("textcolor");
  if (tc && /^([0-9a-f]{6})$/i.test(tc)) cfg.textColor = `#${tc}`;
  const tb = params.get("textbold");
  if (tb !== null) cfg.textBold = tb === "1";
  assign("textSize", num("textsize"));
  assign("textX", num("textx"));
  assign("textY", num("texty"));
  assign("textAngle", num("textangle"));
  assign("textShadow", num("textshadow"));
  const bg = params.get("bg");
  if (bg && /^([0-9a-f]{6})$/i.test(bg)) cfg.bgColor = `#${bg}`;
  const plate = params.get("plate");
  if (
    plate === "top" ||
    plate === "bottom" ||
    plate === "left" ||
    plate === "right"
  )
    cfg.plate = plate;
  const pc = params.get("platecolor");
  if (pc && /^([0-9a-f]{6})$/i.test(pc)) cfg.plateColor = `#${pc}`;
  assign("plateOpacity", num("plateopacity"));
  assign("plateSize", num("platesize"));
  assign("plateSlant", num("plateslant"));
  assign("plateFade", num("platefade"));
  assign("plateBlur", num("plateblur"));
  return cfg;
}

export function coverConfigToParams(cfg: CoverConfig): URLSearchParams {
  const p = new URLSearchParams();
  p.set("w", String(cfg.width));
  p.set("h", String(cfg.height));
  p.set("bgscale", String(cfg.bgScale));
  p.set("darken", String(cfg.darken));
  p.set("vignette", String(cfg.vignette));
  p.set("fade", String(cfg.bottomFade));
  p.set("logoscale", String(cfg.logoScale));
  p.set("logox", String(cfg.logoX));
  p.set("logoy", String(cfg.logoY));
  if (cfg.logoAngle !== 0) p.set("logoangle", String(cfg.logoAngle));
  // Siempre pasar parámetros de texto para consistencia
  if (cfg.text.trim()) p.set("text", cfg.text.trim());
  p.set("font", cfg.textFont);
  p.set("textcolor", cfg.textColor.replace("#", ""));
  p.set("textbold", cfg.textBold ? "1" : "0");
  p.set("textsize", String(cfg.textSize));
  p.set("textx", String(cfg.textX));
  p.set("texty", String(cfg.textY));
  if (cfg.textAngle !== 0) p.set("textangle", String(cfg.textAngle));
  p.set("textshadow", String(cfg.textShadow));
  p.set("bg", cfg.bgColor.replace("#", ""));
  if (cfg.plate !== "none") {
    p.set("plate", cfg.plate);
    p.set("platecolor", cfg.plateColor.replace("#", ""));
    p.set("plateopacity", String(cfg.plateOpacity));
    p.set("platesize", String(cfg.plateSize));
    if (cfg.plate === "left" || cfg.plate === "right")
      p.set("plateslant", String(cfg.plateSlant));
    p.set("platefade", String(cfg.plateFade));
    p.set("plateblur", String(cfg.plateBlur));
  }
  return p;
}
