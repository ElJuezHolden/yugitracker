# Yugi-Tracker

Gestor de colecciones de cartas de **Yu-Gi-Oh!**. Organiza tus cartas en carpetas y guarda de
cada una lo que de verdad distingue un ejemplar de otro: edición, rareza, idioma, estado de
conservación y lo que pagaste por ella.

Los datos de las cartas vienen de la API pública de [YGOPRODeck](https://ygoprodeck.com/api-guide/).

## Qué hace

- **Carpetas** con portada propia, ordenables a mano o por nombre y valor.
- **Ficha por ejemplar**: set e impresión concreta, rareza, 1.ª edición o limitada, idioma,
  estado (de Mint a Poor), precio pagado, etiquetas y notas.
- **Cuatro vistas**: cuadrícula, lista, álbum (a modo de carpeta de fundas, con páginas que
  pasan) y display, que enseña solo las imágenes.
- **Brillos por rareza**: cada rareza brilla donde brilla en la carta real (ver abajo).
- **Precios de Cardmarket**: valor aproximado de la colección, de cada carpeta y de cada carta,
  y en la ficha de una carta el precio de todas sus versiones y una gráfica de su evolución.
  Cardmarket da un precio por versión que mezcla idiomas y estados. Si una versión no está en
  Cardmarket se usa el de TCGplayer (vía YGOPRODeck) pasado a euros, y se indica. Las copias que
  no están en MT o NM se valoran con un descuento estimado por estado (EX 85 %, GD 75 %, LP 60 %,
  PL 40 %, PO 25 %): Cardmarket no publica precios por estado.
- **Subidas y bajadas**: un panel (icono de tendencia en la cabecera) con las cartas de tu
  colección que más han subido o bajado en 7 días, 30, 90 o un año, filtrando por cambio mínimo.
- **Lo pagado**, opcional y por carta: solo se ve en la ficha de esa carta, comparado con su
  valor actual. No entra en los totales.
- **Cartas buscadas**: márcalas como *wanted* para llevar la lista de lo que te falta.
- **Filtros** por tipo de carta, tipo de monstruo, propiedad de mágica o trampa, set y rareza.
- **Temas**: acento y fondo a elegir, con claro y oscuro automáticos, y colores propios guardados.
- **Copias de seguridad**: exporta e importa toda la colección en un JSON.

## Los brillos de rareza

Lo que distingue una rareza de otra no es "cuánto brilla", sino **qué parte de la carta lleva
foil y con qué trama**: la Rare solo el nombre, la Super Rare solo la ilustración, la Secret
Rare ambas con líneas diagonales, la Parallel toda la superficie. Las coordenadas de cada zona
están medidas sobre las imágenes reales de YGOPRODeck analizando los bordes del marco, y son
iguales en monstruo, mágica y trampa.

La técnica de los brillos es la de los efectos holográficos de cartas hechos en CSS (referente:
[pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)). Tres piezas:

1. **La luz la manda el puntero, no un temporizador.** El degradado se dibuja sobre un lienzo
   del 400 % y su `background-position` se calcula desde la posición del cursor, con un
   multiplicador que lo desplaza en sentido contrario y más rápido. Un barrido por reloj se lee
   como un "cargando"; este se lee como luz recorriendo la carta.
2. **Contraste alto** (`filter: contrast(2.4)`) sobre la capa de brillo: es lo que convierte un
   degradado blando en bandas nítidas de metal.
3. **Microlíneas mezcladas con el arco iris** mediante `background-blend-mode`, que son el
   rayado fino que tiene el foil de verdad.

Encima va un reflejo especular centrado en el cursor y la carta **se inclina en 3D** siguiendo
la mano (`useCardPointer`), que es lo que hace que parezca una carta y no una pegatina.

Para ajustarlos hay un banco de pruebas con las 41 rarezas a la vez sobre la misma carta:

```bash
npm run dev
```

y abrir **http://localhost:3000/foil-demo.html**. Permite cambiar de carta y de tamaño, dibujar
las zonas medidas encima y congelar el barrido para juzgar el estado en reposo. Usa el
componente de verdad, así que lo que se ve ahí es lo que se ve en la colección. Vite solo
empaqueta `index.html`, de modo que esta página no llega a producción.

> Al tocar `CardFoilOverlay.css`, ojo con una trampa: **ni `z-index` ni `opacity` en los
> contenedores**. Cualquiera de los dos crea un contexto de apilamiento que aísla la mezcla, los
> `mix-blend-mode` dejan de ver la imagen de la carta y el efecto degenera en un velo de color
> que apaga la ilustración. Está explicado al principio del archivo.

## Puesta en marcha

Requiere Node.js 20.19 o superior.

```bash
npm install
npm run dev
```

La aplicación queda en `http://localhost:3000`. No hace falta ninguna clave de API.

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente. |
| `npm run build` | Comprueba los tipos y genera `dist/`. |
| `npm run preview` | Sirve `dist/` para probar la versión de producción. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript sin generar nada. |

## Dónde se guarda la colección

La colección vive **en tu navegador** (`localStorage`). Una sola copia ahí se puede perder de
varias maneras, así que el botón del escudo de la cabecera abre **Copias de seguridad**, que
cubre cada una:

| Riesgo | Qué lo cubre |
|---|---|
| El navegador libera espacio y la borra | Se le pide almacenamiento persistente (`navigator.storage.persist()`) |
| Un borrado por error, importar el archivo equivocado o un fallo del código | **Historial automático** en IndexedDB: una versión cada pocos minutos mientras hay cambios; se guardan todas las recientes y una por día durante dos meses |
| Borrar los datos de navegación (que se lleva lo anterior) | **Copia continua en un archivo de tu ordenador**: eliges dónde una vez y cada cambio se escribe ahí solo. Si está en OneDrive o Dropbox, también queda en la nube |
| Cambiar de navegador o de equipo | Ese archivo, o una copia descargada, se restaura en el otro lado |

Detalles que conviene saber:

- **La copia en archivo solo existe en Chrome y Edge** (usa la File System Access API). En el
  resto se puede descargar una copia a mano.
- **Tras reiniciar el navegador hay que reanudarla con un clic.** El navegador concede el permiso
  de escritura por sesión; la aplicación lo avisa con una franja amarilla.
- **Una colección vacía nunca se escribe sola en el archivo.** Si el navegador arrancase sin
  datos, eso no machaca la copia que serviría para recuperarlos.
- **Importar y restaurar guardan antes la colección actual en el historial** y ofrecen deshacer:
  ninguna operación que lo sustituya todo es irreversible.
- Las copias van envueltas (`{ app, version, savedAt, db }`) para poder migrarlas si cambia el
  formato. Las copias antiguas, sin envolver, se siguen leyendo.

El código está en `services/backup.ts` (almacenamiento) y `context/BackupContext.tsx` (cuándo se
guarda).

Migrar esto a una base de datos con cuentas de usuario sigue siendo el paso natural para
sincronizar entre dispositivos, y es lo único que habría que rehacer: los componentes no dependen
de dónde salen los datos.

## Stack

Vite 6 · React 19 · TypeScript en modo `strict` · Tailwind CSS 4 · framer-motion · lucide-react.

## Estructura

```
App.tsx              Pantalla principal: filtrado, orden y selección múltiple
index.css            Tema (variables CSS) y estilos base
types.ts             Tipos compartidos
utils.ts             Rarezas, estados, colores del tema, exportación
context/             Estado global (useReducer) y guardado en localStorage
services/            Cliente de la API de YGOPRODeck, con caché y freno de peticiones
components/          Vistas de carta y carpeta, cabecera, filtros, brillos
useCardPointer.ts    Inclinación 3D y seguimiento del puntero de cada carta
foil-demo.html       Banco de pruebas de los brillos (solo desarrollo)
components/Modals/   Añadir carta, editar carta, carpeta y tema
```

## Precios de Cardmarket

El flujo `Publicar` (`.github/workflows/deploy.yml`) se ejecuta en cada push a `main` y también
todos los días a las 06:23 UTC. En cada ejecución `scripts/actualizar-precios.mjs`:

1. Descarga la guía pública de precios de Yu-Gi-Oh! de Cardmarket y su lista de productos, y
   todas las cartas y sets de YGOPRODeck.
2. Empareja cada set de YGOPRODeck con la expansión de Cardmarket que tiene más cartas suyas
   (en empate, la que Cardmarket añadió más cerca del lanzamiento en inglés) y, dentro de cada
   carta, los productos por precio con las rarezas de menor a mayor. Cubre más del 95 % de las
   versiones.
3. Guarda el precio de hoy (`actual-NN.json`) y el historial (`NN.json`) en la rama
   `datos-precios`, que se reescribe en un único commit para que el repositorio no crezca, y los
   publica con la web en `/precios/` (las cartas repartidas en 100 archivos por `id % 100`).

El precio de cada versión es la mediana de su tendencia y sus medias de 7 y 30 días. En el
historial solo se apunta cuando cambia de verdad; pasado un mes queda uno por semana y a los 400
días se borra. GitHub desactiva los flujos programados si un repositorio pasa 60 días sin
actividad; si pasara, se reactiva desde la pestaña *Actions*.

## Cosas a tener en cuenta

- **Los nombres de carta van en inglés.** La API de YGOPRODeck no ofrece español (solo inglés,
  francés, alemán, italiano y portugués).
- **Las imágenes se enlazan desde el servidor de YGOPRODeck.** Sus condiciones piden alojarlas
  por cuenta propia y avisan de que pueden bloquear por IP. Para uso personal en local no da
  problemas, pero **antes de publicar esto en internet hay que cachear las imágenes**.
- La API corta el acceso durante una hora si se superan 20 peticiones por segundo. El cliente
  de `services/cardService.ts` cachea y espacia las llamadas para no acercarse.

## Créditos

Datos e imágenes de cartas: [YGOPRODeck](https://ygoprodeck.com/). Yu-Gi-Oh! es una marca de
Konami. Este es un proyecto personal sin relación con Konami.
