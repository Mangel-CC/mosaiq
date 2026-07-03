<p align="center">
  <img src="public/logo.svg" alt="mosaiq" width="300" />
</p>

<p align="center">
  <strong>Generador de covers y assets para Nuvio y Stremio</strong><br />
  Crea fondos tipo mosaico, portadas y assets de alta resolución con posters de TMDB
</p>

<p align="center">
  <a href="https://github.com/mangelcc/mosaiq/releases"><img src="https://img.shields.io/github/v/release/mangelcc/mosaiq?style=flat-square" alt="Release" /></a>
  <a href="https://github.com/mangelcc/mosaiq/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mangelcc/mosaiq?style=flat-square" alt="License" /></a>
  <a href="https://github.com/mangelcc/mosaiq/stargazers"><img src="https://img.shields.io/github/stars/mangelcc/mosaiq?style=flat-square" alt="Stars" /></a>
</p>

---

## ✨ Características

- **🎨 Editor visual**: interfaz intuitiva para diseñar fondos y portadas en tiempo real
- **🎬 Integración TMDB**: búsqueda directa de películas y series con artwork de alta calidad
- **📦 Catálogos dinámicos**: carga mosaicos desde URLs de Stremio/Nuvio (top, nuevas, géneros, etc)
- **🎯 Múltiples presets**: Mosaico inclinado (Netflix), Grid recto, Collage de backdrops
- **📱 Responsive**: desktop, tablet y móvil
- **⚙️ Control total**: 15+ parámetros ajustables (columnas, rotación, viñeta, zoom, esquinas, etc)
- **💾 Descarga PNG**: exporta a cualquier resolución (1080p, 1440p, 4K, banner)
- **🌐 API REST**: genera assets dinámicamente desde URLs
- **⚡ Renderizado servidor**: same-pixel rendering entre preview del navegador y servidor

---

## 🚀 Despliegue local

### Requisitos
- Node.js 18+
- TMDB API Key (v3 o v4) — obtén una en [tmdb.org/settings/api](https://www.themoviedb.org/settings/api)

### Instalación

```bash
git clone https://github.com/mangelcc/mosaiq.git
cd mosaiq
npm install
```

### Desarrollo

```bash
echo "TMDB_API_KEY=tu_key_aqui" > .env.local
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

### Build para producción

```bash
npm run build
npm start
```

---

## 🔌 API REST

### Generar mosaico

```
GET /api/render?preset=netflix&w=1920&h=1080&cols=8&gap=14&rot=-10&imgs=/path1,/path2,/path3
```

**Parámetros principales:**
- `preset` — `netflix` | `grid` | `backdrops`
- `type` — `poster` | `backdrop`
- `w`, `h` — ancho y alto en píxeles
- `cols` — número de columnas
- `gap` — separación entre elementos
- `rot` — rotación en grados
- `stagger` — escalonado (0–1)
- `radius` — esquinas redondeadas
- `darken` — oscurecimiento (0–1)
- `vignette` — viñeta (0–1)
- `fade` — fade inferior (0–1)
- `scale` — zoom (0.8–1.8)
- `bg` — color de fondo (hex sin #)
- `limit` — máximo de imágenes

**Ejemplo con catálogo dinámico:**

```
/api/render?preset=netflix&w=1920&h=1080&catalog=https://v3-cinemeta.strem.io/catalog/movie/top.json&limit=30
```

### Generar portada

```
GET /api/cover?w=1000&h=1500&type=poster&img=/path&logo=https://logo.png&text=Acción
```

---

## 🏗️ Arquitectura

```
mosaiq/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── render        # Renderizado PNG (Canvas Node)
│   │   │   ├── search        # Proxy TMDB
│   │   │   ├── catalog       # Agregador de catálogos
│   │   │   ├── providers     # Logos de plataformas
│   │   │   └── art           # Arte sin texto (textless)
│   │   ├── page.tsx          # Editor interactivo
│   │   └── layout.tsx        # Root layout
│   └── lib/
│       ├── mosaic.ts         # Motor de renderizado (Canvas 2D)
│       ├── cover.ts          # Motor de portadas
│       ├── catalog.ts        # Agregador de Stremio/Nuvio
│       └── tmdb.ts           # Cliente TMDB
├── public/
│   └── logo.svg              # Branding
└── docker-compose.yml        # Deploy local
```

**Motor:** Next.js 16 (App Router) + Tailwind + @napi-rs/canvas para Node

El motor de renderizado es **puro Canvas 2D** — funciona igual en el navegador y en Node, garantizando pixel-perfect rendering entre preview y API.

---

## 🛠️ Desarrollo

### Stack

- **Framework**: Next.js 16
- **Styling**: Tailwind CSS 4
- **Renderizado**: Canvas 2D (@napi-rs/canvas en servidor)
- **API**: TMDB v3/v4
- **Despliegue**: Vercel, Netlify, Docker

### Primeros pasos

1. Fork el repo
2. Crea una rama: `git checkout -b feature/tu-feature`
3. Commit: `git commit -am 'Añade tu feature'`
4. Push: `git push origin feature/tu-feature`
5. Abre un PR

### Roadmap

- [ ] Drag-and-drop para reordenar colección
- [ ] Secciones colapsables en panel Portada
- [ ] Exportar a WebP y AVIF
- [ ] Historial de diseños (LocalStorage)
- [ ] Plantillas de portadas
- [ ] Integración Radarr/Sonarr
- [ ] Dark mode automático en portadas

---

## 🌐 Despliegue

### Netlify (recomendado para empezar)

1. Conecta el repo a Netlify
2. Build: `npm run build`
3. Publish: `.next`
4. Variables de entorno: `TMDB_API_KEY`
5. **Limitación**: Netlify Functions timea en 10s; con imágenes grandes puede fallar. Para producción, usa Vercel o Docker.

### Vercel (óptimo)

```bash
npx vercel
```

Detecta automáticamente Next.js. Zero-config, unlimited serverless functions.

### Docker (autohospedado)

```bash
docker-compose up -d
# http://localhost:3000
```

**Para producción con volumen de usuarios:**

```yaml
version: '3.9'
services:
  mosaiq:
    image: node:18
    working_dir: /app
    command: npm start
    ports:
      - "3000:3000"
    environment:
      TMDB_API_KEY: ${TMDB_API_KEY}
      NODE_ENV: production
    volumes:
      - .:/app
```

---

## 💰 Soporte y donaciones

Si mosaiq te resulta útil, considera apoyar el proyecto:

- [Ko-fi](https://ko-fi.com/mangelcc)
- [Buy Me A Coffee](https://buymeacoffee.com/mangelcc)
- [GitHub Sponsors](https://github.com/sponsors/mangelcc)

Las donaciones ayudan a mantener el servidor público en **mosaiq.mangelcc.dev** y acelerar el desarrollo.

---

## 📝 Licencia

MIT — Libre para uso personal y comercial.

---

## 🙏 Créditos

- **TMDB** por el acceso a datos y artwork
- **Stremio** y **Nuvio** por los catálogos
- **Next.js** y **Tailwind** por el stack
- **Community** por los aportes y feedback

---

## 📬 Contacto

- GitHub: [@mangelcc](https://github.com/mangelcc)
- Issues: [Reporta bugs aquí](https://github.com/mangelcc/mosaiq/issues)
- Discussions: [Comparte ideas aquí](https://github.com/mangelcc/mosaiq/discussions)

