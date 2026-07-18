// Traducciones de la interfaz. El motor de render (canvas) no lleva texto de
// UI; aquí solo están las cadenas visibles del editor.

export type Lang = "es" | "en";

export interface Dict {
  // Cabecera
  mosaic: string;
  cover: string;
  newBtn: string;
  newBtnTitle: string;
  accessKeyRequired: string;
  accessKeyTitle: string;
  viewGithub: string;
  // Importar
  importTitle: string;
  importPlaceholder: string;
  importLoad: string;
  importInvalidUrl: string;
  importNotApp: string;
  importOk: string;
  importHelp: string;
  // Buscar
  searchTmdb: string;
  searchPlaceholder: string;
  clearSearch: string;
  searching: string;
  searchNetErr: string;
  resultHelpCover: string;
  resultHelpMosaic: string;
  // Colección
  collection: string;
  shuffle: string;
  clear: string;
  clearAllTitle: string;
  emptyCollection: string;
  remove: string;
  // Catálogos
  catalogsTitle: string;
  add: string;
  removeCatalog: string;
  catalogsMixed: string;
  maxTitles: string;
  loading: string;
  loadPreview: string;
  copyDynamic: string;
  catalogHelp: string;
  catalogNetErr: string;
  // Canvas / acciones
  emptyCover: string;
  emptyMosaic: string;
  addContentFirst: string;
  downloadPng: string;
  copyApiUrl: string;
  copied: string;
  urlCopied: string;
  // Portada
  background: string;
  topNum: string;
  fixedTitle: string;
  positionInTop: string;
  addToPick: string;
  imageType: string;
  textlessArt: string;
  resolution: string;
  bgZoom: string;
  darken: string;
  vignette: string;
  bottomFade: string;
  bgColor: string;
  // Placa
  logoPlate: string;
  plateNone: string;
  plateTop: string;
  plateBottom: string;
  plateLeft: string;
  plateRight: string;
  plateColor: string;
  opacity: string;
  thickness: string;
  slant: string;
  edgeFade: string;
  bgBlur: string;
  // Logo
  logoPng: string;
  searchPlatform: string;
  orLogoUrl: string;
  removeLogo: string;
  logoSize: string;
  logoX: string;
  logoY: string;
  logoRotation: string;
  // Texto
  textLabel: string;
  textPlaceholder: string;
  font: string;
  textColor: string;
  bold: string;
  textSize: string;
  textX: string;
  textY: string;
  textRotation: string;
  shadow: string;
  // Mosaico
  preset: string;
  presetNetflix: string;
  presetGrid: string;
  presetBackdrops: string;
  posters: string;
  backdrops: string;
  columns: string;
  gap: string;
  rotation: string;
  stagger: string;
  corners: string;
  zoom: string;
  // Cuentagotas
  eyedropperTitle: string;
  eyedropperSharing: string;
  shotHelp: string;
  shotAlt: string;
  cancel: string;
  // Descriptores de resolución
  resCover: string;
  resSquare: string;
  resVertical: string;
  resBanner: string;
  // Perfil (token: credenciales propias + creaciones guardadas)
  profileTitle: string;
  profileTokenPlaceholder: string;
  profileJoin: string;
  profileOr: string;
  profileTmdbKeyPlaceholder: string;
  profileImagekitKeyPlaceholder: string;
  profileCreate: string;
  profileCopyToken: string;
  profileForget: string;
  profileForgetTitle: string;
  profileHasTmdb: string;
  profileNoTmdb: string;
  profileHasImagekit: string;
  profileNoImagekit: string;
  profileRemoveCredential: string;
  profileNotFound: string;
  profileNetErr: string;
  profileSaveErr: string;
  profileWarningTitle: string;
  profileWarningBody: string;
  profileWarningConfirm: string;
  profileCreationsTitle: string;
  profileNoCreations: string;
  profileSaveCurrentPlaceholder: string;
  profileRenamePlaceholder: string;
  profileSaveCurrent: string;
  profileUpdateCurrent: string;
  profileSaveAsNew: string;
  profileLoadCreation: string;
  profileRenameCreation: string;
  profileDeleteCreation: string;
  profileCopyCreationUrl: string;
}

