// Motor de renderizado del mosaico. Es código puro de Canvas 2D, compartido
// entre el navegador (preview del editor) y el servidor (@napi-rs/canvas en
// /api/render), de modo que ambos producen exactamente la misma imagen.

export type ImageType = "poster" | "backdrop";

export interface MosaicConfig {
  width: number;
  height: number;
  imageType: ImageType;
  cols: number;
  gap: number;
  /** Rotación de la cuadrícula en grados */
  rotation: number;
  /** Desplazamiento vertical acumulado por columna (0..1, fracción de celda) */
  stagger: number;
  cornerRadius: number;
  bgColor: string;
  /** Oscurecido uniforme de toda la imagen (0..1) */
  darken: number;
  /** Viñeta radial en los bordes (0..1) */
  vignette: number;
  /** Degradado hacia bgColor en la parte inferior (0..1) */
  bottomFade: number;
  /** Zoom extra de la cuadrícula */
  scale: number;
}

export const DEFAULT_CONFIG: MosaicConfig = {
  width: 1920,
  height: 1080,
  imageType: "poster",
  cols: 8,
  gap: 14,
  rotation: -10,
  stagger: 0.5,
  cornerRadius: 10,
  bgColor: "#000000",
  darken: 0.35,
  vignette: 0.6,
  bottomFade: 0.5,
  scale: 1,
};

export interface Preset {
  label: string;
  config: Partial<MosaicConfig>;
}

export const PRESETS: Record<string, Preset> = {
  netflix: {
    label: "Mosaico inclinado",
    config: {
      imageType: "poster",
      cols: 8,
      gap: 14,
      rotation: -10,
      stagger: 0.5,
      cornerRadius: 10,
      darken: 0.35,
      vignette: 0.6,
      bottomFade: 0.5,
    },
  },
  grid: {
    label: "Grid recto",
    config: {
      imageType: "poster",
      cols: 9,
      gap: 10,
      rotation: 0,
      stagger: 0,
      cornerRadius: 6,
      darken: 0.15,
      vignette: 0.3,
      bottomFade: 0,
    },
  },
  backdrops: {
    label: "Collage de backdrops",
    config: {
      imageType: "backdrop",
      cols: 5,
      gap: 8,
      rotation: -6,
      stagger: 0.35,
      cornerRadius: 8,
      darken: 0.3,
      vignette: 0.55,
      bottomFade: 0.4,
    },
  },
};

export function resolveConfig(
  preset: string | null,
  overrides: Partial<MosaicConfig>
): MosaicConfig {
  const base = (preset && PRESETS[preset]?.config) || {};
  return { ...DEFAULT_CONFIG, ...base, ...overrides };
}

// Relación de aspecto de cada celda según el tipo de imagen de TMDB
function cellAspect(type: ImageType): number {
  return type === "poster" ? 2 / 3 : 16 / 9;
}

type Drawable = { width: number; height: number };

// RNG determinista: el preview y el render del servidor reparten las
// imágenes exactamente igual.
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Asigna una imagen a cada celda repartiendo las repeticiones: cada ciclo
 * usa las N imágenes en orden barajado y se evita, mientras sea posible,
 * repetir la de la celda de la izquierda o la de arriba.
 */
