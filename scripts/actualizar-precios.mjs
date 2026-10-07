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
 *   - Yugipedia corrige las rarezas que YGOPRODeck trae mal ("New"…).
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
 *                     productos: { <id>: { "<set>|<rareza>": idProduct de Cardmarket } },
 *                     sobrantes: { <id>: [[prefijo, set, idProduct, desde, tendencia, media1, media7, media30]] } }
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
// Corregir las rarezas mal puestas de YGOPRODeck
// ---------------------------------------------------------------------------

/*
 * YGOPRODeck no siempre trae bien la rareza: a las cartas recién salidas les
 * pone "New" hasta que la corrige, en otras copia una nota de la tabla de
 * Yugipedia ("2", "Reprint", "New artwork", "force-SMW"…) y alguna la escribe
 * distinto ("PLatinum Secret Rare"). Con esas el precio se guardaba con una
 * rareza que la web no conoce (BLMM-EN038|New en vez de Ultra Rare), y si al
 * código le faltaban varias rarezas los productos se repartían mal. Las rarezas
 * buenas se piden a Yugipedia (unas 350 cartas, 50 por consulta). La misma
 * regla está en la web, en services/versiones.ts.
 */
const AGENTE = 'YugiTracker/1.0 (coleccion personal; https://github.com/ElJuezHolden/yugitracker)';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const rarezaFalsa = (r) => !/rare|common|short print/i.test(r);
const plana = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// Mismas rarezas escritas distinto: se usa la forma más repetida.
const formas = new Map();
for (const c of cartas) for (const s of c.card_sets ?? []) {
  const k = plana(s.set_rarity);
  if (!formas.has(k)) formas.set(k, new Map());
  formas.get(k).set(s.set_rarity, (formas.get(k).get(s.set_rarity) ?? 0) + 1);
}
const formaBuena = new Map([...formas].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
for (const c of cartas) for (const s of c.card_sets ?? []) s.set_rarity = formaBuena.get(plana(s.set_rarity));

async function impresionesYugipedia(nombres) {
  const url = new URL('https://yugipedia.com/api.php');
  const params = { action: 'query', prop: 'revisions', rvprop: 'content', format: 'json', formatversion: '2', redirects: '1', titles: nombres.join('|') };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
  if (!res.ok) throw new Error(`Yugipedia respondió ${res.status}`);
  const { query } = await res.json();
  // Título de la página → nombre pedido (por si redirige).
  const origen = new Map();
  for (const r of [...(query.normalized ?? []), ...(query.redirects ?? [])]) origen.set(r.to, origen.get(r.from) ?? r.from);
  const resultado = new Map();
  for (const pg of query.pages ?? []) {
    const texto = pg.revisions?.[0]?.content ?? '';
    if (!texto.includes('CardTable2')) continue;
    const impresiones = [];
    for (const campo of texto.matchAll(/\|\s*(?:en|na|eu)_sets\s*=([\s\S]*?)(?=\n\s*\||\n\}\})/g)) {
      for (const linea of campo[1].split('\n')) {
        const [code, , rarezas] = linea.split(';').map((x) => x.trim());
        if (!code || !rarezas) continue;
        for (const rarity of rarezas.split(',').map((r) => r.trim()).filter(Boolean)) impresiones.push({ code, rarity });
      }
    }
    resultado.set(origen.get(pg.title) ?? pg.title, impresiones);
  }
  return resultado;
}

