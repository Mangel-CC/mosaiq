<p align="center">
  <img src="public/logo.svg" alt="mosaiq" width="300" />
</p>

A self-hosted asset and cover generator for Stremio, Nuvio, and Plex. Composites TMDB posters into dynamic mosaics, wallpapers, and covers with configurable presets. mosaiq is compatible with **Nuvio, Stremio addons, AIOMetadata, Bingecat, Plex, Jellyfin**, and any application that can pass TMDB IDs.

Those not self-hosting can [visit the public instance.](https://mosaiq.mangelcc.dev)

---

## Showcase

<p align="center">
  <img src="showcase/mosaic.png" width="48%"/>
  <img src="showcase/cover.png" width="48%"/>
</p>

---

## Features

- **Multiple presets** - Netflix-style tilted mosaic, grid layout, backdrop collage, and custom configurations. Each preset is fully customizable with 15+ parameters.

- **Dynamic catalog support** - load covers from Stremio/Nuvio catalog URLs (top movies, new releases, by genre). Mosaics auto-update when the source catalog changes.

- **Cover generation** - create portrait/landscape covers with poster backgrounds, metadata overlays, platform logos, and custom text. Ideal for Nuvio headers.

- **Wallpaper export** - generate high-resolution wallpapers (up to 4K) from any collection, perfect for Jellyfin/Plex hero imagery or Nuvio backdrops.

- **Web configurator** - browser-based UI to tune every parameter (columns, gap, rotation, corner radius, zoom, filters, overlays) with real-time preview. Export a ready-to-use URL template.

- **REST API** - generate assets dynamically via HTTP. Pass TMDB poster paths, catalog URLs, and config params; receive PNG at any resolution.

- **TMDB integration** - search for movies and series directly in the editor. Posters and backdrops fetched from TMDB with metadata support.

- **High-performance rendering** - serverless Canvas rendering with aggressive caching. Repeat requests served from cache; first render is background-optimized.

- **Responsive editor** - desktop, tablet, and mobile support. On mobile, canvas previews first, followed by detailed controls.

---

## Self-Hosted Requirements

- Docker
- A free [TMDB API key](https://www.themoviedb.org/settings/api) for poster fetching and metadata.
- (Optional) An [AIOMetadata](https://github.com/cedya77/aiometadata) instance if using external metadata aggregation. Plex and Jellyfin don't require this.

---

## Quick Start

### Using Docker (recommended)

Create a `compose.yaml`:

```yaml
services:
  mosaiq:
    image: ghcr.io/mangelcc/mosaiq:latest
    ports:
      - "3000:3000"
    restart: unless-stopped
    volumes:
      - ./mosaiq-cache:/app/.next/cache
    environment:
      - TMDB_API_KEY=your_tmdb_key
      - NODE_ENV=production
      # (Optional) For AIOMetadata proxy protection:
      # - ACCESS_KEY=yoursecretkey
```

Start it:

```bash
docker compose up -d
```

Open `http://localhost:3000` to configure.

### Building from source

```bash
git clone https://github.com/mangelcc/mosaiq.git
cd mosaiq
cp .env.example .env   # fill in TMDB_API_KEY
npm install
npm run dev            # http://localhost:3000
npm run build && npm start  # production
```

---

## Configuration

All configuration is done via environment variables or the web UI.

| Variable | Default | Description |
|---|---|---|
| `TMDB_API_KEY` | - | TMDB API key for poster/metadata fetching (required) |
| `NODE_ENV` | development | Set to `production` for serverless deployment |
| `ACCESS_KEY` | - | Optional shared secret for API authentication. Leave blank for open access. |
| `NEXT_PUBLIC_API_BASE` | `/api` | Base URL for API calls (change if behind a proxy) |

All other parameters (mosaic columns, gap, rotation, filters, overlays) are configured via the web UI or passed as query parameters to the REST API.

---

## URL Structure

Assets are generated dynamically via REST endpoints:

### Mosaic endpoint

```
GET /api/render?preset=netflix&w=1920&h=1080&cols=8&imgs=/path1,/path2,/path3
```

**Parameters:**
- `preset` - `netflix` | `grid` | `backdrops`
- `type` - `poster` | `backdrop`
- `w`, `h` - output width and height
- `cols` - number of columns
- `gap` - gap between tiles
- `rot` - rotation in degrees
- `stagger` - stagger offset (0–1)
- `radius` - corner radius
- `darken` - overlay darkness (0–1)
- `vignette` - vignette effect (0–1)
- `fade` - bottom fade (0–1)
- `scale` - zoom level
- `bg` - background color (hex, no #)
- `imgs` - comma-separated TMDB poster paths
- `catalog` - URL to Stremio/Nuvio catalog (alternative to `imgs`)
- `limit` - max catalog items to render
- `key` - `ACCESS_KEY` if protected

**Example:**

```
/api/render?preset=netflix&w=1920&h=1080&catalog=https://v3-cinemeta.strem.io/catalog/movie/top.json&limit=30
```

### Cover endpoint

```
GET /api/cover?w=1000&h=1500&type=poster&img=/path&logo=https://logo.png&text=Genre
```

**Parameters:** width, height, poster/backdrop, background image, logo URL, text overlay, text styling.

---

## Architecture

```
mosaiq/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── render      # PNG mosaic generation
│   │   │   ├── cover       # Portrait/landscape covers
│   │   │   ├── search      # TMDB proxy
│   │   │   ├── catalog     # Catalog aggregator
│   │   │   ├── providers   # Platform logos
│   │   │   └── art         # Textless art fallback
│   │   ├── page.tsx        # Editor UI
│   │   └── layout.tsx      # Root layout
│   └── lib/
│       ├── mosaic.ts       # Rendering engine (Canvas)
│       ├── cover.ts        # Cover generator
│       ├── catalog.ts      # Catalog parser
│       └── tmdb.ts         # TMDB client
├── public/
│   └── logo.svg            # Branding
└── docker-compose.yml
```

**Tech stack:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + @napi-rs/canvas (Node rendering)

The render engine is **pure Canvas 2D**, ensuring identical output between browser preview and serverless API.

---

## Deployment

### Vercel (recommended for most users)

```bash
npx vercel
```

Vercel auto-detects Next.js. Set `TMDB_API_KEY` in Project Settings > Environment Variables. Zero-config, scales to 2K+ concurrent users.

### Self-hosted (Docker on DigitalOcean / AWS / etc)

See the Quick Start section above. With Docker, you have full control over resources and can self-host indefinitely for ~$5–10/month.

### Cloudflare (via subdomain)

To point `mosaiq.yourdomain.com` to your deployment:

1. **Cloudflare Dashboard** → DNS
2. Add CNAME record:
   - Name: `mosaiq`
   - Target: `vercel.com` (or your host)
   - Proxied: ☑️ Orange cloud
3. In Vercel/Netlify project settings, add domain `mosaiq.yourdomain.com`

SSL is automatic with Cloudflare's orange cloud.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Support & Donate

If mosaiq is useful to you, consider supporting development:

- ⭐ Star the repo
- 💬 [Report bugs](https://github.com/mangelcc/mosaiq/issues) & suggest features
- ☕ [Ko-fi](https://ko-fi.com/mangelcc)
- 💪 [GitHub Sponsors](https://github.com/sponsors/mangelcc)
- 💻 [Contribute code](https://github.com/mangelcc/mosaiq/pulls)

Donations help maintain the public instance and accelerate feature development.

---

## License

[MIT License](LICENSE) — Use freely for personal and commercial purposes.

---

## Credits

- **TMDB** for poster and metadata access
- **Stremio** and **Nuvio** for catalog format inspiration
- **Next.js** and **Tailwind** for the foundation
- **Community** for feedback and contributions
