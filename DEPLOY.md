# Guía de despliegue de mosaiq

## 📊 Análisis de opciones

| Opción | Costo | Usuarios activos | Setup | Escalabilidad | Límites |
|--------|-------|------------------|-------|---------------|---------| 
| **Vercel** (recomendado) | $0-20/mes | hasta 1K | 2 min | Automática | 10s timeout, 512MB |
| **Netlify** | $0-19/mes | hasta 500 | 2 min | Manual | 10s timeout, muy tight |
| **Docker** (AWS/DigitalOcean) | $5-40/mes | hasta 5K+ | 15 min | Manual | Limitado por servidor |
| **GitHub Pages** | Gratis | static only | 5 min | No | Solo HTML/JS |

---

## 🚀 Opción 1: Vercel (MEJOR OPCIÓN)

### Por qué Vercel

- **Zero-config** para Next.js
- Soporta serverless functions con **60s timeout** (vs 10s en Netlify)
- Auto-scaling incluido
- Preview automático en cada PR
- Caching inteligente

### Despliegue

```bash
# Opción A: CLI
npm i -g vercel
vercel

# Opción B: GitHub integration
# 1. Ve a vercel.com/new
# 2. Conecta tu repo de GitHub
# 3. Vercel se auto-configura
# 4. Establece TMDB_API_KEY en Project Settings > Environment Variables
```

### Rendimiento esperado

- **Tiempo de respuesta**: ~200ms en preview, ~100ms en caché
- **Usuarios concurrentes**: 1K+ sin problemas (auto-scaling)
- **Costo**: Gratis hasta 150GB/mes; luego $0.50/GB

---

## 💰 Opción 2: Netlify + Amazon Lambda + Cloudflare

Si quieres mantener Netlify pero escalar:

```toml
# netlify.toml - configuración avanzada
[build]
command = "npm run build"
publish = ".next"

# Usa Netlify Functions solo para cosas ligeras
# Renderizado pesado → Cloudflare Workers

[functions]
node_bundler = "esbuild"
```

### Con Cloudflare Workers para renderizado

```javascript
// wrangler.toml
name = "mosaiq-render"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.production]
routes = [
  { pattern = "mosaiq.mangelcc.dev/api/render*", zone_id = "..." }
]
```

**Ventaja**: Cloudflare tiene **30s timeout** y global edge network (latencia 10ms en cualquier parte del mundo)

---

## 🐳 Opción 3: Docker (Autohospedado)

Para máxima flexibilidad y control de costos.

### Setup en DigitalOcean App Platform

```bash
# 1. Crear app.yaml
cat > app.yaml << 'EOF'
name: mosaiq
services:
- name: api
  github:
    branch: main
    repo: tu-usuario/mosaiq
  build_command: npm run build
  run_command: npm start
  http_port: 3000
  envs:
  - key: TMDB_API_KEY
    scope: RUN_TIME
    value: ${TMDB_API_KEY}
EOF

# 2. Deploy
doctl apps create --spec app.yaml
```

### Setup en AWS EC2 (más barato)

```bash
# Instancia t3.micro + docker
ssh ubuntu@tu-instance.compute.amazonaws.com

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Clonar y levantar
git clone https://github.com/tu-usuario/mosaiq.git
cd mosaiq
export TMDB_API_KEY=tu_key
docker-compose up -d

# Nginx reverse proxy
sudo apt install nginx
# Configurar nginx como proxy → localhost:3000
```

**Costo**: t3.micro ($5-8/mes) + elastic IP ($0-5)

**Usuarios activos**: ~500 (CPU-bound en renderizado Canvas)

---

## 🌍 Subdominio en Cloudflare

Para apuntar `mosaiq.mangelcc.dev` a tu despliegue:

### Paso 1: Agregar CNAME en Cloudflare

```
Name: mosaiq
Type: CNAME
Target: vercel.com (o tu-dominio.netlify.app, o tu-ip-aws.com)
TTL: Auto
Proxied: ☑️ (Cloudflare orange cloud)
```

### Paso 2: Configurar en Vercel/Netlify

**Vercel:**
1. Project Settings > Domains
2. Agregar `mosaiq.mangelcc.dev`
3. Vercel te da los nameservers
4. En Cloudflare, apunta el CNAME

**Netlify:**
1. Site settings > Domain management
2. Add domain > `mosaiq.mangelcc.dev`
3. Seguir instrucciones

### Paso 3: SSL (automático)

Cloudflare genera certificado SSL gratuito si está proxied (orange cloud).

---

## 💳 Integración de donaciones

Para mantener la instancia pública visible:

### Opción A: Ko-fi (más sencillo)

```html
<!-- Botón en footer de página web -->
<a href="https://ko-fi.com/mangelcc" target="_blank">
  ☕ Apoya mosaiq en Ko-fi
</a>
```

Comisión: 5% de transacciones. Payout mínimo: $5.

### Opción B: GitHub Sponsors (mejor para desarrolladores)

1. Habilita en tu perfil GitHub: Settings > Sponsors
2. Link: `github.com/sponsors/mangelcc`
3. Comisión: 0% (GitHub la absorbe)

### Opción C: Stripe Checkout (más profesional)

```bash
npm install stripe
```

```javascript
// api/donations/route.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { amount } = await req.json();
  
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: 'Apoyo a mosaiq' },
        unit_amount: amount * 100,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${process.env.DOMAIN}/gracias`,
    cancel_url: `${process.env.DOMAIN}/`,
  });
  
  return Response.json({ url: session.url });
}
```

**Comisión Stripe**: 2.9% + $0.30 USD

---

## 📈 Monitoreo y alertas

### Vercel Analytics (gratuito)

```bash
npm install @vercel/analytics
```

```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### Sentry para errores

```bash
npm install @sentry/nextjs
```

```typescript
// Detecta y reporta crashes en serverless
```

---

## 🎯 Recomendación final

**Para empezar**: **Vercel** (gratuito, escalable, Next.js nativo)
**Si crece mucho**: **Vercel** + **Cloudflare Workers** para renderizado pesado
**Si quieres controlar costos**: **Docker en DigitalOcean** ($10/mes)
**Donaciones**: **GitHub Sponsors** (sin comisión) + **Ko-fi** (fácil para usuarios)

---

## 🔒 Variables de entorno

Sea cual sea tu opción, necesitas:

```env
TMDB_API_KEY=tu_key_tmdb          # Obligatorio
NODE_ENV=production               # Para Vercel/Netlify

# Opcional (para autenticación de API)
ACCESS_KEY=tu_key_secreto
```

---

¿Dudas? Abre un [Issue](https://github.com/mangelcc/mosaiq/issues) o [Discussion](https://github.com/mangelcc/mosaiq/discussions).
