"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CONFIG,
  MosaicConfig,
  PRESETS,
  configFromParams,
  configToParams,
  renderMosaic,
} from "@/lib/mosaic";
import {
  CoverConfig,
  DEFAULT_COVER_CONFIG,
  coverConfigFromParams,
  coverConfigToParams,
  renderCover,
} from "@/lib/cover";

interface SearchItem {
  id: number | string;
  mediaType: "movie" | "tv" | "catalog";
  title: string;
  year: string;
  poster: string | null;
  backdrop: string | null;
}

const COVER_RESOLUTIONS = [
  { label: "1000 × 1500 (portada)", w: 1000, h: 1500 },
  { label: "1920 × 1080", w: 1920, h: 1080 },
  { label: "1280 × 720", w: 1280, h: 720 },
  { label: "1000 × 1000 (cuadrada)", w: 1000, h: 1000 },
];

// Fuentes disponibles en el servidor (compatibles con API)
const TEXT_FONTS = [
  "sans-serif",
  "serif",
  "monospace",
  "DejaVu Sans",
  "DejaVu Serif",
  "Liberation Sans",
  "Liberation Serif",
  "Noto Sans",
];

const RESOLUTIONS = [
  { label: "1920 × 1080", w: 1920, h: 1080 },
  { label: "2560 × 1440", w: 2560, h: 1440 },
  { label: "3840 × 2160 (4K)", w: 3840, h: 2160 },
  { label: "1080 × 1920 (vertical)", w: 1080, h: 1920 },
  { label: "1500 × 500 (banner)", w: 1500, h: 500 },
];

// Los items resueltos desde TMDB traen paths ("/abc.jpg"); los de fallback
// de un catálogo pueden ser URLs absolutas.
function imgUrl(path: string, type: "poster" | "backdrop") {
  if (!path.startsWith("/")) return path;
  return `https://image.tmdb.org/t/p/${type === "poster" ? "w500" : "w1280"}${path}`;
}

function thumbUrl(path: string) {
  return path.startsWith("/")
    ? `https://image.tmdb.org/t/p/w185${path}`
    : path;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const canvasCache = new Map<string, string>(); // Almacena data URLs del canvas

function loadImg(url: string): Promise<HTMLImageElement> {
  // Proxy para imágenes que necesitan CORS (TMDB, Kitsu, etc)
  const needsProxy = url.startsWith("https://") && !url.startsWith("data:");
  const proxyUrl = needsProxy
    ? `/api/logo-proxy?url=${encodeURIComponent(url)}`
    : url;

  let p = imageCache.get(proxyUrl);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
      img.src = proxyUrl;
    });
    imageCache.set(proxyUrl, p);
  }
  return p;
}

function getCacheKey(
  mode: "mosaic" | "cover",
  paths: string[],
  config: MosaicConfig | CoverConfig,
  extra: Record<string, unknown>
): string {
  const sortedPaths = [...paths].sort().join("|");
  const params = JSON.stringify({ config, extra });
  return `${mode}:${sortedPaths}:${params}`;
}