const es: Dict = {
  mosaic: "Mosaico",
  cover: "Portada",
  newBtn: "Nuevo",
  newBtnTitle: "Limpiar todos los campos y comenzar de nuevo",
  accessKeyRequired: "Este servidor requiere access key",
  accessKeyTitle: "Solo hace falta si el servidor define ACCESS_KEY",
  viewGithub: "Ver en GitHub",
  importTitle: "Editar imagen existente",
  importPlaceholder: "Pega una URL de /api/render o /api/cover",
  importLoad: "Cargar",
  importInvalidUrl: "Eso no parece una URL válida",
  importNotApp:
    "Debe ser una URL generada por la app (/api/render o /api/cover)",
  importOk: "Ajustes importados: sigue editando donde lo dejaste.",
  importHelp:
    "Restaura todos los ajustes de una imagen generada antes. Si usa catálogos, pulsa «Cargar y previsualizar» para traer los títulos.",
  searchTmdb: "Buscar en TMDB",
  searchPlaceholder: "Película o serie…",
  clearSearch: "Limpiar búsqueda",
  searching: "Buscando…",
  searchNetErr: "Error de red buscando en TMDB",
  resultHelpCover:
    "Haz clic en un resultado para usarlo como fondo de la portada.",
  resultHelpMosaic: "Haz clic para añadir o quitar de la colección.",
  collection: "Colección",
  shuffle: "Mezclar",
  clear: "Vaciar",
  clearAllTitle: "Quitar todos los títulos",
  emptyCollection: "Haz clic en un resultado para añadirlo.",
  remove: "Quitar",
  catalogsTitle: "Catálogos dinámicos (Stremio / Nuvio)",
  add: "Añadir",
  removeCatalog: "Quitar catálogo",
  catalogsMixed: "Los catálogos se mezclan intercalados en el mosaico.",
  maxTitles: "Máx. títulos",
  loading: "Cargando…",
  loadPreview: "Cargar y previsualizar",
  copyDynamic: "Copiar URL de imagen dinámica",
  catalogHelp:
    "«Cargar» trae los títulos a la colección con arte limpio de TMDB para previsualizar y retocar. La URL dinámica conserva tus ajustes, los títulos que quites y los que añadas a mano, y se regenera en cada visita: si el catálogo cambia, el fondo se actualiza solo.",
  catalogNetErr: "Error de red cargando el catálogo",
  emptyCover: "Busca un título o carga un catálogo para el fondo",
  emptyMosaic: "Añade títulos desde el buscador para ver el mosaico",
  addContentFirst: "Añade contenido primero",
  downloadPng: "Descargar PNG",
  copyApiUrl: "Copiar URL de API",
  copied: "¡Copiada!",
  urlCopied: "URL copiada al portapapeles",
  background: "Fondo",
  topNum: "Nº del top",
  fixedTitle: "Título fijo",
  positionInTop: "Posición en el top",
  addToPick: "Añade títulos a la colección para elegir uno.",
  imageType: "Tipo de imagen",
  textlessArt: "Arte sin texto (textless)",
  resolution: "Resolución",
  bgZoom: "Zoom fondo",
  darken: "Oscurecer",
  vignette: "Viñeta",
  bottomFade: "Fade inferior",
  bgColor: "Color de fondo",
  logoPlate: "Placa del logo",
  plateNone: "Ninguna",
  plateTop: "Arriba",
  plateBottom: "Abajo",
  plateLeft: "Izquierda",
  plateRight: "Derecha",
  plateColor: "Color de placa",
  opacity: "Opacidad",
  thickness: "Grosor",
  slant: "Inclinación",
  edgeFade: "Fade del borde",
  bgBlur: "Blur del fondo",
  logoPng: "Logo (PNG)",
  searchPlatform: "Buscar plataforma (Netflix, Max…)",
  orLogoUrl: "…o URL pública del logo (PNG)",
  removeLogo: "Quitar logo",
  logoSize: "Tamaño logo",
  logoX: "Logo X",
  logoY: "Logo Y",
  logoRotation: "Rotación logo",
  textLabel: "Texto (p. ej. género)",
  textPlaceholder: "Acción, Comedia, Top películas…",
  font: "Fuente",
  textColor: "Color de texto",
  bold: "Negrita",
  textSize: "Tamaño texto",
  textX: "Texto X",
  textY: "Texto Y",
  textRotation: "Rotación texto",
  shadow: "Sombra",
  preset: "Preset",
  presetNetflix: "Mosaico inclinado",
  presetGrid: "Grid recto",
  presetBackdrops: "Collage de backdrops",
  posters: "Posters",
  backdrops: "Backdrops",
  columns: "Columnas",
  gap: "Separación",
  rotation: "Rotación",
  stagger: "Escalonado",
  corners: "Esquinas",
  zoom: "Zoom",
  eyedropperTitle: "Cuentagotas: elegir un color del preview",
  eyedropperSharing: "Elige qué pantalla, ventana o pestaña compartir…",
  shotHelp: "Haz clic en la captura para tomar el color · Esc cancela",
  shotAlt: "Captura de pantalla para elegir color",
  cancel: "Cancelar",
  resCover: "portada",
  resSquare: "cuadrada",
  resVertical: "vertical",
  resBanner: "banner",
  profileTitle: "Perfil (credenciales y creaciones guardadas)",
  profileTokenPlaceholder: "Pega tu token existente…",
  profileJoin: "Entrar",
  profileOr: "…o crea uno nuevo con tu(s) key(s):",
  profileTmdbKeyPlaceholder: "Tu TMDB API key (opcional)",
  profileImagekitKeyPlaceholder: "Tu ImageKit private key (opcional)",
  profileCreate: "Guardar",
  profileCopyToken: "Copiar token",
  profileForget: "Olvidar",
  profileForgetTitle: "Salir de este perfil en este navegador",
  profileHasTmdb: "TMDB ✓",
  profileNoTmdb: "Sin TMDB",
  profileHasImagekit: "ImageKit ✓",
  profileNoImagekit: "Sin ImageKit",
  profileRemoveCredential: "Quitar esta credencial",
  profileNotFound: "Token no encontrado",
  profileNetErr: "Error de red con el perfil",
  profileSaveErr: "No se pudo guardar el perfil",
  profileWarningTitle: "Guarda este token en un lugar seguro",
  profileWarningBody:
    "Es la única forma de volver a tus credenciales y creaciones guardadas. Si lo pierdes, no hay forma de recuperarlo: no hay email ni contraseña asociados.",
  profileWarningConfirm: "Entendido, ya lo guardé",
  profileCreationsTitle: "Creaciones guardadas",
  profileNoCreations: "Aún no has guardado ninguna creación.",
  profileSaveCurrentPlaceholder: "Nombre para esta creación…",
  profileRenamePlaceholder: "Nuevo nombre (opcional)…",
  profileSaveCurrent: "Guardar como creación",
  profileUpdateCurrent: "Actualizar",
  profileSaveAsNew: "Guardar como nueva en vez de actualizar",
  profileLoadCreation: "Cargar esta creación en el editor",
  profileRenameCreation: "Renombrar",
  profileDeleteCreation: "Eliminar",
  profileCopyCreationUrl: "Copiar URL de esta creación",
};