function buildAssignment(
  cols: number,
  rows: number,
  count: number
): number[][] {
  const rng = mulberry32(1337);
  let pool: number[] = [];
  const refill = () => {
    pool = Array.from({ length: count }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  };
  const grid: number[][] = [];
  for (let col = 0; col < cols; col++) {
    grid[col] = [];
    for (let row = 0; row < rows; row++) {
      if (pool.length === 0) refill();
      // Con escalonado, los vecinos visuales de la columna anterior son las
      // celdas en diagonal, así que también se evitan.
      const forbidden = new Set<number>();
      for (let r = row - 2; r <= row; r++) {
        const v = grid[col][r];
        if (v !== undefined) forbidden.add(v);
      }
      for (let c = col - 2; c < col; c++) {
        if (c < 0) continue;
        for (let r = row - 2; r <= row + 2; r++) {
          const v = grid[c][r];
          if (v !== undefined) forbidden.add(v);
        }
      }
      let idx = pool.findIndex((v) => !forbidden.has(v));
      if (idx === -1) idx = 0;
      grid[col][row] = pool.splice(idx, 1)[0];
    }
  }
  return grid;
}

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: Drawable,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const ir = img.width / img.height;
  const cr = w / h;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;
  if (ir > cr) {
    sw = img.height * cr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / cr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(
    img as unknown as CanvasImageSource,
    sx,
    sy,
    sw,
    sh,
    x,
    y,
    w,
    h
  );
}

/**
 * Dibuja el mosaico completo sobre un contexto 2D. `images` debe contener
 * imágenes ya cargadas; si hay menos imágenes que celdas se repiten en ciclo.
 */
export function renderMosaic(
  ctx: CanvasRenderingContext2D,
  images: Drawable[],
  cfg: MosaicConfig
) {
  const { width: w, height: h } = cfg;

  ctx.save();
  ctx.fillStyle = cfg.bgColor;
  ctx.fillRect(0, 0, w, h);

  if (images.length > 0) {
    // La cuadrícula se dibuja sobre un área cuadrada del tamaño de la
    // diagonal del lienzo para que, al rotarla, siempre lo cubra entero.
    const diag = Math.sqrt(w * w + h * h) * cfg.scale;
    const cellW = diag / cfg.cols - cfg.gap;
    const cellH = cellW / cellAspect(cfg.imageType);
    const stepY = cellH + cfg.gap;
    const rows = Math.ceil(diag / stepY) + 2;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((cfg.rotation * Math.PI) / 180);
    ctx.translate(-diag / 2, -diag / 2);

    const assignment = buildAssignment(cfg.cols, rows, images.length);
    for (let col = 0; col < cfg.cols; col++) {
      const x = col * (cellW + cfg.gap);
      const yOff = -((col * cfg.stagger * stepY) % stepY);
      for (let row = 0; row < rows; row++) {
        const y = yOff + row * stepY;
        const img = images[assignment[col][row]];
        ctx.save();
        pathRoundRect(ctx, x, y, cellW, cellH, cfg.cornerRadius);
        ctx.clip();
        drawCover(ctx, img, x, y, cellW, cellH);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  applyOverlays(ctx, w, h, cfg);

  ctx.restore();
}

/** Capas finales compartidas por el mosaico y la portada. */
export function applyOverlays(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cfg: { darken: number; vignette: number; bottomFade: number; bgColor: string }
) {
  if (cfg.darken > 0) {
    ctx.fillStyle = `rgba(0,0,0,${cfg.darken})`;
    ctx.fillRect(0, 0, w, h);
  }

  if (cfg.vignette > 0) {
    const inner = Math.min(w, h) * 0.35;
    const outer = Math.sqrt(w * w + h * h) / 2;
    const g = ctx.createRadialGradient(
      w / 2,
      h / 2,
      inner,
      w / 2,
      h / 2,
      outer
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${cfg.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  if (cfg.bottomFade > 0) {
    const g = ctx.createLinearGradient(0, h * 0.45, 0, h);
    const { r, g: gg, b } = hexToRgb(cfg.bgColor);
    g.addColorStop(0, `rgba(${r},${gg},${b},0)`);
    g.addColorStop(1, `rgba(${r},${gg},${b},${cfg.bottomFade})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.45, w, h * 0.55);
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Parsea los parámetros de query compartidos por el editor y /api/render. */
export function configFromParams(params: URLSearchParams): MosaicConfig {
  const num = (key: string) => {
    const v = params.get(key);
    if (v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const overrides: Partial<MosaicConfig> = {};
  const assign = <K extends keyof MosaicConfig>(
    key: K,
    value: MosaicConfig[K] | undefined
  ) => {
    if (value !== undefined) overrides[key] = value;
  };
  assign("width", num("w"));
  assign("height", num("h"));
  assign("cols", num("cols"));
  assign("gap", num("gap"));
  assign("rotation", num("rot"));
  assign("stagger", num("stagger"));
  assign("cornerRadius", num("radius"));
  assign("darken", num("darken"));
  assign("vignette", num("vignette"));
  assign("bottomFade", num("fade"));
  assign("scale", num("scale"));
  const type = params.get("type");
  if (type === "poster" || type === "backdrop") overrides.imageType = type;
  const bg = params.get("bg");
  if (bg && /^([0-9a-f]{6})$/i.test(bg)) overrides.bgColor = `#${bg}`;
  return resolveConfig(params.get("preset"), overrides);
}

/** Convierte una config en query params (inverso de configFromParams). */
export function configToParams(cfg: MosaicConfig): URLSearchParams {
  const p = new URLSearchParams();
  p.set("w", String(cfg.width));
  p.set("h", String(cfg.height));
  p.set("type", cfg.imageType);
  p.set("cols", String(cfg.cols));
  p.set("gap", String(cfg.gap));
  p.set("rot", String(cfg.rotation));
  p.set("stagger", String(cfg.stagger));
  p.set("radius", String(cfg.cornerRadius));
  p.set("darken", String(cfg.darken));
  p.set("vignette", String(cfg.vignette));
  p.set("fade", String(cfg.bottomFade));
  p.set("scale", String(cfg.scale));
  p.set("bg", cfg.bgColor.replace("#", ""));
  return p;
}