const conRarezaFalsa = cartas.filter((c) => c.card_sets?.some((s) => rarezaFalsa(s.set_rarity)));
let rarezasCorregidas = 0;
/** id → (clave vieja → clave buena), para pasar el historial ya guardado a la rareza buena. */
const renombrar = new Map();
try {
  for (let i = 0; i < conRarezaFalsa.length; i += 50) {
    const lote = conRarezaFalsa.slice(i, i + 50);
    const deYugipedia = await impresionesYugipedia(lote.map((c) => c.name));
    for (const c of lote) {
      const yp = deYugipedia.get(c.name);
      if (!yp?.length) continue;
      const nuevas = [];
      for (const s of c.card_sets) {
        if (!rarezaFalsa(s.set_rarity)) {
          nuevas.push(s);
          continue;
        }
        // Las rarezas de ese código según Yugipedia que YGOPRODeck no tiene.
        const codigo = plana(s.set_code);
        const delCodigo = yp.filter((p) => plana(p.code) === codigo);
        if (delCodigo.length === 0) {
          nuevas.push(s); // Yugipedia no la conoce: se queda como está.
          continue;
        }
        const faltan = [...new Set(delCodigo.map((p) => formaBuena.get(plana(p.rarity)) ?? p.rarity))].filter(
          (r) => !c.card_sets.some((x) => plana(x.set_code) === codigo && plana(x.set_rarity) === plana(r)) && !nuevas.some((x) => plana(x.set_code) === codigo && plana(x.set_rarity) === plana(r)),
        );
        // Si no falta ninguna, la de rareza falsa sobraba (era una de las que ya están).
        for (const r of faltan) nuevas.push({ ...s, set_rarity: r });
        if (faltan.length === 1) {
          if (!renombrar.has(c.id)) renombrar.set(c.id, new Map());
          renombrar.get(c.id).set(`${s.set_code}|${s.set_rarity}`, `${s.set_code}|${faltan[0]}`);
        }
        rarezasCorregidas++;
      }
      c.card_sets = nuevas;
    }
    await esperar(1000); // Educación con un wiki que mantienen voluntarios.
  }
} catch (e) {
  // Sin Yugipedia se sigue con las rarezas tal cual (la web tiene su propio arreglo).
  console.warn(`No se pudieron corregir las rarezas con Yugipedia: ${e.message}`);
}

// ---------------------------------------------------------------------------
// Emparejar Cardmarket con YGOPRODeck
// ---------------------------------------------------------------------------

const norm =(s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
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

const DIA_REAL_MS = 86_400_000;
const fechaProducto = (p) => Date.parse(p.dateAdded.replace(' ', 'T'));
/**
 * A partir de aquí la fecha de salida de un set sirve para reconocer sus
 * productos en Cardmarket: todo lo que dio de alta antes de 2015 tiene la fecha
 * de relleno 2007-01-01 (las fechas reales empiezan en enero de 2015).
 */
const FECHA_FIABLE = Date.parse('2015-02-01');
/** Sets con menos cartas que esto son "diminutos": casi cualquier expansión los contiene. */
const DIMINUTO = 5;

/**
 * Lo lejos (en días) que Cardmarket dio de alta los productos de estas cartas en
 * esa expansión de la fecha de salida del set: la mediana, carta a carta, del
 * producto más cercano. Los de fecha de relleno (2007) cuentan como lejísimos.
 */
function distanciaFechas(exp, cartasSet, fecha) {
  const d = [];
  for (const n of cartasSet.keys()) {
    const ps = expansiones.get(exp).get(n);
    if (!ps) continue;
    d.push(Math.min(...ps.map((p) => (fechaProducto(p) <= FECHA_UTIL ? Infinity : Math.abs(fechaProducto(p) - fecha) / DIA_REAL_MS))));
  }
  d.sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] : Infinity;
}

