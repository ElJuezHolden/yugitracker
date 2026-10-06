/*
 * Precios de Cardmarket de TODAS las versiones de todas las cartas, cada día.
 *
 * Lo ejecuta GitHub Actions una vez al día (ver .github/workflows/deploy.yml).
 * La web lo lee de /precios/ y así tiene precio y historial aunque nadie la abra.
 *
 * De dónde sale cada cosa:
 *   - Cardmarket publica a diario, en abierto, su guía de precios de Yu-Gi-Oh!
 *     (un precio por producto) y la lista de productos (nombre y expansión).
 *     No dice ni el código de set ni la rareza de cada producto.
 *   - YGOPRODeck da, para cada carta, sus versiones: set, código y rareza.
 *
 * Para unirlos:
 *   1. Cada set de YGOPRODeck se empareja con la expansión de Cardmarket que
 *      tiene más cartas suyas. Si empatan (la versión inglesa y la japonesa
 *      del mismo set), gana la que Cardmarket añadió más cerca del lanzamiento
 *      en inglés.
 *   2. Dentro de una expansión, cada carta tiene un producto por rareza. Se
 *      ordenan los productos por precio y las rarezas de menor a mayor, y se
 *      emparejan en orden: la versión más rara es la más cara.
 * Comprobado a mano con varias cartas (p. ej. Number F0 DUAD-EN042 Ultra Rare
 * sale a lo mismo que en la web de Cardmarket).
 *
 * De cada producto se publican todas sus cifras de Cardmarket: desde (la oferta
 * más barata), tendencia y medias de venta de 1, 7 y 30 días. La web deja elegir
 * con cuál se valora la colección.
 *
 * El "precio de referencia" (el que va al historial y se usa por defecto) es la
 * MÁS BAJA de las medias de 1, 7 y 30 días. Una venta suelta disparatada
 * (alguien paga 18 € por una carta de 0,20 €) infla una o dos medias, pero rara
 * vez las tres. La tendencia solo se usa si no hay medias. La misma regla está
 * en services/prices.ts (statValue).
 *
 * Archivos (las cartas se reparten en 100 por `id % 100`):
 *   actual-NN.json  { v: 3, actualizado: <día>,
 *                     cartas: { <id>: { "<set>|<rareza>": [desde, tendencia, media1, media7, media30] } },
 *                     productos: { <id>: { "<set>|<rareza>": idProduct de Cardmarket } } }
 *                   (euros; `null` si Cardmarket no tiene esa cifra)
 *   NN.json         { v: 2, actualizado: <día>, cartas: { <id>: { "<set>|<rareza>": [[<día>, euros], ...] } } }
 *                   (el precio de referencia)
 * Los días son días desde 1970 (UTC). En el historial solo se apunta un precio
 * cuando cambia de verdad (un 2 % o 2 céntimos); pasado un mes queda uno por
 * semana y a los 400 días se borra.
 *
 * Uso: node scripts/actualizar-precios.mjs <carpeta>
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CARPETA = process.argv[2] ?? 'datos-precios';
const YGO_CARTAS = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const YGO_SETS = 'https://db.ygoprodeck.com/api/v7/cardsets.php';
const CM = 'https://downloads.s3.cardmarket.com/productCatalog';
const CM_PRODUCTOS = `${CM}/productList/products_singles_3.json`;
const CM_PRECIOS = `${CM}/priceGuide/price_guide_3.json`;

const TROZOS = 100;
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_DIARIOS = 30;
const DIAS_MAXIMOS = 400;
const VERSION_HISTORIAL = 2;
const VERSION_ACTUAL = 3;
const hoy = Math.floor(Date.now() / DIA_MS);

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  return res.json();
}

const [{ data: cartas }, setsYgo, { products: productos }, { priceGuides }] = await Promise.all([
  json(YGO_CARTAS),
  json(YGO_SETS),
  json(CM_PRODUCTOS),
  json(CM_PRECIOS),
]);
if (!Array.isArray(cartas) || cartas.length < 1000) throw new Error('YGOPRODeck: respuesta incompleta');
if (!Array.isArray(productos) || productos.length < 1000) throw new Error('Cardmarket: lista de productos incompleta');

// ---------------------------------------------------------------------------
// Emparejar Cardmarket con YGOPRODeck
// ---------------------------------------------------------------------------

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const redondear = (x) => Math.round(x * 100) / 100;
const esPrecio = (x) => typeof x === 'number' && x > 0;

const cifra = (x) => (esPrecio(x) ? redondear(x) : null);
/** idProduct → { ref: precio de referencia, cifras: [desde, tendencia, media1, media7, media30] } */
const precioProducto = new Map();
for (const g of priceGuides) {
  const medias = [g.avg1, g.avg7, g.avg30].filter(esPrecio);
  const ref = medias.length ? Math.min(...medias) : esPrecio(g.trend) ? g.trend : null;
  if (ref == null) continue;
  precioProducto.set(g.idProduct, { ref: redondear(ref), cifras: [g.low, g.trend, g.avg1, g.avg7, g.avg30].map(cifra) });
}