export default function Editor() {
  const [config, setConfig] = useState<MosaicConfig>(DEFAULT_CONFIG);
  const [preset, setPreset] = useState("netflix");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // Lista de catálogos añadidos (p. ej. top 10 pelis + top 10 series)
  const [catalogUrlList, setCatalogUrlList] = useState<string[]>([]);
  const [catalogInput, setCatalogInput] = useState("");
  const [catalogLimit, setCatalogLimit] = useState(30);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  // Ids de títulos del catálogo quitados a mano: la URL dinámica los excluye
  const [excluded, setExcluded] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Access key opcional (estilo PostersPlus): si el servidor define
  // ACCESS_KEY, todas las llamadas a la API deben llevar ?key=
  const [accessKey, setAccessKey] = useState("");
  const [keyRequired, setKeyRequired] = useState(false);
  const keyLoaded = useRef(false);

  useEffect(() => {
    setAccessKey(localStorage.getItem("accessKey") ?? "");
    keyLoaded.current = true;
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setKeyRequired(Boolean(d.required)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (keyLoaded.current) localStorage.setItem("accessKey", accessKey);
  }, [accessKey]);

  // Añade la access key a una URL de la API si está configurada
  const withKey = useCallback(
    (url: string) => {
      const k = accessKey.trim();
      if (!k) return url;
      return `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(k)}`;
    },
    [accessKey]
  );

  // ---- Generador de portadas ----
  const [mode, setMode] = useState<"mosaic" | "cover">("mosaic");
  const [coverCfgRaw, setCoverCfg] = useState<CoverConfig>(
    DEFAULT_COVER_CONFIG
  );
  // Mezcla con los defaults por si el estado guardado (p. ej. tras un
  // hot-reload) no tiene campos nuevos: evita inputs con value undefined
  const coverCfg = useMemo(
    () => ({ ...DEFAULT_COVER_CONFIG, ...coverCfgRaw }),
    [coverCfgRaw]
  );
  const [coverType, setCoverType] = useState<"poster" | "backdrop">(
    "backdrop"
  );
  // "top" = nº `coverPick` del catálogo (dinámico); "fixed" = título elegido
  const [coverSource, setCoverSource] = useState<"top" | "fixed">("top");
  const [coverPick, setCoverPick] = useState(1);
  const [selectedCover, setSelectedCover] = useState<SearchItem | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  // Buscador de logos oficiales de plataformas (TMDB watch providers)
  const [logoQuery, setLogoQuery] = useState("");
  const [logoResults, setLogoResults] = useState<
    { id: number; name: string; logo: string }[]
  >([]);
  // Arte "textless" (sin titulo impreso encima)
  const [noText, setNoText] = useState(false);
  const [textlessArt, setTextlessArt] = useState<{
    poster: string | null;
    backdrop: string | null;
  } | null>(null);

  const setCover = useCallback(
    <K extends keyof CoverConfig>(key: K, value: CoverConfig[K]) => {
      setCoverCfg((c) => ({ ...c, [key]: value }));
    },
    []
  );

  const set = useCallback(
    <K extends keyof MosaicConfig>(key: K, value: MosaicConfig[K]) => {
      setConfig((c) => ({ ...c, [key]: value }));
    },
    []
  );

  const applyPreset = (name: string) => {
    setPreset(name);
    setConfig((c) => ({ ...c, ...PRESETS[name].config }));
  };

  const resetAll = () => {
    setConfig(DEFAULT_CONFIG);
    setPreset("netflix");
    setItems([]);
    setQuery("");
    setResults([]);
    setSearchError(null);
    setCatalogUrlList([]);
    setCatalogInput("");
    setCatalogLimit(30);
    setExcluded([]);
    setCoverCfg(DEFAULT_COVER_CONFIG);
    setCoverType("backdrop");
    setCoverSource("top");
    setCoverPick(1);
    setSelectedCover(null);
    setLogoUrl("");
    setLogoQuery("");
    setLogoResults([]);
    setNoText(false);
    setTextlessArt(null);
  };

  // Búsqueda con debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          withKey(`/api/search?q=${encodeURIComponent(query)}`)
        );
        const data = await res.json();
        if (data.error) setSearchError(data.error);
        else {
          setSearchError(null);
          setResults(data.results);
        }
      } catch {
        setSearchError("Error de red buscando en TMDB");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, withKey]);

  // Rutas de imagen según el tipo elegido
  const imagePaths = useMemo(
    () =>
      items
        .map((it) =>
          config.imageType === "backdrop"
            ? it.backdrop ?? it.poster
            : it.poster ?? it.backdrop
        )
        .filter((p): p is string => !!p),
    [items, config.imageType]
  );

  // Título usado como fondo de la portada
  const coverItem =
    coverSource === "fixed" && selectedCover
      ? selectedCover
      : items[Math.min(coverPick, items.length) - 1] ?? null;

  // Tipo de imagen activo segun la pestana (para las miniaturas del buscador)
  const activeType = mode === "cover" ? coverType : config.imageType;

  // Carga el arte textless del titulo de la portada cuando se activa
  useEffect(() => {
    if (!noText || mode !== "cover" || !coverItem) {
      setTextlessArt(null);
      return;
    }
    let cancelled = false;
    const q = new URLSearchParams({ id: String(coverItem.id) });
    if (coverItem.mediaType !== "catalog") q.set("media", coverItem.mediaType);
    fetch(withKey(`/api/art?${q.toString()}`))
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setTextlessArt(d && (d.poster || d.backdrop) ? d : null);
      })
      .catch(() => {
        if (!cancelled) setTextlessArt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [noText, mode, coverItem, withKey]);

  // Búsqueda de plataformas con debounce
  useEffect(() => {
    if (!logoQuery.trim()) {
      setLogoResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          withKey(`/api/providers?q=${encodeURIComponent(logoQuery)}`)
        );
        const data = await res.json();
        setLogoResults(data.results ?? []);
      } catch {
        setLogoResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [logoQuery, withKey]);

  const [isRendering, setIsRendering] = useState(false);

  // Precachear imágenes en background
  useEffect(() => {
    const pathsToCache = imagePaths.slice(0, 30); // Precargar máximo 30
    pathsToCache.forEach((p) => {
      const url = imgUrl(p, config.imageType);
      // Precargar sin esperar
      loadImg(url).catch(() => {
        // Ignorar errores de precacheo
      });
    });
  }, [imagePaths, config.imageType]);

  // Render del preview cada vez que cambia algo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const size = mode === "cover" ? coverCfg : config;
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const drawEmptyMsg = (msg: string) => {
        ctx.fillStyle = "#666";
        ctx.font = `${Math.round(size.width / 50)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(msg, size.width / 2, size.height / 2);
      };

      // Generar clave de caché
      const cacheKey = getCacheKey(
        mode,
        mode === "cover" ? [] : imagePaths,
        mode === "cover" ? coverCfg : config,
        mode === "cover"
          ? { coverType, coverItem: coverItem?.id, logoUrl, noText }
          : {}
      );

      // Verificar si está cacheado
      const cached = canvasCache.get(cacheKey);
      if (cached) {
        const img = new Image();
        img.onload = () => {
          if (!cancelled) {
            ctx.drawImage(img, 0, 0);
            setIsRendering(false);
          }
        };
        img.src = cached;
        return;
      }

      setIsRendering(true);

      if (mode === "cover") {
        const art = noText ? textlessArt : null;
        const path = coverItem
          ? coverType === "backdrop"
            ? art?.backdrop ??
              coverItem.backdrop ??
              art?.poster ??
              coverItem.poster
            : art?.poster ??
              coverItem.poster ??
              art?.backdrop ??
              coverItem.backdrop
          : null;
        const logoSrc = logoUrl.trim() || null;
        const [bgRes, logoRes] = await Promise.allSettled([
          path ? loadImg(imgUrl(path, coverType)) : Promise.reject(),
          logoSrc ? loadImg(logoSrc) : Promise.reject(),
        ]);
        if (cancelled) return;
        const bg = bgRes.status === "fulfilled" ? bgRes.value : null;
        const logo = logoRes.status === "fulfilled" ? logoRes.value : null;
        renderCover(ctx, bg, logo, coverCfg);
        if (!bg)
          drawEmptyMsg("Busca un título o carga un catálogo para el fondo");
      } else {
        const loaded = await Promise.allSettled(
          imagePaths.map((p) => loadImg(imgUrl(p, config.imageType)))
        );
        if (cancelled) return;
        const images = loaded
          .filter(
            (r): r is PromiseFulfilledResult<HTMLImageElement> =>
              r.status === "fulfilled"
          )
          .map((r) => r.value);
        renderMosaic(ctx, images, config);
        if (images.length === 0)
          drawEmptyMsg("Añade títulos desde el buscador para ver el mosaico");
      }

      // Cachear el resultado
      try {
        const dataUrl = canvas.toDataURL("image/png", 0.8);
        canvasCache.set(cacheKey, dataUrl);
      } catch {
        // Ignorar errores de cacheo
      }

      if (!cancelled) setIsRendering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    config,
    imagePaths,
    coverCfg,
    coverType,
    coverItem,
    logoUrl,
    noText,
    textlessArt,
  ]);

  const addItem = (item: SearchItem) => {
    setItems((prev) =>
      prev.some((i) => i.id === item.id && i.mediaType === item.mediaType)
        ? prev
        : [...prev, item]
    );
  };

  const removeItem = (item: SearchItem) => {
    setItems((prev) =>
      prev.filter((i) => !(i.id === item.id && i.mediaType === item.mediaType))
    );
  };

  const addCatalog = () => {
    const url = catalogInput.trim();
    if (!url) return;
    setCatalogUrlList((prev) => (prev.includes(url) ? prev : [...prev, url]));
    setCatalogInput("");
  };

  const loadCatalog = async (
    urls: string[] = catalogUrlList,
    limit: number = catalogLimit,
    exclude: string[] = []
  ) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const q = new URLSearchParams();
      for (const u of urls) q.append("url", u);
      q.set("limit", String(limit));
      const res = await fetch(withKey(`/api/catalog?${q.toString()}`));
      const data = await res.json();
      if (data.error) {
        setCatalogError(data.error);
        return;
      }
      const loaded: SearchItem[] = (data.items ?? []).map(
        (it: { id: string; title: string; poster: string | null; backdrop: string | null }) => ({
          id: it.id,
          mediaType: "catalog" as const,
          title: it.title,
          year: "",
          poster: it.poster,
          backdrop: it.backdrop,
        })
      );
      const excludeSet = new Set(exclude);
      setItems(loaded.filter((it) => !excludeSet.has(String(it.id))));
      setExcluded(exclude);
    } catch {
      setCatalogError("Error de red cargando el catálogo");
    } finally {
      setCatalogLoading(false);
    }
  };

  const shuffle = () =>
    setItems((prev) => {
      const a = [...prev];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });

  const download = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = mode === "cover" ? "portada.png" : "mosaico.png";
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };

  const buildApiUrl = (source: "imgs" | "catalog") => {
    const p = configToParams(config);
    if (source === "imgs") {
      p.set("imgs", imagePaths.join(","));
    } else {
      for (const u of catalogUrlList) p.append("catalog", u);
      p.set("limit", String(catalogLimit));
      if (excluded.length > 0) p.set("exclude", excluded.join(","));
      // Los títulos añadidos a mano (búsqueda TMDB) se suman al catálogo
      const manual = items
        .filter((it) => it.mediaType !== "catalog")
        .map((it) =>
          config.imageType === "backdrop"
            ? it.backdrop ?? it.poster
            : it.poster ?? it.backdrop
        )
        .filter((x): x is string => !!x);
      if (manual.length > 0) p.set("imgs", manual.join(","));
    }
    if (accessKey.trim()) p.set("key", accessKey.trim());
    return `${window.location.origin}/api/render?${p.toString()}`;
  };

  const buildCoverApiUrl = () => {
    const p = coverConfigToParams(coverCfg);
    p.set("type", coverType);
    if (coverSource === "top" && catalogUrlList.length > 0) {
      for (const u of catalogUrlList) p.append("catalog", u);
      p.set("pick", String(coverPick));
    } else if (coverItem) {
      const path =
        coverType === "backdrop"
          ? coverItem.backdrop ?? coverItem.poster
          : coverItem.poster ?? coverItem.backdrop;
      if (path) p.set("img", path);
      p.set("id", String(coverItem.id));
      if (coverItem.mediaType !== "catalog")
        p.set("media", coverItem.mediaType);
    }
    if (noText) p.set("notext", "1");
    if (logoUrl.trim()) p.set("logo", logoUrl.trim());
    if (accessKey.trim()) p.set("key", accessKey.trim());
    return `${window.location.origin}/api/cover?${p.toString()}`;
  };

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  // ---- Importar una imagen ya generada para volver a editarla ----
  const [importInput, setImportInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importOk, setImportOk] = useState(false);

  const importFromUrl = () => {
    setImportError(null);
    setImportOk(false);
    let u: URL;
    try {
      u = new URL(importInput.trim());
    } catch {
      setImportError("Eso no parece una URL válida");
      return;
    }
    const p = u.searchParams;
    const isCover = u.pathname.includes("/api/cover");
    const isRender = u.pathname.includes("/api/render");
    if (!isCover && !isRender) {
      setImportError(
        "Debe ser una URL generada por la app (/api/render o /api/cover)"
      );
      return;
    }
    const key = p.get("key");
    if (key) setAccessKey(key);
    const catalogs = p.getAll("catalog").filter(Boolean);

    if (isCover) {
      setMode("cover");
      setCoverCfg({ ...DEFAULT_COVER_CONFIG, ...coverConfigFromParams(p) });
      setCoverType(p.get("type") === "poster" ? "poster" : "backdrop");
      setNoText(p.get("notext") === "1");
      setLogoUrl(p.get("logo") ?? "");
      if (catalogs.length > 0) {
        setCatalogUrlList(catalogs);
        setCoverSource("top");
        const pick = Math.max(1, Number(p.get("pick")) || 1);
        setCoverPick(pick);
        // El fondo sale de la colección: se cargan los títulos ya mismo
        void loadCatalog(catalogs, Math.max(pick + 5, catalogLimit));
      } else {
        const img = p.get("img");
        if (img) {
          const media = p.get("media");
          setCoverSource("fixed");
          setSelectedCover({
            id: p.get("id") ?? img,
            mediaType:
              media === "movie" || media === "tv" ? media : "catalog",
            title: "Importado desde URL",
            year: "",
            poster: img,
            backdrop: img,
          });
        }
      }
    } else {
      setMode("mosaic");
      setConfig({ ...DEFAULT_CONFIG, ...configFromParams(p) });
      if (catalogs.length > 0) {
        setCatalogUrlList(catalogs);
        const rawLimit = Number(p.get("limit"));
        const limit =
          Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.max(4, Math.min(60, rawLimit))
            : catalogLimit;
        setCatalogLimit(limit);
        const exclude = p.get("exclude");
        const excludeList = exclude
          ? exclude.split(",").filter(Boolean)
          : [];
        setExcluded(excludeList);
        void loadCatalog(catalogs, limit, excludeList);
      }
      // Los paths de ?imgs= entran como títulos manuales de la colección
      const imgs = (p.get("imgs") ?? "").split(",").filter(Boolean);
      if (imgs.length > 0) {
        setItems(
          imgs.map((path, i) => ({
            id: `import-${i}-${path}`,
            mediaType: "movie" as const,
            title: `Importado ${i + 1}`,
            year: "",
            poster: path,
            backdrop: path,
          }))
        );
      }
    }
    setImportOk(true);
    setImportInput("");
    setTimeout(() => setImportOk(false), 2500);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <svg viewBox="0 0 96 96" className="h-6 w-6" aria-hidden="true">
            <g transform="rotate(-8 48 48)">
              <rect x="10" y="12" width="22" height="33" rx="5" fill="#6d28d9" />
              <rect x="10" y="50" width="22" height="33" rx="5" fill="#8b5cf6" />
              <rect x="37" y="21" width="22" height="33" rx="5" fill="#a78bfa" />
              <rect x="37" y="59" width="22" height="33" rx="5" fill="#ec4899" />
              <rect x="64" y="12" width="22" height="33" rx="5" fill="#8b5cf6" />
              <rect x="64" y="50" width="22" height="33" rx="5" fill="#6d28d9" />
            </g>
          </svg>
          mosaiq
        </h1>
        <nav className="ml-4 flex gap-1">
          {(
            [
              ["mosaic", "Mosaico"],
              ["cover", "Portada"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                if (m === "cover") {
                  setCoverCfg(DEFAULT_COVER_CONFIG);
                  setCoverType("backdrop");
                  setCoverSource("top");
                  setCoverPick(1);
                  setSelectedCover(null);
                  setLogoUrl("");
                  setNoText(false);
                } else {
                  setConfig(DEFAULT_CONFIG);
                  setPreset("netflix");
                }
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === m
                  ? "bg-violet-600 text-white"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800/60"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={resetAll}
            title="Limpiar todos los campos y comenzar de nuevo"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800/60 transition-colors"
          >
            Nuevo
          </button>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {(keyRequired || accessKey.trim() !== "") && (
            <>
              {keyRequired && !accessKey.trim() && (
                <span className="text-[11px] text-red-400">
                  Este servidor requiere access key
                </span>
              )}
              <input
                type="password"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="Access key"
                title="Solo hace falta si el servidor define ACCESS_KEY"
                className={`w-36 rounded bg-neutral-900 border px-3 py-1.5 text-xs outline-none focus:border-violet-500 ${
                  keyRequired && !accessKey.trim()
                    ? "border-red-500"
                    : "border-neutral-700"
                }`}
              />
            </>
          )}
          <a
            href="https://github.com/Mangel-CC/mosaiq"
            target="_blank"
            rel="noopener noreferrer"
            title="Ver en GitHub"
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <svg viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-0 min-h-[calc(100vh-53px)]">
        {/* ---- Panel izquierdo: contenido ---- */}
        <aside className="order-2 lg:order-1 border-r border-neutral-800 p-4 space-y-4 lg:overflow-y-auto lg:max-h-[calc(100vh-53px)]">
          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500">
              Editar imagen existente
            </label>
            <div className="mt-1 flex gap-1">
              <input
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") importFromUrl();
                }}
                placeholder="Pega una URL de /api/render o /api/cover"
                className="flex-1 min-w-0 rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-xs outline-none focus:border-violet-500"
              />
              <button
                disabled={!importInput.trim()}
                onClick={importFromUrl}
                className="rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 px-3 py-2 text-xs whitespace-nowrap"
              >
                Cargar
              </button>
            </div>
            {importError && (
              <p className="mt-1 text-xs text-red-400">{importError}</p>
            )}
            {importOk && (
              <p className="mt-1 text-xs text-emerald-400">
                Ajustes importados: sigue editando donde lo dejaste.
              </p>
            )}
            <p className="mt-1 text-[11px] text-neutral-600">
              Restaura todos los ajustes de una imagen generada antes; si usa
              catálogos, los títulos se cargan automáticamente.
            </p>
          </div>

          <div className="border-t border-neutral-800 pt-4">
            <label className="text-xs uppercase tracking-wide text-neutral-500">
              Buscar en TMDB
            </label>
            <div className="relative mt-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Película o serie…"
                className="w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 pr-8 text-sm outline-none focus:border-violet-500"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  title="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
            {searchError && (
              <p className="mt-2 text-xs text-red-400">{searchError}</p>
            )}
            {searching && (
              <p className="mt-2 text-xs text-neutral-500">Buscando…</p>
            )}
          </div>

          {results.length > 0 && (
            <>
              <div
                className={`grid gap-2 ${
                  activeType === "backdrop" ? "grid-cols-2" : "grid-cols-3"
                }`}
              >
                {results.map((r) => {
                  const thumb =
                    activeType === "backdrop" && r.backdrop
                      ? `https://image.tmdb.org/t/p/w300${r.backdrop}`
                      : r.poster
                      ? `https://image.tmdb.org/t/p/w185${r.poster}`
                      : null;
                  const inCollection = items.some(
                    (i) => i.id === r.id && i.mediaType === r.mediaType
                  );
                  const active =
                    mode === "cover"
                      ? selectedCover?.id === r.id &&
                        selectedCover?.mediaType === r.mediaType
                      : inCollection;
                  return (
                    <button
                      key={`${r.mediaType}-${r.id}`}
                      onClick={() => {
                        if (mode === "cover") {
                          setSelectedCover(r);
                          setCoverSource("fixed");
                        } else if (inCollection) {
                          removeItem(r);
                        } else {
                          addItem(r);
                        }
                      }}
                      title={`${r.title} (${r.year})`}
                      className={`relative rounded overflow-hidden border transition-colors bg-neutral-900 ${
                        active
                          ? "border-violet-500"
                          : "border-neutral-800 hover:border-neutral-400"
                      } ${
                        activeType === "backdrop"
                          ? "aspect-video"
                          : "aspect-[2/3]"
                      }`}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={r.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] p-1 block">{r.title}</span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-1 pb-0.5 pt-3 text-left text-[10px] leading-tight text-neutral-200">
                        {r.title}
                        {r.year && ` · ${r.year}`}
                      </span>
                      {active && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] text-white">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-neutral-600">
                {mode === "cover"
                  ? "Haz clic en un resultado para usarlo como fondo de la portada."
                  : "Haz clic para añadir o quitar de la colección."}
              </p>
            </>
          )}

          {mode === "mosaic" && (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wide text-neutral-500">
                Colección ({items.length})
              </label>
              {items.length > 0 && (
                <div className="flex gap-3">
                  {items.length > 1 && (
                    <button
                      onClick={shuffle}
                      className="text-xs text-neutral-400 hover:text-white"
                    >
                      Mezclar
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setItems([]);
                      setExcluded([]);
                    }}
                    title="Quitar todos los títulos"
                    className="text-xs text-neutral-400 hover:text-red-400"
                  >
                    Vaciar
                  </button>
                </div>
              )}
            </div>
            {items.length === 0 ? (
              <p className="mt-2 text-xs text-neutral-600">
                Haz clic en un resultado para añadirlo.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {items.map((it) => (
                  <button
                    key={`${it.mediaType}-${it.id}`}
                    onClick={() => {
                      setItems((prev) =>
                        prev.filter(
                          (p) =>
                            !(p.id === it.id && p.mediaType === it.mediaType)
                        )
                      );
                      if (it.mediaType === "catalog")
                        setExcluded((prev) => [...prev, String(it.id)]);
                    }}
                    title={`Quitar ${it.title}`}
                    className="relative rounded overflow-hidden aspect-[2/3] bg-neutral-900 group"
                  >
                    {it.poster && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrl(it.poster)}
                        alt={it.title}
                        className="w-full h-full object-cover group-hover:opacity-30 transition-opacity"
                      />
                    )}
                    <span className="absolute inset-0 hidden group-hover:flex items-center justify-center text-xs">
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          <div className="border-t border-neutral-800 pt-4">
            <label className="text-xs uppercase tracking-wide text-neutral-500">
              Catálogos dinámicos (Stremio / Nuvio)
            </label>
            <div className="mt-1 flex gap-1">
              <input
                value={catalogInput}
                onChange={(e) => setCatalogInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCatalog();
                }}
                placeholder="https://addon…/catalog/movie/top.json"
                className="flex-1 min-w-0 rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-xs outline-none focus:border-violet-500"
              />
              <button
                disabled={!catalogInput.trim()}
                onClick={addCatalog}
                className="rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 px-3 py-2 text-xs whitespace-nowrap"
              >
                Añadir
              </button>
            </div>
            {catalogUrlList.length > 0 && (
              <ul className="mt-2 space-y-1">
                {catalogUrlList.map((u) => (
                  <li
                    key={u}
                    className="flex items-center gap-2 rounded bg-neutral-900 border border-neutral-800 px-2 py-1.5"
                  >
                    <span
                      className="flex-1 truncate text-[11px] text-neutral-400"
                      title={u}
                    >
                      {u}
                    </span>
                    <button
                      onClick={() =>
                        setCatalogUrlList((prev) =>
                          prev.filter((x) => x !== u)
                        )
                      }
                      title="Quitar catálogo"
                      className="text-neutral-500 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {catalogUrlList.length > 1 && (
              <p className="mt-1 text-[11px] text-neutral-600">
                Los catálogos se mezclan intercalados en el mosaico.
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <label className="text-[11px] text-neutral-500 whitespace-nowrap">
                Máx. títulos
              </label>
              <input
                type="number"
                min={4}
                max={60}
                value={catalogLimit}
                onChange={(e) =>
                  setCatalogLimit(
                    Math.max(4, Math.min(60, Number(e.target.value) || 30))
                  )
                }
                className="w-16 rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-xs"
              />
              <button
                disabled={catalogUrlList.length === 0 || catalogLoading}
                onClick={() => loadCatalog()}
                className="flex-1 rounded bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 px-3 py-1.5 text-xs font-medium"
              >
                {catalogLoading ? "Cargando…" : "Cargar y previsualizar"}
              </button>
            </div>
            {catalogError && (
              <p className="mt-2 text-xs text-red-400">{catalogError}</p>
            )}
            <button
              disabled={catalogUrlList.length === 0}
              onClick={() => copy("catalog", buildApiUrl("catalog"))}
              className="mt-2 w-full rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 px-3 py-2 text-xs"
            >
              {copied === "catalog"
                ? "¡Copiada!"
                : "Copiar URL de imagen dinámica"}
            </button>
            <p className="mt-1 text-[11px] text-neutral-600">
              &quot;Cargar&quot; trae los títulos a la colección con arte limpio de
              TMDB para previsualizar y retocar. La URL dinámica conserva tus
              ajustes, los títulos que quites y los que añadas a mano, y se
              regenera en cada visita: si el catálogo cambia, el fondo se
              actualiza solo.
            </p>
          </div>
        </aside>

        {/* ---- Centro: preview ---- */}
        <section className="order-1 lg:order-2 p-6 flex flex-col gap-3 items-center justify-center">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className={`max-w-full max-h-[70vh] rounded-lg shadow-2xl border border-neutral-800 transition-opacity ${
                isRendering ? "opacity-60" : "opacity-100"
              }`}
              style={{
                aspectRatio:
                  mode === "cover"
                    ? `${coverCfg.width} / ${coverCfg.height}`
                    : `${config.width} / ${config.height}`,
              }}
            />
            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg pointer-events-none">
                <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              </div>
            )}
          </div>
          <p className="text-[11px] text-neutral-600 tabular-nums">
            {mode === "cover"
              ? `${coverCfg.width} × ${coverCfg.height} px`
              : `${config.width} × ${config.height} px`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={download}
              disabled={mode === "cover" ? !coverItem : imagePaths.length === 0}
              title={
                (mode === "cover" ? !coverItem : imagePaths.length === 0)
                  ? "Añade contenido primero"
                  : undefined
              }
              className="rounded bg-violet-600 text-white px-4 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-40"
            >
              Descargar PNG
            </button>
            {mode === "cover" ? (
              <button
                onClick={() => copy("cover", buildCoverApiUrl())}
                disabled={
                  coverSource === "top"
                    ? catalogUrlList.length === 0
                    : !coverItem
                }
                className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700 disabled:opacity-40"
              >
                {copied === "cover" ? "¡Copiada!" : "Copiar URL de API"}
              </button>
            ) : (
              <button
                onClick={() => copy("imgs", buildApiUrl("imgs"))}
                disabled={imagePaths.length === 0}
                className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700 disabled:opacity-40"
              >
                {copied === "imgs" ? "¡Copiada!" : "Copiar URL de API"}
              </button>
            )}
          </div>
        </section>

        {/* ---- Panel derecho: diseño ---- */}
        <aside className="order-3 border-l border-neutral-800 p-4 space-y-4 lg:overflow-y-auto lg:max-h-[calc(100vh-53px)]">
          {mode === "cover" ? (
            <>
              <div>
                <label className="text-xs uppercase tracking-wide text-neutral-500">
                  Fondo
                </label>
                <div className="mt-1 flex gap-1">
                  {(
                    [
                      ["top", "Nº del top"],
                      ["fixed", "Título fijo"],
                    ] as const
                  ).map(([s, label]) => (
                    <button
                      key={s}
                      onClick={() => setCoverSource(s)}
                      className={`flex-1 rounded px-2 py-1.5 text-sm border ${
                        coverSource === s
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-neutral-800 hover:border-neutral-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {coverSource === "top" ? (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-[11px] text-neutral-500 whitespace-nowrap">
                      Posición en el top
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={coverPick}
                      onChange={(e) =>
                        setCoverPick(
                          Math.max(1, Math.min(60, Number(e.target.value) || 1))
                        )
                      }
                      className="w-16 rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-xs"
                    />
                  </div>
                ) : items.length === 0 ? (
                  <p className="mt-2 text-[11px] text-neutral-600">
                    Añade títulos a la colección para elegir uno.
                  </p>
                ) : (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {items.map((it) => {
                      const selected =
                        selectedCover?.id === it.id &&
                        selectedCover?.mediaType === it.mediaType;
                      return (
                        <button
                          key={`${it.mediaType}-${it.id}`}
                          onClick={() => setSelectedCover(it)}
                          title={it.title}
                          className={`relative rounded overflow-hidden aspect-[2/3] bg-neutral-900 border ${
                            selected
                              ? "border-violet-500"
                              : "border-transparent hover:border-neutral-500"
                          }`}
                        >
                          {it.poster && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbUrl(it.poster)}
                              alt={it.title}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {coverItem && (
                  <p className="mt-2 text-[11px] text-neutral-500 truncate">
                    Fondo: {coverItem.title}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-neutral-500">
                  Tipo de imagen
                </label>
                <div className="mt-1 flex gap-1">
                  {(["poster", "backdrop"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setCoverType(t);
                        setCoverCfg((c) => ({
                          ...c,
                          width: t === "poster" ? 1000 : 1920,
                          height: t === "poster" ? 1500 : 1080,
                        }));
                      }}
                      className={`flex-1 rounded px-2 py-1.5 text-sm border ${
                        coverType === t
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-neutral-800 hover:border-neutral-600"
                      }`}
                    >
                      {t === "poster" ? "Poster" : "Backdrop"}
                    </button>
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noText}
                    onChange={(e) => setNoText(e.target.checked)}
                    className="accent-violet-500"
                  />
                  Arte sin texto (textless)
                </label>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-neutral-500">
                  Resolución
                </label>
                <select
                  value={`${coverCfg.width}x${coverCfg.height}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split("x").map(Number);
                    setCoverCfg((c) => ({ ...c, width: w, height: h }));
                  }}
                  className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-2 text-sm"
                >
                  {COVER_RESOLUTIONS.map((r) => (
                    <option key={r.label} value={`${r.w}x${r.h}`}>
                      {r.label}
                    </option>
                  ))}
                  {!COVER_RESOLUTIONS.some(
                    (r) => r.w === coverCfg.width && r.h === coverCfg.height
                  ) && (
                    <option value={`${coverCfg.width}x${coverCfg.height}`}>
                      {coverCfg.width} × {coverCfg.height}
                    </option>
                  )}
                </select>
              </div>

              <Slider label="Zoom fondo" value={coverCfg.bgScale} min={1} max={2} step={0.05} onChange={(v) => setCover("bgScale", v)} />
              <Slider label="Oscurecer" value={coverCfg.darken} min={0} max={1} step={0.05} onChange={(v) => setCover("darken", v)} />
              <Slider label="Viñeta" value={coverCfg.vignette} min={0} max={1} step={0.05} onChange={(v) => setCover("vignette", v)} />
              <Slider label="Fade inferior" value={coverCfg.bottomFade} min={0} max={1} step={0.05} onChange={(v) => setCover("bottomFade", v)} />

              <ColorField
                label="Color de fondo"
                value={coverCfg.bgColor}
                onChange={(v) => setCover("bgColor", v)}
              />

              <div className="border-t border-neutral-800 pt-4">
                <label className="text-xs uppercase tracking-wide text-neutral-500">
                  Placa del logo
                </label>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {(
                    [
                      ["none", "Ninguna"],
                      ["top", "Arriba"],
                      ["bottom", "Abajo"],
                      ["left", "Izquierda"],
                      ["right", "Derecha"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setCover("plate", v)}
                      className={`rounded px-2 py-1.5 text-xs border ${
                        coverCfg.plate === v
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-neutral-800 hover:border-neutral-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {coverCfg.plate !== "none" && (
                  <div className="mt-3 space-y-3">
                    <ColorField
                      label="Color de placa"
                      value={coverCfg.plateColor}
                      onChange={(v) => setCover("plateColor", v)}
                    />
                    <Slider label="Opacidad" value={coverCfg.plateOpacity} min={0} max={1} step={0.05} onChange={(v) => setCover("plateOpacity", v)} />
                    <Slider label="Grosor" value={coverCfg.plateSize} min={0} max={1} step={0.01} onChange={(v) => setCover("plateSize", v)} />
                    {(coverCfg.plate === "left" ||
                      coverCfg.plate === "right") && (
                      <Slider label="Inclinación" value={coverCfg.plateSlant} min={-0.5} max={0.5} step={0.01} onChange={(v) => setCover("plateSlant", v)} />
                    )}
                    <Slider label="Fade del borde" value={coverCfg.plateFade} min={0} max={1} step={0.05} onChange={(v) => setCover("plateFade", v)} />
                    <Slider label="Blur del fondo" value={coverCfg.plateBlur} min={0} max={40} step={1} onChange={(v) => setCover("plateBlur", v)} suffix="px" />
                  </div>
                )}
              </div>

              <div className="border-t border-neutral-800 pt-4">
                <label className="text-xs uppercase tracking-wide text-neutral-500">
                  Logo (PNG)
                </label>
                <input
                  value={logoQuery}
                  onChange={(e) => setLogoQuery(e.target.value)}
                  placeholder="Buscar plataforma (Netflix, Max…)"
                  className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-xs outline-none focus:border-violet-500"
                />
                {logoResults.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {logoResults.map((pr) => (
                      <button
                        key={pr.id}
                        onClick={() => {
                          setLogoUrl(pr.logo);
                          setLogoQuery("");
                        }}
                        title={pr.name}
                        className={`rounded overflow-hidden aspect-video bg-neutral-800/60 border p-1.5 ${
                          logoUrl === pr.logo
                            ? "border-violet-500"
                            : "border-neutral-800 hover:border-neutral-500"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pr.logo}
                          alt={pr.name}
                          className="w-full h-full object-contain"
                        />
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="…o URL pública del logo (PNG)"
                  className="mt-2 w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-xs outline-none focus:border-violet-500"
                />
                {logoUrl.trim() && (
                  <button
                    onClick={() => setLogoUrl("")}
                    className="mt-2 text-xs text-neutral-400 hover:text-white"
                  >
                    Quitar logo
                  </button>
                )}
                <Slider label="Tamaño logo" value={coverCfg.logoScale} min={0.1} max={1} step={0.02} onChange={(v) => setCover("logoScale", v)} />
                <Slider label="Logo X" value={coverCfg.logoX} min={0} max={1} step={0.01} onChange={(v) => setCover("logoX", v)} />
                <Slider label="Logo Y" value={coverCfg.logoY} min={0} max={1} step={0.01} onChange={(v) => setCover("logoY", v)} />
                <Slider label="Rotación logo" value={coverCfg.logoAngle} min={-180} max={180} step={1} onChange={(v) => setCover("logoAngle", v)} suffix="°" />
              </div>

              <div className="border-t border-neutral-800 pt-4">
                <label className="text-xs uppercase tracking-wide text-neutral-500">
                  Texto (p. ej. género)
                </label>
                <input
                  value={coverCfg.text}
                  onChange={(e) => setCover("text", e.target.value)}
                  placeholder="Acción, Comedia, Top películas…"
                  className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-violet-500"
                />
                {coverCfg.text.trim() && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="text-[11px] text-neutral-500">
                        Fuente
                      </label>
                      <select
                        value={coverCfg.textFont}
                        onChange={(e) => setCover("textFont", e.target.value)}
                        className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-2 text-sm"
                        style={{ fontFamily: coverCfg.textFont }}
                      >
                        {TEXT_FONTS.map((f) => (
                          <option key={f} value={f} style={{ fontFamily: f }}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                    <ColorField
                      label="Color de texto"
                      value={coverCfg.textColor}
                      onChange={(v) => setCover("textColor", v)}
                    />
                    <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={coverCfg.textBold}
                        onChange={(e) => setCover("textBold", e.target.checked)}
                        className="accent-violet-500"
                      />
                      Negrita
                    </label>
                    <Slider label="Tamaño texto" value={coverCfg.textSize} min={0.03} max={0.4} step={0.01} onChange={(v) => setCover("textSize", v)} />
                    <Slider label="Texto X" value={coverCfg.textX} min={0} max={1} step={0.01} onChange={(v) => setCover("textX", v)} />
                    <Slider label="Texto Y" value={coverCfg.textY} min={0} max={1} step={0.01} onChange={(v) => setCover("textY", v)} />
                    <Slider label="Rotación texto" value={coverCfg.textAngle} min={-180} max={180} step={1} onChange={(v) => setCover("textAngle", v)} suffix="°" />
                    <Slider label="Sombra" value={coverCfg.textShadow} min={0} max={1} step={0.05} onChange={(v) => setCover("textShadow", v)} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500">
              Preset
            </label>
            <div className="mt-1 grid gap-1">
              {Object.entries(PRESETS).map(([name, p]) => (
                <button
                  key={name}
                  onClick={() => applyPreset(name)}
                  className={`rounded px-3 py-2 text-sm text-left border ${
                    preset === name
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-neutral-800 hover:border-neutral-600"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500">
              Tipo de imagen
            </label>
            <div className="mt-1 flex gap-1">
              {(["poster", "backdrop"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => set("imageType", t)}
                  className={`flex-1 rounded px-2 py-1.5 text-sm border ${
                    config.imageType === t
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-neutral-800 hover:border-neutral-600"
                  }`}
                >
                  {t === "poster" ? "Posters" : "Backdrops"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500">
              Resolución
            </label>
            <select
              value={`${config.width}x${config.height}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split("x").map(Number);
                setConfig((c) => ({ ...c, width: w, height: h }));
              }}
              className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-2 text-sm"
            >
              {RESOLUTIONS.map((r) => (
                <option key={r.label} value={`${r.w}x${r.h}`}>
                  {r.label}
                </option>
              ))}
              {!RESOLUTIONS.some(
                (r) => r.w === config.width && r.h === config.height
              ) && (
                <option value={`${config.width}x${config.height}`}>
                  {config.width} × {config.height}
                </option>
              )}
            </select>
          </div>

          <Slider label="Columnas" value={config.cols} min={3} max={14} step={1} onChange={(v) => set("cols", v)} />
          <Slider label="Separación" value={config.gap} min={0} max={40} step={1} onChange={(v) => set("gap", v)} />
          <Slider label="Rotación" value={config.rotation} min={-30} max={30} step={1} onChange={(v) => set("rotation", v)} suffix="°" />
          <Slider label="Escalonado" value={config.stagger} min={0} max={1} step={0.05} onChange={(v) => set("stagger", v)} />
          <Slider label="Esquinas" value={config.cornerRadius} min={0} max={30} step={1} onChange={(v) => set("cornerRadius", v)} />
          <Slider label="Zoom" value={config.scale} min={0.8} max={1.8} step={0.05} onChange={(v) => set("scale", v)} />
          <Slider label="Oscurecer" value={config.darken} min={0} max={1} step={0.05} onChange={(v) => set("darken", v)} />
          <Slider label="Viñeta" value={config.vignette} min={0} max={1} step={0.05} onChange={(v) => set("vignette", v)} />
          <Slider label="Fade inferior" value={config.bottomFade} min={0} max={1} step={0.05} onChange={(v) => set("bottomFade", v)} />

          <ColorField
            label="Color de fondo"
            value={config.bgColor}
            onChange={(v) => set("bgColor", v)}
          />
            </>
          )}
        </aside>
      </main>
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-neutral-800 border border-neutral-700 px-4 py-2 text-xs shadow-lg">
          URL copiada al portapapeles
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="uppercase tracking-wide text-neutral-500">
          {label}
        </span>
        <span className="text-neutral-400 tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-violet-500"
      />
    </div>
  );
}

// ---- Selector de color propio ----
// Sustituye al <input type="color"> nativo: su diálogo de Chromium puede
// dejar la ventana sin recibir clics al cerrarse. Este popover es HTML
// normal dentro de la página, así que no puede bloquear nada.

function hexToRgbArr(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

// HSV: h 0..360, s 0..100, v 0..100 (el picker es un área saturación/valor)
function hexToHsv(hex: string): [number, number, number] {
  const [r8, g8, b8] = hexToRgbArr(hex);
  const r = r8 / 255,
    g = g8 / 255,
    b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = (((g - b) / d + 6) % 6) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, max === 0 ? 0 : (d / max) * 100, max * 100];
}

function hsvToHex(h: number, s: number, v: number): string {
  s /= 100;
  v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(value);
  // HSV local: conserva el tono aunque el color sea gris/negro (donde la
  // conversión hex→HSV pierde esa información)
  const [hsv, setHsv] = useState<[number, number, number]>(() =>
    hexToHsv(value)
  );
  const ref = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHexDraft(value);
    // Solo re-sincroniza el HSV si el cambio vino de fuera (swatch, hex, rgb)
    setHsv((prev) =>
      hsvToHex(prev[0], prev[1], prev[2]).toLowerCase() === value.toLowerCase()
        ? prev
        : hexToHsv(value)
    );
  }, [value]);

  const commitHsv = (h: number, s: number, v: number) => {
    setHsv([h, s, v]);
    onChange(hsvToHex(h, s, v));
  };

  // Cuentagotas por captura de pantalla: getDisplayMedia congela un
  // fotograma de la pantalla/ventana/pestaña elegida y el píxel se escoge
  // dentro de la app. NO usar la API nativa EyeDropper: en el Chromium/
  // Windows del usuario su overlay invisible queda montado tras elegir el
  // color y bloquea todos los clics del navegador (sobrevive incluso a
  // recargar la página; el abort() del signal tampoco lo desmonta —
  // probado el 2026-07-03).
  const [shot, setShot] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [loupe, setLoupe] = useState<{
    x: number;
    y: number;
    hex: string;
  } | null>(null);
  const shotCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const startPick = async () => {
    if (picking || shot) return;
    if (!navigator.mediaDevices?.getDisplayMedia) return;
    setPicking(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      // Un pequeño margen para que llegue el primer fotograma real
      await new Promise((r) => setTimeout(r, 200));
      const cap = document.createElement("canvas");
      cap.width = video.videoWidth;
      cap.height = video.videoHeight;
      cap.getContext("2d")?.drawImage(video, 0, 0);
      // La captura ya está congelada: se corta la compartición al instante
      stream.getTracks().forEach((t) => t.stop());
      shotCanvasRef.current = cap;
      setShot(cap.toDataURL());
    } catch {
      // usuario canceló el diálogo de compartir
    } finally {
      setPicking(false);
    }
  };

  const readShotPixel = (
    e: { clientX: number; clientY: number; currentTarget: EventTarget }
  ): string | null => {
    const img = e.currentTarget as HTMLImageElement;
    const cap = shotCanvasRef.current;
    if (!cap) return null;
    const r = img.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * cap.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * cap.height);
    const d = cap
      .getContext("2d")
      ?.getImageData(
        Math.max(0, Math.min(cap.width - 1, x)),
        Math.max(0, Math.min(cap.height - 1, y)),
        1,
        1
      ).data;
    return d ? rgbToHex(d[0], d[1], d[2]) : null;
  };

  const closeShot = useCallback(() => {
    setShot(null);
    setLoupe(null);
    shotCanvasRef.current = null;
  }, []);

  useEffect(() => {
    if (!shot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeShot();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [shot, closeShot]);

  const dragHandler =
    (el: React.RefObject<HTMLDivElement | null>, apply: (fx: number, fy: number) => void) =>
    (e: React.PointerEvent) => {
      const move = (ev: { clientX: number; clientY: number }) => {
        const r = el.current?.getBoundingClientRect();
        if (!r) return;
        const fx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        const fy = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
        apply(fx, fy);
      };
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {
        // pointerId no activo (p. ej. eventos sintéticos): el drag sigue
        // funcionando vía listeners de window
      }
      move(e);
      const onMove = (ev: PointerEvent) => move(ev);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

  useEffect(() => {
    // Mientras se usa el cuentagotas no se cierra el popover, para que el
    // clic sobre la captura no lo descarte
    if (!open || picking || shot) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, picking, shot]);

  const [h, s, v] = hsv;
  const [r, g, b] = hexToRgbArr(value);

  const setChannel = (idx: number, raw: string) => {
    const n = Math.max(0, Math.min(255, Number(raw) || 0));
    const rgb: [number, number, number] = [r, g, b];
    rgb[idx] = n;
    onChange(rgbToHex(...rgb));
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wide text-neutral-500">
          {label}
        </label>
        <button
          onClick={() => setOpen((o) => !o)}
          title={value}
          className="h-8 w-14 rounded border border-neutral-700 cursor-pointer"
          style={{ backgroundColor: value }}
        />
      </div>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-2xl space-y-3">
          {/* Área saturación/valor */}
          <div
            ref={svRef}
            onPointerDown={dragHandler(svRef, (fx, fy) =>
              commitHsv(h, fx * 100, (1 - fy) * 100)
            )}
            className="relative h-32 w-full rounded cursor-crosshair touch-none select-none"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))`,
            }}
          >
            <span
              className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
              style={{
                left: `${s}%`,
                top: `${100 - v}%`,
                backgroundColor: value,
              }}
            />
          </div>
          {/* Barra de tono */}
          <div
            ref={hueRef}
            onPointerDown={dragHandler(hueRef, (fx) =>
              commitHsv(fx * 360, s, v)
            )}
            className="relative h-3 w-full rounded-full cursor-pointer touch-none select-none"
            style={{
              background:
                "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
            }}
          >
            <span
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
              style={{
                left: `${(h / 360) * 100}%`,
                backgroundColor: `hsl(${h}, 100%, 50%)`,
              }}
            />
          </div>
          {/* Campos RGB */}
          <div className="flex gap-2">
            {([
              ["R", r, 0],
              ["G", g, 1],
              ["B", b, 2],
            ] as const).map(([ch, val, idx]) => (
              <label key={ch} className="flex-1">
                <span className="block text-center text-[10px] uppercase text-neutral-500">
                  {ch}
                </span>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={val}
                  onChange={(e) => setChannel(idx, e.target.value)}
                  className="w-full rounded bg-neutral-950 border border-neutral-700 px-1.5 py-1 text-center text-xs tabular-nums outline-none focus:border-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-6 w-6 rounded border border-neutral-700 shrink-0"
              style={{ backgroundColor: value }}
            />
            <input
              value={hexDraft}
              onChange={(e) => {
                const v = e.target.value;
                setHexDraft(v);
                if (/^#[0-9a-f]{6}$/i.test(v.trim())) onChange(v.trim());
              }}
              spellCheck={false}
              className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1 text-xs font-mono outline-none focus:border-neutral-500"
            />
            <button
              onClick={startPick}
              title="Cuentagotas: elegir un color del preview"
              className={`shrink-0 rounded border p-1.5 ${
                picking
                  ? "border-violet-500 text-violet-400"
                  : "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
              }`}
            >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m2 22 1-1h3l9-9" />
                  <path d="M3 21v-3l9-9" />
                  <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
                </svg>
            </button>
          </div>
          {picking && (
            <p className="text-[11px] text-violet-400">
              Elige qué pantalla, ventana o pestaña compartir…
            </p>
          )}
        </div>
      )}
      {/* Overlay de captura: elegir el píxel sobre el fotograma congelado */}
      {shot && (
        <div className="fixed inset-0 z-[100] bg-black/85 flex flex-col items-center justify-center gap-3 p-6">
          <p className="text-xs text-neutral-300">
            Haz clic en la captura para tomar el color · Esc cancela
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot}
            alt="Captura de pantalla para elegir color"
            draggable={false}
            className="max-w-full max-h-[80vh] rounded border border-neutral-700 cursor-crosshair select-none"
            onMouseMove={(e) => {
              const hex = readShotPixel(e);
              if (hex) setLoupe({ x: e.clientX, y: e.clientY, hex });
            }}
            onMouseLeave={() => setLoupe(null)}
            onClick={(e) => {
              const hex = readShotPixel(e);
              if (hex) onChange(hex);
              closeShot();
            }}
          />
          <button
            onClick={closeShot}
            className="rounded bg-neutral-800 hover:bg-neutral-700 px-4 py-1.5 text-xs"
          >
            Cancelar
          </button>
          {loupe && (
            <div
              className="pointer-events-none fixed z-[101] flex items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-900/95 px-2 py-1 shadow-xl"
              style={{ left: loupe.x + 14, top: loupe.y + 14 }}
            >
              <span
                className="h-4 w-4 rounded border border-neutral-500"
                style={{ backgroundColor: loupe.hex }}
              />
              <span className="text-[11px] font-mono text-neutral-200">
                {loupe.hex}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