/*
 * La expansión de Cardmarket de un set de YGOPRODeck: la que tiene más cartas
 * suyas. Si varias las tienen (siempre pasa con los sets pequeños: una carta
 * suelta está en decenas de expansiones), decide la FECHA: Cardmarket da de alta
 * los productos cuando sale la carta, así que gana la expansión cuyos productos
 * de esas cartas se añadieron más cerca de la salida del set. Antes desempataba
 * la expansión más pequeña, y las Lost Art (YGOPRODeck las tiene en un set de
 * una carta por oleada) acababan en cualquier expansión con esa carta: Brazo
 * Derecho del Prohibido LART-EN006 en GX Ultimate Beginner's Pack (199 € en vez
 * de 9 €), Anillo Destructor en Battle of Great Duelist (OCG). Un set diminuto
 * sin ninguna expansión de su época se queda sin pareja: mejor sin precio que
 * con el de otra carta.
 */
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
  if (fecha && fecha >= FECHA_FIABLE) {
    const conDistancia = empatadas.map((c) => ({ ...c, dist: distanciaFechas(c.id, cartasSet, fecha) }));
    const mejor = conDistancia.reduce((a, b) => (b.dist < a.dist || (b.dist === a.dist && b.parecido > a.parecido) ? b : a));
    if (cartasSet.size < DIMINUTO && !(mejor.dist <= 400)) return null;
    return mejor.id;
  }
  /*
   * Sets antiguos: en Cardmarket sus productos tienen la fecha de relleno, así
   * que su expansión es una de esas, no una reedición moderna con las mismas
   * cartas (Invasion of Chaos de 2004 iba a la del 25 aniversario de 2023).
   */
  const antiguas = empatadas.filter((c) => fraccionRelleno(c.id, cartasSet) >= 0.5);
  const entre = antiguas.length ? antiguas : empatadas;
  if (cartasSet.size < DIMINUTO && entre.length > 1) return null;
  return entre.reduce((a, b) => (b.parecido > a.parecido ? b : a)).id;
}

/** Qué parte de las cartas del set tiene en esa expansión un producto con la fecha de relleno (de antes de 2015). */
function fraccionRelleno(exp, cartasSet) {
  let con = 0;
  let total = 0;
  for (const n of cartasSet.keys()) {
    const ps = expansiones.get(exp).get(n);
    if (!ps) continue;
    total++;
    if (ps.some((p) => fechaProducto(p) <= FECHA_UTIL)) con++;
  }
  return total ? con / total : 0;
}

/** Como lo hacía antes (solo para el informe de comparación). */
function expansionDeAntes(nombreSet, cartasSet) {
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
  'Starlight Rare', 'Ghost Rare', 'Grand Master Rare',
];
/**
 * Puesto de una rareza en la escala. Las variantes ("Ultra Rare (Extended
 * Art)", "Ultra Rare (Special)") van justo encima de su rareza base: de
 * Magnificent Monsters, la Ultra Rare normal vale 0,22 € y la de arte extendido 16 €.
 */