const en: Dict = {
  mosaic: "Mosaic",
  cover: "Cover",
  newBtn: "New",
  newBtnTitle: "Clear all fields and start over",
  accessKeyRequired: "This server requires an access key",
  accessKeyTitle: "Only needed if the server sets ACCESS_KEY",
  viewGithub: "View on GitHub",
  importTitle: "Edit existing image",
  importPlaceholder: "Paste a /api/render or /api/cover URL",
  importLoad: "Load",
  importInvalidUrl: "That doesn't look like a valid URL",
  importNotApp: "Must be a URL generated by the app (/api/render or /api/cover)",
  importOk: "Settings imported: keep editing where you left off.",
  importHelp:
    "Restores every setting from an image generated before. If it uses catalogs, click “Load & preview” to bring in the titles.",
  searchTmdb: "Search on TMDB",
  searchPlaceholder: "Movie or series…",
  clearSearch: "Clear search",
  searching: "Searching…",
  searchNetErr: "Network error searching TMDB",
  resultHelpCover: "Click a result to use it as the cover background.",
  resultHelpMosaic: "Click to add or remove from the collection.",
  collection: "Collection",
  shuffle: "Shuffle",
  clear: "Clear",
  clearAllTitle: "Remove all titles",
  emptyCollection: "Click a result to add it.",
  remove: "Remove",
  catalogsTitle: "Dynamic catalogs (Stremio / Nuvio)",
  add: "Add",
  removeCatalog: "Remove catalog",
  catalogsMixed: "Catalogs are interleaved in the mosaic.",
  maxTitles: "Max titles",
  loading: "Loading…",
  loadPreview: "Load & preview",
  copyDynamic: "Copy dynamic image URL",
  catalogHelp:
    "“Load” brings the titles into the collection with clean TMDB art to preview and tweak. The dynamic URL keeps your settings, the titles you remove and the ones you add by hand, and regenerates on every visit: if the catalog changes, the background updates on its own.",
  catalogNetErr: "Network error loading the catalog",
  emptyCover: "Search a title or load a catalog for the background",
  emptyMosaic: "Add titles from the search to see the mosaic",
  addContentFirst: "Add content first",
  downloadPng: "Download PNG",
  copyApiUrl: "Copy API URL",
  copied: "Copied!",
  urlCopied: "URL copied to clipboard",
  background: "Background",
  topNum: "Top #",
  fixedTitle: "Fixed title",
  positionInTop: "Position in top",
  addToPick: "Add titles to the collection to pick one.",
  imageType: "Image type",
  textlessArt: "Textless art",
  resolution: "Resolution",
  bgZoom: "Background zoom",
  darken: "Darken",
  vignette: "Vignette",
  bottomFade: "Bottom fade",
  bgColor: "Background color",
  logoPlate: "Logo plate",
  plateNone: "None",
  plateTop: "Top",
  plateBottom: "Bottom",
  plateLeft: "Left",
  plateRight: "Right",
  plateColor: "Plate color",
  opacity: "Opacity",
  thickness: "Thickness",
  slant: "Slant",
  edgeFade: "Edge fade",
  bgBlur: "Background blur",
  logoPng: "Logo (PNG)",
  searchPlatform: "Search platform (Netflix, Max…)",
  orLogoUrl: "…or public logo URL (PNG)",
  removeLogo: "Remove logo",
  logoSize: "Logo size",
  logoX: "Logo X",
  logoY: "Logo Y",
  logoRotation: "Logo rotation",
  textLabel: "Text (e.g. genre)",
  textPlaceholder: "Action, Comedy, Top movies…",
  font: "Font",
  textColor: "Text color",
  bold: "Bold",
  textSize: "Text size",
  textX: "Text X",
  textY: "Text Y",
  textRotation: "Text rotation",
  shadow: "Shadow",
  preset: "Preset",
  presetNetflix: "Tilted mosaic",
  presetGrid: "Straight grid",
  presetBackdrops: "Backdrop collage",
  posters: "Posters",
  backdrops: "Backdrops",
  columns: "Columns",
  gap: "Gap",
  rotation: "Rotation",
  stagger: "Stagger",
  corners: "Corners",
  zoom: "Zoom",
  eyedropperTitle: "Eyedropper: pick a color from the preview",
  eyedropperSharing: "Choose which screen, window or tab to share…",
  shotHelp: "Click the screenshot to pick the color · Esc cancels",
  shotAlt: "Screenshot to pick a color",
  cancel: "Cancel",
  resCover: "cover",
  resSquare: "square",
  resVertical: "vertical",
  resBanner: "banner",
  profileTitle: "Profile (saved credentials & creations)",
  profileTokenPlaceholder: "Paste your existing token…",
  profileJoin: "Join",
  profileOr: "…or create one with your key(s):",
  profileTmdbKeyPlaceholder: "Your TMDB API key (optional)",
  profileImagekitKeyPlaceholder: "Your ImageKit private key (optional)",
  profileCreate: "Save",
  profileCopyToken: "Copy token",
  profileForget: "Forget",
  profileForgetTitle: "Leave this profile on this browser",
  profileHasTmdb: "TMDB ✓",
  profileNoTmdb: "No TMDB",
  profileHasImagekit: "ImageKit ✓",
  profileNoImagekit: "No ImageKit",
  profileRemoveCredential: "Remove this credential",
  profileNotFound: "Token not found",
  profileNetErr: "Network error with the profile",
  profileSaveErr: "Couldn't save the profile",
  profileWarningTitle: "Save this token somewhere safe",
  profileWarningBody:
    "It's the only way back into your saved credentials and creations. If you lose it, it can't be recovered — there's no email or password tied to it.",
  profileWarningConfirm: "Got it, I saved it",
  profileCreationsTitle: "Saved creations",
  profileNoCreations: "You haven't saved any creation yet.",
  profileSaveCurrentPlaceholder: "Name for this creation…",
  profileRenamePlaceholder: "New name (optional)…",
  profileSaveCurrent: "Save as creation",
  profileUpdateCurrent: "Update",
  profileSaveAsNew: "Save as new instead of updating",
  profileLoadCreation: "Load this creation into the editor",
  profileRenameCreation: "Rename",
  profileDeleteCreation: "Delete",
  profileCopyCreationUrl: "Copy this creation's URL",
};

export const translations: Record<Lang, Dict> = { es, en };

// Mapea la clave de preset a su etiqueta traducida
export function presetLabel(t: Dict, key: string): string {
  if (key === "netflix") return t.presetNetflix;
  if (key === "grid") return t.presetGrid;
  if (key === "backdrops") return t.presetBackdrops;
  return key;
}
