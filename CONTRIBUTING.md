# Contributing to mosaiq

¡Gracias por tu interés en contribuir! Aquí encontrarás las pautas para participar.

## Cómo empezar

1. **Fork** el repositorio
2. **Clone** tu fork:
   ```bash
   git clone https://github.com/tu-usuario/mosaiq.git
   cd mosaiq
   ```
3. **Crea una rama** para tu feature o fix:
   ```bash
   git checkout -b feature/tu-feature-aqui
   ```
4. **Instala dependencias**:
   ```bash
   npm install
   echo "TMDB_API_KEY=tu_key" > .env.local
   npm run dev
   ```

## Hacer cambios

- Lee el código existente para entender el patrón
- Mantén los cambios **focalizados** en un aspecto
- Prueba localmente antes de hacer push
- Sin cambios de formato o estilo en el mismo PR

## Tipos de contribuciones

### 🐛 Bugs
- Abre un [Issue](https://github.com/mangelcc/mosaiq/issues) describiendo:
  - Qué esperabas
  - Qué sucedió
  - Pasos para reproducir
  - Screenshot/video si aplica

### ✨ Features
- Discute la idea primero en [Discussions](https://github.com/mangelcc/mosaiq/discussions)
- Implementa con pruebas si es posible
- Actualiza el README si es necesario

### 📚 Docs
- Mejoras al README, CONTRIBUTING, etc.
- Claridad y ejemplos son bienvenidos

## Commits

```bash
# ✓ Bien
git commit -m "Add dark mode toggle"
git commit -m "Fix canvas rendering on mobile"

# ✗ Evita
git commit -m "updates"
git commit -m "fix bug"
```

## Pull Requests

1. **Actualiza** desde `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
2. **Push** a tu rama
3. **Abre un PR** con:
   - Título claro
   - Descripción del cambio y por qué
   - Screenshots si es UI
   - Ref a issues relacionados (#123)

## Stack técnico

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Backend**: Node.js, Canvas (@napi-rs/canvas)
- **APIs**: TMDB v3/v4, Stremio/Nuvio catalogs
- **Datos**: Nada se guarda; todo es state + localStorage

## Estructura de directorios

```
src/
├── app/
│   ├── api/          # Rutas serverless
│   ├── page.tsx      # Editor interactivo
│   └── layout.tsx    # Layout raíz
└── lib/
    ├── mosaic.ts     # Motor de renderizado
    ├── cover.ts      # Portadas
    ├── catalog.ts    # Catálogos
    └── tmdb.ts       # Cliente TMDB
```

## Preguntas frecuentes

**¿Cómo subo una feature grande?**
- Abre una Draft PR pronto
- Actualiza regularmente con feedback
- Los mantenedores hacen seguimiento

**¿Qué licencia usan mis cambios?**
- MIT, igual que el proyecto
- Al hacer PR aceptas estas condiciones

**¿Cómo reporyo vulnerabilidades?**
- **NO** abras un issue público
- Contacta a [@mangelcc](https://github.com/mangelcc) directamente

---

**¡Gracias nuevamente!** 🙌