const rango = (r) => {
  const variante = /^(.*?)\s*\((.+)\)$/.exec(r);
  if (variante && RAREZAS.includes(variante[1])) return RAREZAS.indexOf(variante[1]) + 0.5;
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
/** Productos de Cardmarket ya asignados a una versión. */
const asignados = new Set();
/** Sets de YGOPRODeck con su expansión de Cardmarket. */
const emparejados = [];
/** Cartas con más rarezas que productos en Cardmarket: se repasan con Yugipedia más abajo. */
const dudosas = [];
/** Y al revés: más productos que rarezas (variantes de arte), también más abajo. */
const conVariantes = [];
/**
 * "expansión|carta" con alguna versión de YGOPRODeck que se quedó sin producto: sus
 * productos sin asignar no se sabe de qué rareza son, así que no se publican
 * como sobrantes (la web se los daba a todas sus versiones, con el mismo precio).
 */
const sinProducto = new Set();

/** Empareja rarezas y productos en orden: la rareza más alta, el producto más caro. */
function asignarEnOrden(impresiones, productosCarta, clave) {
  const rarezas = [...new Set(impresiones.map((i) => i.rarity))].sort((a, b) => rango(a) - rango(b));
  const porRareza = new Map();
  if (productosCarta.length && productosCarta.length === rarezas.length) rarezas.forEach((r, i) => porRareza.set(r, productosCarta[i]));
  else if (productosCarta.length && rarezas.length === 1) porRareza.set(rarezas[0], productosCarta[0]);
  if (impresiones.some((imp) => !porRareza.has(imp.rarity))) sinProducto.add(clave);
  for (const imp of impresiones) {
    const producto = porRareza.get(imp.rarity);
    if (producto == null) continue;
    conPrecio++;
    asignados.add(producto.idProduct);
    const clave = `${imp.code}|${imp.rarity}`;
    if (!deHoy.has(imp.id)) deHoy.set(imp.id, {});
    deHoy.get(imp.id)[clave] = producto.precio.ref;
    if (!cifrasDe.has(imp.id)) cifrasDe.set(imp.id, {});
    cifrasDe.get(imp.id)[clave] = producto.precio.cifras;
    if (!productoDe.has(imp.id)) productoDe.set(imp.id, {});
    productoDe.get(imp.id)[clave] = producto.idProduct;
  }
  return rarezas.length;
}

const informe = [];
// De mayor a menor: los sets pequeños van al final y mandan sobre los que los
// agrupan (YGOPRODeck tiene "The Lost Art Promotion (series)" con todas las Lost
// Art y, además, un set con la fecha exacta de cada oleada).
for (const [nombreSet, cartasSet] of [...setsCartas].sort((a, b) => b[1].size - a[1].size)) {
  const exp = expansionDe(nombreSet, cartasSet);
  const fecha = lanzamiento.get(nombreSet);
  if (process.env.INFORME) {
    const antes = expansionDeAntes(nombreSet, cartasSet);
    informe.push({ set: nombreSet, cartas: cartasSet.size, fecha: fecha ? new Date(fecha).toISOString().slice(0, 10) : null, antes, ahora: exp,
      distAntes: antes != null && fecha ? Math.round(distanciaFechas(antes, cartasSet, fecha)) : null,
      distAhora: exp != null && fecha ? Math.round(distanciaFechas(exp, cartasSet, fecha)) : null });
  }
  if (exp == null) setsSinPareja++;
  else emparejados.push([nombreSet, exp]);
  for (const [n, impresiones] of cartasSet) {
    versiones += impresiones.length;
    if (exp == null) continue;
    let productosCarta = (expansiones.get(exp).get(n) ?? [])
      .map((p) => ({ precio: precioProducto.get(p.idProduct), idProduct: p.idProduct, t: fechaProducto(p) }))
      .filter((x) => x.precio != null);
    // Más productos que rarezas (la carta salió varias veces en la expansión,
    // como las Lost Art de varias oleadas): los dados de alta más cerca de la
    // salida de este set.
    const numRarezas = new Set(impresiones.map((i) => i.rarity)).size;
    // Solo cuenta la oleada (semanas), no los segundos: las versiones de una carta
    // se dan de alta juntas (las 4 de Magnificent Monsters, en el mismo minuto).
    if (fecha && fecha >= FECHA_FIABLE && productosCarta.length > numRarezas && productosCarta.some((x) => x.t > FECHA_UTIL)) {
      const lejania = (x) => (x.t <= FECHA_UTIL ? Infinity : Math.abs(x.t - fecha));
      const masCerca = Math.min(...productosCarta.map(lejania));
      const deEsaOleada = productosCarta.filter((x) => lejania(x) <= masCerca + 30 * DIA_REAL_MS);
      if (deEsaOleada.length >= numRarezas) productosCarta = deEsaOleada;
    }
    productosCarta.sort((a, b) => a.precio.ref - b.precio.ref);
    const rarezas = asignarEnOrden(impresiones, productosCarta, `${exp}|${n}`);
    if (productosCarta.length && productosCarta.length < rarezas && rarezas > 1) dudosas.push({ exp, n, impresiones, productosCarta });
    if (productosCarta.length > rarezas) conVariantes.push({ nombreSet, exp, n, impresiones, productosCarta });
  }
}

/*
 * Más rarezas que productos. A veces YGOPRODeck tiene una rareza que no existe
 * (Ultimate Dragonic Utopia Ray: MP22-EN081 en Rare y en Prismatic Secret Rare,
 * cuando solo salió en Rare) y entonces no se podía saber qué producto era cuál.
 * Se preguntan a Yugipedia solo esas cartas, se quitan las rarezas que no lista
 * para ese código y, si cuadra, se emparejan los productos.
 */
let dudasResueltas = 0;
try {
  const nombreDe = new Map(cartas.map((c) => [c.id, c.name]));
  const nombres = [...new Set(dudosas.map((d) => nombreDe.get(d.impresiones[0].id)))];
  const deYugipedia = new Map();
  for (let i = 0; i < nombres.length; i += 50) {
    for (const [k, v] of await impresionesYugipedia(nombres.slice(i, i + 50))) deYugipedia.set(k, v);
    await esperar(1000);
  }
  for (const { exp, n, impresiones, productosCarta } of dudosas) {
    const yp = deYugipedia.get(nombreDe.get(impresiones[0].id));
    if (!yp?.length) continue;
    const existen = impresiones.filter((imp) => {
      const delCodigo = yp.filter((p) => plana(p.code) === plana(imp.code));
      return delCodigo.length === 0 || delCodigo.some((p) => plana(p.rarity) === plana(imp.rarity));
    });
    if (existen.length === impresiones.length) continue;
    const rarezas = new Set(existen.map((i) => i.rarity)).size;
    if (rarezas !== productosCarta.length && !(rarezas === 1 && productosCarta.length)) continue;
    sinProducto.delete(`${exp}|${n}`);
    asignarEnOrden(existen, productosCarta, `${exp}|${n}`);
    dudasResueltas++;
  }
} catch (e) {
  console.warn(`No se pudieron repasar con Yugipedia las cartas con más rarezas que productos: ${e.message}`);
}

/*
 * Más productos que rarezas: variantes de arte. En Magnificent Monsters, Number
 * 39: Utopia, Emissary of Light (MAMO-EN010) sale en Ultra Rare, Ultra Rare de
 * arte extendido, Starlight Rare y Grand Master Rare: 4 productos en Cardmarket,
 * pero YGOPRODeck y la ficha de Yugipedia solo dan 3 rarezas, y la Ultra Rare se
 * llevaba el precio de otra (169 € en vez de 0,22 €). La lista del set en
 * Yugipedia sí separa las variantes ("// description::(extended art)"): si un
 * código sale dos veces con la misma rareza, la que lleva descripción es una
 * versión aparte ("Ultra Rare (Extended Art)"). Si con eso cuadran rarezas y
 * productos, se emparejan; si no, esa carta se queda sin precio en ese set.
 */
let variantesAnadidas = 0;
try {
  const sets = [...new Set(conVariantes.map((v) => v.nombreSet))];
  /** set → código → [{ rareza, descripcion }] */
  const listas = new Map();
  for (let i = 0; i < sets.length; i += 50) {
    const lote = sets.slice(i, i + 50);
    const url = new URL('https://yugipedia.com/api.php');
    const titulos = lote.map((x) => `Set Card Lists:${x} (TCG-EN)`);
    for (const [k, v] of Object.entries({ action: 'query', prop: 'revisions', rvprop: 'content', format: 'json', formatversion: '2', redirects: '1', titles: titulos.join('|') }))
      url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (!res.ok) throw new Error(`Yugipedia respondió ${res.status}`);
    const { query } = await res.json();
    const origen = new Map();
    for (const r of [...(query.normalized ?? []), ...(query.redirects ?? [])]) origen.set(r.to, origen.get(r.from) ?? r.from);
    for (const pg of query.pages ?? []) {
      const texto = pg.revisions?.[0]?.content;
      if (!texto) continue;
      const titulo = origen.get(pg.title) ?? pg.title;
      const set = titulo.replace(/^Set Card Lists:/, '').replace(/ \(TCG-EN\)$/, '');
      const porCodigo = new Map();
      // Cada bloque {{Set list|...|rarities=X|...}} da la rareza por defecto de sus líneas.
      for (const bloque of texto.split('{{Set list').slice(1)) {
        const porDefecto = /\|\s*rarities\s*=\s*([^|\n]+)/.exec(bloque)?.[1]?.trim() ?? 'Common';
        for (const linea of bloque.split('\n')) {
          const m = /^([A-Z0-9]+-[A-Z]*\d+[A-Z]?)\s*;\s*([^;]*);\s*([^;/]*)/.exec(linea.trim());
          if (!m) continue;
          const descripcion = /description::\(([^)]+)\)/.exec(linea)?.[1]?.trim() ?? '';
          const rarezas = (m[3].trim() || porDefecto).split(',').map((r) => r.trim()).filter(Boolean);
          const lista = porCodigo.get(m[1]) ?? [];
          for (const rareza of rarezas) lista.push({ rareza, descripcion });
          porCodigo.set(m[1], lista);
        }
      }
      listas.set(set, porCodigo);
    }
    await esperar(1000);
  }
  const titulo = (d) => d.replace(/\b\w/g, (l) => l.toUpperCase());
  // Algunas listas de Yugipedia ponen la rareza abreviada.
  const ABREVIADAS = {
    c: 'Common', sp: 'Short Print', ssp: 'Super Short Print', r: 'Rare', sr: 'Super Rare', ur: 'Ultra Rare', utr: 'Ultimate Rare',
    scr: 'Secret Rare', pscr: 'Prismatic Secret Rare', uscr: 'Ultra Secret Rare', plscr: 'Platinum Secret Rare', cr: "Collector's Rare",
    qcscr: 'Quarter Century Secret Rare', str: 'Starlight Rare', gr: 'Ghost Rare', gmr: 'Grand Master Rare', gur: 'Gold Rare',
    gscr: 'Gold Secret Rare', pgr: 'Premium Gold Rare', sfr: 'Starfoil Rare', msr: 'Mosaic Rare', shr: 'Shatterfoil Rare',
    urpr: "Ultra Rare (Pharaoh's Rare)", plr: 'Platinum Rare',
  };
  const rarezaCompleta = (r) => ABREVIADAS[plana(r)] ?? r;
  for (const { nombreSet, exp, n, impresiones, productosCarta } of conVariantes) {
    const lista = listas.get(nombreSet);
    if (!lista) continue;
    const nuevas = [];
    for (const imp of impresiones) {
      const entradas = (lista.get(imp.code) ?? []).filter((e) => plana(rarezaCompleta(e.rareza)) === plana(imp.rarity));
      // La misma rareza dos veces: la normal (sin descripción) y la variante.
      const variantes = entradas.filter((e) => e.descripcion);
      if (entradas.length < 2 || variantes.length === entradas.length) continue;
      for (const v of variantes) {
        const rarity = `${imp.rarity} (${titulo(v.descripcion)})`;
        if (![...impresiones, ...nuevas].some((x) => x.code === imp.code && x.rarity === rarity)) nuevas.push({ ...imp, rarity });
      }
    }
    if (nuevas.length === 0) continue;
    const todas = [...impresiones, ...nuevas];
    if (new Set(todas.map((i) => i.rarity)).size !== productosCarta.length) continue;
    sinProducto.delete(`${exp}|${n}`);
    asignarEnOrden(todas, productosCarta, `${exp}|${n}`);
    variantesAnadidas += nuevas.length;
  }
} catch (e) {
  console.warn(`No se pudieron buscar en Yugipedia las variantes de arte: ${e.message}`);
}