/** Cardmarket: expansión → nombre → productos; y nombre → expansiones. */
const expansiones = new Map();
const expansionesDe = new Map();
const fechaExpansion = new Map();
for (const p of productos) {
  const n = norm(p.name);
  let e = expansiones.get(p.idExpansion);
  if (!e) expansiones.set(p.idExpansion, (e = new Map()));
  if (!e.has(n)) e.set(n, []);
  e.get(n).push(p);
  if (!expansionesDe.has(n)) expansionesDe.set(n, new Set());
  expansionesDe.get(n).add(p.idExpansion);
  const t = Date.parse(p.dateAdded.replace(' ', 'T'));
  if (!(fechaExpansion.get(p.idExpansion) <= t)) fechaExpansion.set(p.idExpansion, t);
}

/** YGOPRODeck: set → nombre → versiones. */
const setsCartas = new Map();
for (const c of cartas) {
  for (const s of c.card_sets ?? []) {
    let e = setsCartas.get(s.set_name);
    if (!e) setsCartas.set(s.set_name, (e = new Map()));
    const n = norm(c.name);
    if (!e.has(n)) e.set(n, []);
    e.get(n).push({ id: c.id, code: s.set_code, rarity: s.set_rarity });
  }
}
const lanzamiento = new Map(setsYgo.map((s) => [s.set_name, s.tcg_date ? Date.parse(s.tcg_date) : null]));
// Las cartas antiguas de Cardmarket tienen todas fecha de 2007: ahí la fecha no distingue nada.
const FECHA_UTIL = Date.parse('2008-01-01');

function expansionDe(nombreSet, cartasSet) {
  const comunes = new Map();
  for (const n of cartasSet.keys()) for (const id of expansionesDe.get(n) ?? []) comunes.set(id, (comunes.get(id) ?? 0) + 1);
  const candidatas = [...comunes]
    .map(([id, inter]) => ({ id, cobertura: inter / cartasSet.size, parecido: inter / (cartasSet.size + expansiones.get(id).size - inter) }))
    .filter((c) => c.cobertura >= 0.6)
    .sort((a, b) => b.cobertura - a.cobertura || b.parecido - a.parecido);
  if (!candidatas.length) return null;
  const empatadas = candidatas.filter((c) => c.cobertura >= candidatas[0].cobertura - 0.1);
  const fecha = lanzamiento.get(nombreSet);
  if (fecha && empatadas.length > 1 && empatadas.every((c) => fechaExpansion.get(c.id) > FECHA_UTIL)) {
    return empatadas.reduce((a, b) => (Math.abs(fechaExpansion.get(a.id) - fecha) <= Math.abs(fechaExpansion.get(b.id) - fecha) ? a : b)).id;
  }
  return empatadas.reduce((a, b) => (b.parecido > a.parecido ? b : a)).id;
}

// De menor a mayor. Las que no estén en la lista cuentan como Ultra Rare.
const RAREZAS = [
  'Common', 'Short Print', 'Super Short Print', 'Rare', 'Super Rare', 'Ultra Rare', 'Ultimate Rare', 'Secret Rare',
  'Prismatic Secret Rare', 'Ultra Secret Rare', 'Platinum Secret Rare', "Collector's Rare", 'Quarter Century Secret Rare',
  'Starlight Rare', 'Ghost Rare',
];
const rango = (r) => {
  const i = RAREZAS.indexOf(r);
  return i < 0 ? RAREZAS.indexOf('Ultra Rare') : i;
};