/*
 * Ultra Rare con letras plateadas. En Battles of Legend: Chapter 1 cada Ultra
 * Rare sale con el nombre en letras normales y en plateadas (cada sobre trae 1
 * normal y 2 plateadas), y Cardmarket las separa en "V.1" y "V.2 - Special".
 * Ni YGOPRODeck ni Yugipedia las distinguen, y con una sola Ultra por carta se
 * le daba el producto más barato, que suele ser la plateada.
 *
 * Cardmarket creó primero todas las normales y después, en otro bloque, las
 * plateadas (Number 39: Utopia: 756011 la V.1 y 756047 la V.2), así que por
 * número de producto: los más bajos son las versiones normales (las Secret y
 * las Ultra, por orden de código) y los últimos, las plateadas. Comprobado con
 * Utopia en la web de Cardmarket. Si una carta no tiene justo los productos
 * esperados, se deja como estaba. La lista de cartas sale de Yugipedia, porque
 * a YGOPRODeck le faltan algunas (Utopia no la tiene en BLC1). La misma lista
 * de colecciones está en la web, en services/versiones.ts.
 */
const CON_ESPECIAL = [{ set: 'Battles of Legend: Chapter 1', lista: 'Set Card Lists:Battles of Legend: Chapter 1 (TCG-EN)' }];
const RAREZA_ESPECIAL = 'Ultra Rare (Special)';
let especiales = 0;
try {
  const idDeNombre = new Map(cartas.map((c) => [norm(c.name), c.id]));
  for (const { set, lista } of CON_ESPECIAL) {
    const exp = emparejados.find(([nombre]) => nombre === set)?.[1];
    if (exp == null) continue;
    const url = new URL('https://yugipedia.com/api.php');
    for (const [k, v] of Object.entries({ action: 'query', prop: 'revisions', rvprop: 'content', format: 'json', formatversion: '2', titles: lista })) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (!res.ok) throw new Error(`Yugipedia respondió ${res.status}`);
    const texto = (await res.json()).query.pages[0]?.revisions?.[0]?.content ?? '';
    // "BLC1-EN039; Number 39: Utopia; Ultra Rare // description::…"
    const porCarta = new Map();
    for (const linea of texto.split('\n')) {
      const [code, nombre, rareza] = linea.split(';').map((x) => x.split('//')[0].trim());
      if (!/^[A-Z0-9]+-[A-Z]{2}\d+$/.test(code ?? '') || !nombre) continue;
      const n = norm(nombre);
      if (!porCarta.has(n)) porCarta.set(n, []);
      porCarta.get(n).push({ code, rarity: rareza || 'Common' });
    }
    for (const [n, impresiones] of porCarta) {
      const id = idDeNombre.get(n);
      const ultras = impresiones.filter((i) => i.rarity === 'Ultra Rare').sort((a, b) => a.code.localeCompare(b.code));
      if (id == null || ultras.length === 0) continue;
      const normales = [...impresiones].sort((a, b) => a.code.localeCompare(b.code));
      const productosCarta = (expansiones.get(exp).get(n) ?? []).filter((p) => precioProducto.has(p.idProduct)).sort((a, b) => a.idProduct - b.idProduct);
      if (productosCarta.length !== normales.length + ultras.length) continue;
      const asignar = (imp, rarity, producto) => {
        const clave = `${imp.code}|${rarity}`;
        const precio = precioProducto.get(producto.idProduct);
        for (const m of [deHoy, cifrasDe, productoDe]) if (!m.has(id)) m.set(id, {});
        deHoy.get(id)[clave] = precio.ref;
        cifrasDe.get(id)[clave] = precio.cifras;
        productoDe.get(id)[clave] = producto.idProduct;
        asignados.add(producto.idProduct);
      };
      normales.forEach((imp, i) => asignar(imp, imp.rarity, productosCarta[i]));
      ultras.forEach((imp, i) => asignar(imp, RAREZA_ESPECIAL, productosCarta[normales.length + i]));
      especiales += ultras.length;
    }
  }
} catch (e) {
  console.warn(`No se pudieron separar las Ultra Rare de letras plateadas: ${e.message}`);
}

/*
 * Productos sobrantes. A YGOPRODeck le faltan impresiones (p. ej. Number 39:
 * Utopia en la lata TN23, aunque el set sí lo tiene con otras cartas). Esas
 * impresiones están en Cardmarket, en la expansión ya emparejada, pero sin
 * versión a la que asignarlas. Se publican con el prefijo del set (TN23) para
 * que la web las case con las versiones que trae de Yugipedia.
 */
const idPorNombre = new Map();
for (const carta of cartas) idPorNombre.set(norm(carta.name), carta.id);
const prefijoDe = new Map(setsYgo.map((x) => [x.set_name, String(x.set_code || '').toUpperCase()]));
/** id → [[prefijo, set, idProduct, desde, tendencia, media1, media7, media30], ...] */
const sobrantes = new Map();
let numSobrantes = 0;
for (const [nombreSet, exp] of emparejados) {
  const prefijo = prefijoDe.get(nombreSet);
  if (!prefijo) continue;
  for (const [n, productosExp] of expansiones.get(exp)) {
    const id = idPorNombre.get(n);
    if (id == null || sinProducto.has(`${exp}|${n}`)) continue;
    for (const pr of productosExp) {
      const precio = precioProducto.get(pr.idProduct);
      if (!precio || asignados.has(pr.idProduct)) continue;
      const lista = sobrantes.get(id) ?? [];
      if (lista.some((x) => x[2] === pr.idProduct)) continue;
      lista.push([prefijo, nombreSet, pr.idProduct, ...precio.cifras]);
      sobrantes.set(id, lista);
      numSobrantes++;
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
// El historial apuntado con una rareza falsa pasa a la buena (BLMM-EN038|New → |Ultra Rare).
for (const [id, cambiosClave] of renombrar) {
  const porClave = historiales[id % TROZOS].cartas[id];
  if (!porClave) continue;
  for (const [vieja, buena] of cambiosClave) {
    if (porClave[vieja] && !porClave[buena]) porClave[buena] = porClave[vieja];
    delete porClave[vieja];
  }
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
  const actual = { v: VERSION_ACTUAL, actualizado: hoy, cartas: {}, productos: {}, sobrantes: {} };
  for (const [id, cifras] of cifrasDe) {
    if (id % TROZOS !== i) continue;
    actual.cartas[id] = cifras;
    actual.productos[id] = productoDe.get(id);
  }
  for (const [id, lista] of sobrantes) if (id % TROZOS === i) actual.sobrantes[id] = lista;
  await writeFile(join(CARPETA, `${i}.json`), JSON.stringify(historial));
  await writeFile(join(CARPETA, `actual-${i}.json`), JSON.stringify(actual));
}

if (process.env.INFORME) await writeFile(process.env.INFORME, JSON.stringify(informe));

/*
 * Nombres en español también con los números de los artes alternativos.
 * Yugipedia los da por el número impreso en la carta, pero YGOPRODeck a veces
 * usa como principal el de otro arte (Barrel Dragon: 81480461 en vez de
 * 81480460), y las copias guardadas con ese número salían en inglés. Va después
 * de actualizar-nombres.mjs (ver el workflow).
 */
let nombresAlias = 0;
try {
  const archivo = join(CARPETA, 'nombres-es.json');
  const datos = JSON.parse(await readFile(archivo, 'utf8'));
  if (datos?.v === 1) {
    const porId = new Map(datos.nombres);
    for (const c of cartas) {
      const ids = [c.id, ...(c.card_images ?? []).map((i) => i.id)];
      const nombre = ids.map((i) => porId.get(i)).find(Boolean);
      if (!nombre) continue;
      for (const i of ids) {
        if (porId.has(i)) continue;
        porId.set(i, nombre);
        nombresAlias++;
      }
    }
    if (nombresAlias) await writeFile(archivo, JSON.stringify({ ...datos, nombres: [...porId] }));
  }
} catch {
  // Sin archivo de nombres no hay nada que completar.
}
console.log(
  `${conPrecio} de ${versiones} versiones con precio de Cardmarket (${setsSinPareja} sets sin pareja); ${numSobrantes} productos sobrantes; ${cambios} precios nuevos o cambiados; ${rarezasCorregidas} rarezas corregidas con Yugipedia; ${especiales} Ultra Rare de letras plateadas; ${dudasResueltas} de ${dudosas.length} cartas con rarezas de más resueltas con Yugipedia; ${variantesAnadidas} variantes de arte añadidas (${conVariantes.length} cartas con más productos que rarezas); ${nombresAlias} nombres en español para artes alternativos.`,
);