/** id → (clave → precio de referencia en euros) */
const deHoy = new Map();
/** id → (clave → [desde, tendencia, media1, media7, media30]) */
const cifrasDe = new Map();
/** id → (clave → número de producto de Cardmarket), para enlazar a su página. */
const productoDe = new Map();
let versiones = 0;
let conPrecio = 0;
let setsSinPareja = 0;
for (const [nombreSet, cartasSet] of setsCartas) {
  const exp = expansionDe(nombreSet, cartasSet);
  if (exp == null) setsSinPareja++;
  for (const [n, impresiones] of cartasSet) {
    versiones += impresiones.length;
    if (exp == null) continue;
    const productosCarta = (expansiones.get(exp).get(n) ?? [])
      .map((p) => ({ precio: precioProducto.get(p.idProduct), idProduct: p.idProduct }))
      .filter((x) => x.precio != null)
      .sort((a, b) => a.precio.ref - b.precio.ref);
    const rarezas = [...new Set(impresiones.map((i) => i.rarity))].sort((a, b) => rango(a) - rango(b));
    const porRareza = new Map();
    if (productosCarta.length && productosCarta.length === rarezas.length) rarezas.forEach((r, i) => porRareza.set(r, productosCarta[i]));
    else if (productosCarta.length && rarezas.length === 1) porRareza.set(rarezas[0], productosCarta[0]);
    for (const imp of impresiones) {
      const producto = porRareza.get(imp.rarity);
      if (producto == null) continue;
      conPrecio++;
      const clave = `${imp.code}|${imp.rarity}`;
      if (!deHoy.has(imp.id)) deHoy.set(imp.id, {});
      deHoy.get(imp.id)[clave] = producto.precio.ref;
      if (!cifrasDe.has(imp.id)) cifrasDe.set(imp.id, {});
      cifrasDe.get(imp.id)[clave] = producto.precio.cifras;
      if (!productoDe.has(imp.id)) productoDe.set(imp.id, {});
      productoDe.get(imp.id)[clave] = producto.idProduct;
    }
  }
}

// ---------------------------------------------------------------------------
// Guardar: precio actual e historial
// ---------------------------------------------------------------------------

await mkdir(CARPETA, { recursive: true });
const historiales = [];
for (let i = 0; i < TROZOS; i++) {
  let trozo = null;
  try {
    trozo = JSON.parse(await readFile(join(CARPETA, `${i}.json`), 'utf8'));
  } catch {
    // Primera vez.
  }
  // El formato 1 guardaba dólares de TCGplayer: no se mezcla con euros de Cardmarket.
  historiales.push(trozo?.v === VERSION_HISTORIAL ? trozo : { v: VERSION_HISTORIAL, actualizado: hoy, cartas: {} });
}

const cambiaDeVerdad = (antes, ahora) => Math.abs(ahora - antes) >= Math.max(0.02, antes * 0.02);
let cambios = 0;
for (const [id, precios] of deHoy) {
  const historial = (historiales[id % TROZOS].cartas[id] ??= {});
  for (const [clave, eur] of Object.entries(precios)) {
    const puntos = (historial[clave] ??= []);
    const ultimo = puntos[puntos.length - 1];
    if (ultimo && ultimo[0] === hoy) ultimo[1] = eur;
    else if (!ultimo || cambiaDeVerdad(ultimo[1], eur)) {
      puntos.push([hoy, eur]);
      cambios++;
    }
  }
}

/** Un punto por día el último mes, uno por semana antes, y nada de hace más de 400 días. */
function aclarar(puntos) {
  const limite = hoy - DIAS_MAXIMOS;
  const desdeDiario = hoy - DIAS_DIARIOS;
  const fuera = puntos.filter((p) => p[0] < limite);
  const quedan = puntos.filter((p) => p[0] >= limite);
  // El último de antes del límite se conserva: es el precio con el que empieza la ventana.
  const ancla = fuera.length ? [[limite, fuera[fuera.length - 1][1]]] : [];
  const semanal = new Map();
  for (const p of quedan) if (p[0] < desdeDiario) semanal.set(Math.floor(p[0] / 7), p);
  return [...ancla, ...semanal.values(), ...quedan.filter((p) => p[0] >= desdeDiario)];
}

for (let i = 0; i < TROZOS; i++) {
  const historial = historiales[i];
  historial.actualizado = hoy;
  for (const porClave of Object.values(historial.cartas)) {
    for (const clave of Object.keys(porClave)) porClave[clave] = aclarar(porClave[clave]);
  }
  const actual = { v: VERSION_ACTUAL, actualizado: hoy, cartas: {}, productos: {} };
  for (const [id, cifras] of cifrasDe) {
    if (id % TROZOS !== i) continue;
    actual.cartas[id] = cifras;
    actual.productos[id] = productoDe.get(id);
  }
  await writeFile(join(CARPETA, `${i}.json`), JSON.stringify(historial));
  await writeFile(join(CARPETA, `actual-${i}.json`), JSON.stringify(actual));
}

console.log(
  `${conPrecio} de ${versiones} versiones con precio de Cardmarket (${setsSinPareja} sets sin pareja); ${cambios} precios nuevos o cambiados.`,
);
