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
/** Rarezas abreviadas de las listas y galerías de Yugipedia ("SR", "ScR"…). */
const ABREVIADAS = {
  c: 'Common', sp: 'Short Print', ssp: 'Super Short Print', r: 'Rare', sr: 'Super Rare', ur: 'Ultra Rare', utr: 'Ultimate Rare',
  scr: 'Secret Rare', pscr: 'Prismatic Secret Rare', uscr: 'Ultra Secret Rare', plscr: 'Platinum Secret Rare', cr: "Collector's Rare",
  qcscr: 'Quarter Century Secret Rare', str: 'Starlight Rare', gr: 'Ghost Rare', gmr: 'Grand Master Rare', gur: 'Gold Rare',
  gscr: 'Gold Secret Rare', pgr: 'Premium Gold Rare', sfr: 'Starfoil Rare', msr: 'Mosaic Rare', shr: 'Shatterfoil Rare',
  urpr: "Ultra Rare (Pharaoh's Rare)", plr: 'Platinum Rare',
};
const rarezaCompleta = (r) => ABREVIADAS[plana(r)] ?? r;

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
        const [code, set, rarezas] = linea.split(';').map((x) => x.trim());
        if (!code || !rarezas) continue;
        for (const rarity of rarezas.split(',').map((r) => r.trim()).filter(Boolean)) impresiones.push({ code, set: set ?? '', rarity });
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

/*
 * Cartas que YGOPRODeck no tiene. Le faltan las "no jugables" y alguna más
 * (p. ej. "Yu-Gi-Oh! ZEXAL", LART-EN054 de las Lost Art), así que no salían en
 * el buscador aunque Cardmarket las vende. Se buscan así: los productos de
 * Cardmarket cuyo nombre no es de ninguna carta de YGOPRODeck se miran en
 * Yugipedia ("<nombre> (card)" o "<nombre>"); si tienen edición en inglés, se
 * crean con su código, rareza, imagen, texto y nombre en español, y se emparejan
 * con Cardmarket como las demás. Su número es 2.000.000.000 + el de la página de
 * Yugipedia (los de las cartas reales tienen 8 dígitos). La web las lee de
 * cartas-extra.json.
 */
const ID_EXTRA = 2_000_000_000;
const cartasExtra = [];
/** Nombre de Cardmarket (normalizado) → el de la carta de YGOPRODeck, cuando no coinciden. */
const otroNombre = new Map();
try {
  const nombresYgo = new Set(cartas.map((c) => norm(c.name)));
  const candidatos = [...new Set(productos.filter((p) => !nombresYgo.has(norm(p.name))).map((p) => p.name.trim()))];
  /** Set de YGOPRODeck por nombre, y el más grande de cada prefijo (para sets que YGOPRODeck no tiene). */
  const setsYgoPorNombre = new Set(setsYgo.map((x) => x.set_name));
  const mayorPorPrefijo = new Map();
  for (const x of setsYgo) {
    const pre = String(x.set_code || '').toUpperCase();
    if (!pre) continue;
    const ya = mayorPorPrefijo.get(pre);
    if (!ya || (x.num_of_cards ?? 0) > (ya.num_of_cards ?? 0)) mayorPorPrefijo.set(pre, x);
  }
  const limpiar = (t) =>
    t
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/'{2,}/g, '')
      .replace(/\{\{[^}]*\}\}/g, '')
      .trim();
  const campo = (texto, nombre) => new RegExp(`\\|\\s*${nombre}\\s*=\\s*([^\\n]*)`).exec(texto)?.[1]?.trim() ?? '';
  const encontradas = new Map();
  for (let i = 0; i < candidatos.length; i += 25) {
    const lote = candidatos.slice(i, i + 25);
    const url = new URL('https://yugipedia.com/api.php');
    const titulos = lote.flatMap((n) => [`${n} (card)`, n]);
    for (const [k, v] of Object.entries({ action: 'query', prop: 'revisions', rvprop: 'content', format: 'json', formatversion: '2', redirects: '1', titles: titulos.join('|') }))
      url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (!res.ok) throw new Error(`Yugipedia respondió ${res.status}`);
    const { query } = await res.json();
    const origen = new Map();
    for (const r of [...(query.normalized ?? []), ...(query.redirects ?? [])]) origen.set(r.to, origen.get(r.from) ?? r.from);
    for (const pg of query.pages ?? []) {
      const texto = pg.revisions?.[0]?.content ?? '';
      if (!texto.includes('CardTable2') || !/\|\s*(?:en|na|eu)_sets\s*=/.test(texto)) continue;
      const pedido = (origen.get(pg.title) ?? pg.title).replace(/ \(card\)$/, '');
      // Solo si la página es de esa carta: "Zane Truesdale Token" redirige a la
      // de las fichas en general, con decenas de códigos que no son suyos.
      if (norm(pg.title.replace(/ \(card\)$/, '')) !== norm(pedido)) continue;
      // Si salen las dos (con y sin "(card)"), vale la de "(card)".
      if (encontradas.has(pedido) && !pg.title.endsWith('(card)')) continue;
      encontradas.set(pedido, { pageid: pg.pageid, texto });
    }
    await esperar(1000);
  }
  // Imágenes: la URL de cada archivo, 50 por consulta.
  const imagenDe = new Map();
  const archivos = [...encontradas.values()].map((e) => campo(e.texto, 'image')).filter(Boolean);
  for (let i = 0; i < archivos.length; i += 50) {
    const url = new URL('https://yugipedia.com/api.php');
    for (const [k, v] of Object.entries({ action: 'query', prop: 'imageinfo', iiprop: 'url', format: 'json', formatversion: '2', titles: archivos.slice(i, i + 50).map((a) => `File:${a}`).join('|') }))
      url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (!res.ok) break;
    const { query } = await res.json();
    const origen = new Map((query.normalized ?? []).map((r) => [r.to, r.from]));
    for (const pg of query.pages ?? []) {
      const u = pg.imageinfo?.[0]?.url;
      if (u) imagenDe.set((origen.get(pg.title) ?? pg.title).replace(/^File:/, ''), u);
    }
    await esperar(1000);
  }
  const idsYgo = new Map(cartas.map((c) => [c.id, c]));
  for (const [nombre, { pageid, texto }] of encontradas) {
    // Si es una carta que YGOPRODeck sí tiene con otro nombre (Cardmarket
    // "Kuwagata alpha" = "Kuwagata α"), no es nueva: se apunta el nombre de
    // Cardmarket como suyo para casar sus productos.
    const password = Number.parseInt(campo(texto, 'password'), 10);
    const real = Number.isFinite(password) ? idsYgo.get(password) : undefined;
    if (real) {
      otroNombre.set(norm(nombre), norm(real.name));
      continue;
    }
    const impresiones = [];
    for (const m of texto.matchAll(/\|\s*(?:en|na|eu)_sets\s*=([\s\S]*?)(?=\n\s*\||\n\}\})/g)) {
      for (const linea of m[1].split('\n')) {
        const [code, set, rarezas] = linea.split(';').map((x) => x.trim());
        if (!code || !set || !rarezas) continue;
        for (const rarity of rarezas.split(',').map((r) => r.trim()).filter(Boolean)) {
          if (impresiones.some((x) => x.set_code === code && x.set_rarity === rarity)) continue;
          impresiones.push({ set_name: set, set_code: code, set_rarity: formaBuena.get(plana(rarity)) ?? rarity, set_rarity_code: '', set_price: '0' });
        }
      }
    }
    // Sin edición en inglés, o una página genérica (la de "Token" lista decenas de fichas distintas).
    if (!impresiones.length || impresiones.length > 20) continue;
    const imagen = imagenDe.get(campo(texto, 'image'));
    const id = ID_EXTRA + pageid;
    /*
     * Tipo como lo escribe YGOPRODeck ("Effect Monster", "Spell Card"…): decide
     * los filtros y, en el brillo del nombre, si las letras son claras u oscuras.
     * Las no jugables llevan entre paréntesis el marco que imitan: "Yu-Gi-Oh!
     * ZEXAL" tiene marco de Xyz (negro, letras claras).
     */
    const tipoCarta = campo(texto, 'card_type');
    const tiposMonstruo = campo(texto, 'types').split('/').map((x) => x.trim()).filter(Boolean);
    const marcos = { xyz: 'XYZ', link: 'Link', synchro: 'Synchro', fusion: 'Fusion', ritual: 'Ritual', spell: 'Spell', trap: 'Trap', effect: 'Effect', normal: 'Normal', token: 'Token' };
    let tipo;
    if (/non-game/i.test(tipoCarta)) {
      const marco = marcos[campo(texto, 'cardclass').toLowerCase()];
      tipo = marco ? `Non-game Card (${marco})` : 'Non-game Card';
    } else if (/token|counter/i.test(tipoCarta)) tipo = 'Token';
    else if (/spell/i.test(tipoCarta)) tipo = 'Spell Card';
    else if (/trap/i.test(tipoCarta)) tipo = 'Trap Card';
    else {
      const t = tiposMonstruo.map((x) => x.toLowerCase());
      tipo =
        t.includes('link') ? 'Link Monster'
        : t.includes('xyz') ? 'XYZ Monster'
        : t.includes('synchro') ? 'Synchro Monster'
        : t.includes('fusion') ? 'Fusion Monster'
        : t.includes('ritual') ? 'Ritual Effect Monster'
        : t.includes('pendulum') ? 'Pendulum Effect Monster'
        : t.includes('effect') ? 'Effect Monster'
        : 'Normal Monster';
    }
    const carta = {
      id,
      name: nombre,
      name_es: limpiar(campo(texto, 'es_name')) || undefined,
      type: tipo,
      frameType: tipo.toLowerCase().includes('non-game') ? 'non-game' : tipo.split(' ')[0].toLowerCase(),
      desc: limpiar(campo(texto, 'lore')) || limpiar(campo(texto, 'text')),
      race: /spell|trap/i.test(tipo) ? campo(texto, 'property') || 'Normal' : tiposMonstruo[0] ?? '',
      attribute: campo(texto, 'attribute') || undefined,
      card_sets: impresiones,
      card_images: imagen ? [{ id, image_url: imagen, image_url_small: imagen, image_url_cropped: imagen }] : [],
    };
    cartasExtra.push(carta);
    // Para emparejarla con Cardmarket, en un set que YGOPRODeck sí tenga: el
    // suyo, o el más grande con su prefijo ("The Lost Art Promotion 2022 L" no
    // está; "The Lost Art Promotion (series)", sí).
    cartas.push({
      ...carta,
      card_sets: impresiones.map((x) => {
        if (setsYgoPorNombre.has(x.set_name)) return x;
        const otro = mayorPorPrefijo.get(x.set_code.split('-')[0].toUpperCase());
        return otro ? { ...x, set_name: otro.set_name } : x;
      }),
    });
  }
} catch (e) {
  console.warn(`No se pudieron buscar en Yugipedia las cartas que le faltan a YGOPRODeck: ${e.message}`);
}
// Los productos de Cardmarket con otro nombre pasan al de su carta de YGOPRODeck.
for (const [deCm, deYgo] of otroNombre) {
  for (const id of expansionesDe.get(deCm) ?? []) {
    const e = expansiones.get(id);
    e.set(deYgo, [...(e.get(deYgo) ?? []), ...(e.get(deCm) ?? [])]);
    e.delete(deCm);
    if (!expansionesDe.has(deYgo)) expansionesDe.set(deYgo, new Set());
    expansionesDe.get(deYgo).add(id);
  }
  expansionesDe.delete(deCm);
}

/*
 * Reediciones del 25 aniversario ("Metal Raiders (25th Anniversary Edition)"…):
 * llevan el MISMO código que la original (MRD-EN071) y en Cardmarket son otra
 * expansión, con otro precio (Kuriboh: 0,48 € la original, unos 4,4 € la del 25
 * aniversario). YGOPRODeck las tiene a medias (14 cartas de Metal Raiders) y con
 * la misma rareza que la original, y Kuriboh ni salía. Se leen las listas
 * completas de Yugipedia y cada una va como versión aparte, con la rareza
 * marcada: "Super Rare (25th Anniversary Edition)", como las variantes de arte.
 * Así se agrupan en su propio set y casan con su expansión de Cardmarket (la de
 * 2023, por la fecha). La web marca igual las de YGOPRODeck y de Yugipedia.
 */
const SUFIJO_25 = ' (25th Anniversary Edition)';
let reediciones25 = 0;
try {
  for (const c of cartas)
    for (const x of c.card_sets ?? []) if (x.set_name.endsWith(SUFIJO_25) && !x.set_rarity.endsWith(SUFIJO_25)) x.set_rarity += SUFIJO_25;
  const titulos = [];
  for (let offset = 0; offset != null && offset < 500; ) {
    const url = new URL('https://yugipedia.com/api.php');
    for (const [k, v] of Object.entries({ action: 'query', list: 'search', format: 'json', srnamespace: '*', srwhat: 'title', srlimit: '50', sroffset: String(offset), srsearch: '"25th Anniversary Edition" TCG-EN' }))
      url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (!res.ok) throw new Error(`Yugipedia respondió ${res.status}`);
    const json = await res.json();
    for (const r of json.query?.search ?? []) if (/^Set Card Lists:.+ \(25th Anniversary Edition\) \(TCG-EN\)$/.test(r.title)) titulos.push(r.title);
    offset = json.continue?.sroffset ?? null;
    await esperar(1000);
  }
  const porNombre = new Map(cartas.map((c) => [norm(c.name), c]));
  /*
   * YGOPRODeck no tiene "Invasion of Chaos (25th Anniversary Edition)": sin fecha,
   * se casaba con la expansión original de Cardmarket y la reedición salía con el
   * precio de la original. La fecha de salida, de su página en Yugipedia.
   */
  const sinFecha = titulos.map((t) => t.replace(/^Set Card Lists:/, '').replace(/ \(TCG-EN\)$/, '')).filter((n) => !setsYgo.some((x) => x.set_name === n && x.tcg_date));
  if (sinFecha.length) {
    const url = new URL('https://yugipedia.com/api.php');
    for (const [k, v] of Object.entries({ action: 'query', prop: 'revisions', rvprop: 'content', format: 'json', formatversion: '2', titles: sinFecha.join('|') }))
      url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (!res.ok) throw new Error(`Yugipedia respondió ${res.status}`);
    for (const pg of (await res.json()).query?.pages ?? []) {
      const texto = pg.revisions?.[0]?.content ?? '';
      const fecha = /\|\s*(?:eu|na|en)_release_date\s*=\s*([^\n|<]+)/.exec(texto)?.[1]?.trim();
      const t = fecha ? Date.parse(fecha) : NaN;
      if (!Number.isFinite(t)) continue;
      const ya = setsYgo.find((x) => x.set_name === pg.title);
      const tcg_date = new Date(t).toISOString().slice(0, 10);
      if (ya) ya.tcg_date = tcg_date;
      else setsYgo.push({ set_name: pg.title, set_code: pg.title.slice(0, 3).toUpperCase(), tcg_date });
    }
    await esperar(1000);
  }
  for (let i = 0; i < titulos.length; i += 50) {
    const url = new URL('https://yugipedia.com/api.php');
    for (const [k, v] of Object.entries({ action: 'query', prop: 'revisions', rvprop: 'content', format: 'json', formatversion: '2', titles: titulos.slice(i, i + 50).join('|') }))
      url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (!res.ok) throw new Error(`Yugipedia respondió ${res.status}`);
    for (const pg of (await res.json()).query?.pages ?? []) {
      const texto = pg.revisions?.[0]?.content;
      if (!texto) continue;
      const set = pg.title.replace(/^Set Card Lists:/, '').replace(/ \(TCG-EN\)$/, '');
      for (const bloque of texto.split('{{Set list').slice(1)) {
        const porDefecto = /\|\s*rarities\s*=\s*([^|\n]+)/.exec(bloque)?.[1]?.trim() ?? 'Common';
        for (const linea of bloque.split('\n')) {
          // "MRD-EN071; Kuriboh; SR" o, con la rareza del bloque, "LOB-EN005; Mystical Elf".
          const m = /^([A-Z0-9]+-[A-Z]*\d+[A-Z]?)\s*;\s*([^;/]+?)\s*(?:;\s*([^;/]*))?(?:;|\/\/|$)/.exec(linea.trim());
          if (!m) continue;
          const carta = porNombre.get(norm(m[2].replace(/ \(card\)$/, '')));
          if (!carta) continue;
          for (const abreviada of (m[3]?.trim() || porDefecto).split(',').map((r) => r.trim()).filter(Boolean)) {
            const base = rarezaCompleta(abreviada);
            const rarity = (formaBuena.get(plana(base)) ?? base) + SUFIJO_25;
            if ((carta.card_sets ??= []).some((x) => x.set_code === m[1] && x.set_rarity === rarity)) continue;
            carta.card_sets.push({ set_name: set, set_code: m[1], set_rarity: rarity, set_rarity_code: '', set_price: '0' });
            reediciones25++;
          }
        }
      }
    }
    await esperar(1000);
  }
} catch (e) {
  console.warn(`No se pudieron leer las reediciones del 25 aniversario: ${e.message}`);
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
/*
 * Expansión de un prefijo entero (todas las Lost Art juntas, LART): para los
 * sets diminutos. YGOPRODeck tiene cada oleada de las Lost Art como un set de una
 * carta, y con una sola carta ni la fecha basta: Zombyra the Dark LART-EN059
 * ("The Lost Art Promotion 2023 F", 1-jun-2023) se iba a Beginner's Edition 2
 * del OCG, cuyo producto se dio de alta en mayo, más cerca que el de Lost Art
 * Promos (enero). Juntas, las ~60 Lost Art casan sin duda con Lost Art Promos.
 */
const expansionDePrefijo = new Map();
function expansionDelGrupo(prefijo) {
  if (expansionDePrefijo.has(prefijo)) return expansionDePrefijo.get(prefijo);
  const union = new Map();
  let numSets = 0;
  // Solo los sets diminutos del prefijo: un Sneak Peek o una Special Edition
  // comparten prefijo con su booster y no deben acabar en la expansión de este.
  for (const [nombre, cartasSet] of setsCartas) {
    if (cartasSet.size >= DIMINUTO) continue;
    if (setsYgo.find((x) => x.set_name === nombre)?.set_code?.toUpperCase() !== prefijo) continue;
    numSets++;
    for (const [n, v] of cartasSet) union.set(n, v);
  }
  let exp = null;
  if (numSets >= 3 && union.size >= DIMINUTO) {
    const comunes = new Map();
    for (const n of union.keys()) for (const id of expansionesDe.get(n) ?? []) comunes.set(id, (comunes.get(id) ?? 0) + 1);
    const mejor = [...comunes]
      .map(([id, inter]) => ({ id, cobertura: inter / union.size, parecido: inter / (union.size + expansiones.get(id).size - inter) }))
      .filter((x) => x.cobertura >= 0.6)
      .sort((a, b) => b.cobertura - a.cobertura || b.parecido - a.parecido)[0];
    exp = mejor?.id ?? null;
  }
  expansionDePrefijo.set(prefijo, exp);
  return exp;
}

function expansionDe(nombreSet, cartasSet) {
  // Set diminuto de un prefijo con varios sets: la expansión del prefijo, si tiene sus cartas.
  if (cartasSet.size < DIMINUTO) {
    const prefijo = String(setsYgo.find((x) => x.set_name === nombreSet)?.set_code || '').toUpperCase();
    const delGrupo = prefijo ? expansionDelGrupo(prefijo) : null;
    if (delGrupo != null && [...cartasSet.keys()].every((n) => expansiones.get(delGrupo).has(n))) return delGrupo;
  }
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

/*
 * Para ordenar productos por precio, la media de 30 días (si no hay, la
 * tendencia): se mueve despacio. Con la cifra de referencia (la más baja de las
 * medias, que incluye la de 1 día) dos rarezas de precio parecido se cruzaban
 * de un día a otro (BLMM-EN049: Starlight 5,90 € y Ultra 34,55 €, y al día
 * siguiente al revés).
 */
const precioEstable = (x) => x.precio.cifras[4] ?? x.precio.cifras[1] ?? x.precio.cifras[3] ?? x.precio.ref;

/*
 * Productos comprobados a mano en Cardmarket (versión y cifras de cada una, con
 * capturas): cuando en una expansión hay varios productos de la misma carta y
 * no se puede deducir cuál es cuál. Mandan sobre cualquier reparto.
 */
const PRODUCTO_CONFIRMADO = new Map([
  // Griffoh, Chaos Origins: V.1 Ultra (desde 6,98 €), V.2 Starlight (desde 35 €), V.3 la promo (desde 12 €).
  ['CORI-EN004|Ultra Rare', 894691],
  ['CORI-EN004|Starlight Rare', 894692],
  ['CORI-ENSP1|Secret Rare', 894704],
  // Mimighoul Charm, Rage of the Abyss: "V.2 - Ultra Rare" (número S01) es la promo.
  ['ROTA-ENSP1|Ultra Rare', 791270],
  ['ROTA-EN096|Quarter Century Secret Rare', 791268],
  ['ROTA-EN096|Secret Rare', 790127],
  // Galaxy Serpent, Judgment of the Light: V.1 Super Rare (número 000); la otra, la del Sneak Peek.
  ['JOTL-EN000|Super Rare', 263568],
  ['JOTL-ENSP1|Ultra Rare', 263674],
]);

/** Reparto del día anterior: id → (clave → idProduct), para no cambiarlo sin motivo. */
const repartoAnterior = new Map();
for (let i = 0; i < TROZOS; i++) {
  try {
    const previo = JSON.parse(await readFile(join(CARPETA, `actual-${i}.json`), 'utf8'));
    for (const [id, claves] of Object.entries(previo.productos ?? {})) repartoAnterior.set(Number(id), claves);
  } catch {
    // Primera vez o formato antiguo: sin reparto anterior.
  }
}

/**
 * Empareja rarezas y productos en orden: la rareza más alta, el producto más
 * caro (por precio estable). Si ayer se repartieron de otra forma y los precios
 * no la contradicen claramente (el que iba a la rareza más alta no cuesta menos
 * de 2/3 del de la de abajo), se mantiene la de ayer.
 */
function asignarEnOrden(impresiones, productosCarta, clave) {
  productosCarta = [...productosCarta].sort((a, b) => precioEstable(a) - precioEstable(b));
  const rarezas = [...new Set(impresiones.map((i) => i.rarity))].sort((a, b) => rango(a) - rango(b));
  const porRareza = new Map();
  if (productosCarta.length && productosCarta.length === rarezas.length) {
    rarezas.forEach((r, i) => porRareza.set(r, productosCarta[i]));
    if (rarezas.length > 1) {
      const ayer = repartoAnterior.get(impresiones[0].id) ?? {};
      const deAyer = rarezas.map((r) => {
        const idProduct = impresiones.filter((imp) => imp.rarity === r).map((imp) => ayer[`${imp.code}|${r}`]).find(Boolean);
        return productosCarta.find((x) => x.idProduct === idProduct);
      });
      const completo = deAyer.every(Boolean) && new Set(deAyer).size === deAyer.length;
      const coherente = completo && deAyer.every((x, i) => i === 0 || precioEstable(x) >= precioEstable(deAyer[i - 1]) * (2 / 3));
      if (coherente) rarezas.forEach((r, i) => porRareza.set(r, deAyer[i]));
    }
  }
  else if (productosCarta.length && rarezas.length === 1) {
    // Una rareza y varios productos (tiradas distintas de un set antiguo, como
    // LOB-000): el de ayer si sigue ahí, para no saltar de uno a otro; si no, el más barato.
    const ayer = repartoAnterior.get(impresiones[0].id) ?? {};
    const idAyer = impresiones.map((imp) => ayer[`${imp.code}|${imp.rarity}`]).find(Boolean);
    const elegido = productosCarta.find((x) => x.idProduct === idAyer) ?? productosCarta[0];
    /*
     * Pero nunca el que ya tiene otra versión de la carta con OTRA rareza: un
     * producto es una sola rareza. La JOTL-ENSP1 Ultra Rare de Galaxy Serpent
     * (Sneak Peek) se llevaba el mismo que la JOTL-EN000 Super Rare. Con la misma
     * rareza sí puede repetirse (Cardmarket junta Magic Ruler y Spell Ruler). Cuál
     * de los otros productos es el suyo no se sabe: sin precio, salvo que esté en
     * PRODUCTO_CONFIRMADO.
     */
    const otraRareza = Object.entries(productoDe.get(impresiones[0].id) ?? {}).some(
      ([k, idProduct]) => idProduct === elegido.idProduct && k.slice(k.indexOf('|') + 1) !== rarezas[0],
    );
    if (!otraRareza) porRareza.set(rarezas[0], elegido);
  }
  // Los comprobados a mano mandan sobre todo lo demás.
  for (const imp of impresiones) {
    const fijo = productosCarta.find((x) => x.idProduct === PRODUCTO_CONFIRMADO.get(`${imp.code}|${imp.rarity}`));
    if (fijo) porRareza.set(imp.rarity, fijo);
  }
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
 * Promos del lanzamiento con el prefijo del set: CORI-ENSP1 de Griffoh es la
 * Secret Rare del "Chaos Origins Premiere! promotional card". YGOPRODeck no la
 * tiene y Cardmarket la vende dentro de la expansión del set, así que había un
 * producto más que rarezas y la carta se quedaba sin precio (Griffoh: Ultra,
 * Starlight y esta). Se buscan en Yugipedia, de las cartas que siguen así, las
 * impresiones con el mismo prefijo y una colección que empiece por el nombre del
 * set, y con ellas cuadran rarezas y productos.
 *
 * Pero cuál es cuál NO se puede deducir: los archivos de Cardmarket no dicen la
 * rareza de cada producto, la promo no sigue el orden de precios (la Ultra Rare
 * ROTA-ENSP1 de Mimighoul Charm vale más que su Secret) ni el de fechas de alta
 * (en ROTA la Secret se dio de alta antes que la promo; en CORI, después). Se
 * probó a repartir por rareza y salieron cruzadas. Solo se ponen las de
 * PRODUCTO_CONFIRMADO, comprobadas en Cardmarket (versión y cifras de cada una);
 * las demás siguen sin precio, mejor que con el de otra versión.
 */
// PRODUCTO_CONFIRMADO: ver arriba, junto al reparto.
let promosAnadidas = 0;
try {
  // Todas, aunque la tabla de comprobados ya haya puesto precio a las de la carta principal (Griffoh).
  const pendientes = conVariantes;
  const nombreDe = new Map(cartas.map((c) => [norm(c.name), c.name]));
  for (let i = 0; i < pendientes.length; i += 50) {
    const lote = pendientes.slice(i, i + 50);
    const porNombre = await impresionesYugipedia([...new Set(lote.map((v) => nombreDe.get(v.n)).filter(Boolean))]);
    for (const v of lote) {
      const prefijo = v.impresiones[0].code.split('-')[0];
      const nuevas = [];
      for (const x of porNombre.get(nombreDe.get(v.n)) ?? []) {
        if (x.code.split('-')[0] !== prefijo || x.set === v.nombreSet || !x.set.startsWith(v.nombreSet)) continue;
        const rarity = formaBuena.get(plana(x.rarity)) ?? x.rarity;
        if ([...v.impresiones, ...nuevas].some((y) => y.code === x.code && y.rarity === rarity)) continue;
        nuevas.push({ ...v.impresiones[0], code: x.code, rarity });
      }
      if (nuevas.length === 0) continue;
      const todas = [...v.impresiones, ...nuevas];
      if (new Set(todas.map((x) => x.rarity)).size !== v.productosCarta.length) continue;
      const fijados = todas.map((x) => v.productosCarta.find((pr) => pr.idProduct === PRODUCTO_CONFIRMADO.get(`${x.code}|${x.rarity}`)));
      if (fijados.some((pr) => !pr) || new Set(fijados.map((pr) => pr.idProduct)).size !== fijados.length) continue;
      sinProducto.delete(`${v.exp}|${v.n}`);
      todas.forEach((imp, i) => {
        const producto = fijados[i];
        const clave = `${imp.code}|${imp.rarity}`;
        conPrecio++;
        asignados.add(producto.idProduct);
        if (!deHoy.has(imp.id)) deHoy.set(imp.id, {});
        deHoy.get(imp.id)[clave] = producto.precio.ref;
        if (!cifrasDe.has(imp.id)) cifrasDe.set(imp.id, {});
        cifrasDe.get(imp.id)[clave] = producto.precio.cifras;
        if (!productoDe.has(imp.id)) productoDe.set(imp.id, {});
        productoDe.get(imp.id)[clave] = producto.idProduct;
      });
      promosAnadidas += nuevas.length;
    }
    await esperar(1000);
  }
} catch (e) {
  console.warn(`No se pudieron buscar en Yugipedia las promos de lanzamiento: ${e.message}`);
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
  /*
   * Y lo apuntado antes del 7-oct-2026 se descarta una vez (`limpio`): ese día
   * cambió cómo se casa cada versión con su producto de Cardmarket, y muchos
   * puntos eran de otro producto (Zombyra the Dark LART-EN059 pasaba de 0,20 € de
   * Beginner's Edition a 2,34 € de Lost Art Promos: una "subida" del 1070 %).
   */
  historiales.push(
    trozo?.v === VERSION_HISTORIAL && trozo.limpio === 1
      ? { ...trozo, productos: trozo.productos ?? {} }
      : { v: VERSION_HISTORIAL, limpio: 1, actualizado: hoy, cartas: {}, productos: {} },
  );
}
/*
 * Nombres en español de las fichas (tokens). La lista de nombres sale de
 * Yugipedia por el número de la carta, y las fichas no tienen número: "Ancient
 * Gear Token" (SR03-ENTKN) no se encontraba buscando "Ficha Mecanismo Antiguo".
 * Se piden aparte y se casan por el nombre en inglés.
 */
const fichasEs = new Map();
try {
  for (const tipo of ['Token', 'Monster Token']) {
    for (let offset = 0; offset < 2000; offset += 500) {
      const consulta = `[[Card type::${tipo}]][[Spanish name::+]]|?Spanish name|?English name|limit=500|offset=${offset}`;
      const res = await fetch(`https://yugipedia.com/api.php?action=ask&format=json&query=${encodeURIComponent(consulta)}`, { headers: { 'User-Agent': AGENTE } });
      if (!res.ok) break;
      const json = await res.json();
      for (const [titulo, { printouts }] of Object.entries(json.query?.results ?? {})) {
        const es = printouts['Spanish name']?.[0];
        const en = printouts['English name']?.[0] ?? titulo.replace(/ \(card\)$/, '');
        if (typeof es === 'string' && es.trim() && typeof en === 'string') fichasEs.set(norm(en), es.trim());
      }
      await esperar(1000);
      if (json['query-continue-offset'] == null) break;
    }
  }
} catch {
  // Sin Yugipedia: las fichas siguen buscándose solo en inglés.
}

/*
 * Fichas (tokens) de la galería común de Yugipedia ("Card Gallery:Token (card)").
 * Muchas fichas no salen en ningún otro sitio:
 *   - las que solo dicen "Token" (en español, "Ficha"), sin nombre propio: las de
 *     eventos, campeonatos, Battle City… (TKN4, EV09…);
 *   - las que tienen nombre pero un arte que YGOPRODeck no tiene: LC03-EN006 y
 *     LC03-EN007, las fichas Kuriboh rosa y naranja de Legendary Collection 3
 *     (YGOPRODeck solo trae la de AC19/OP30).
 * Cada impresión en inglés que YGOPRODeck no tenga pasa a ser una carta extra con
 * su propia imagen. Sin precio: en Cardmarket se llaman casi todas igual y no hay
 * forma segura de saber qué producto es cuál.
 */
const ID_FICHA = ID_EXTRA + 500_000_000;
/** Número estable a partir del código (el mismo cada día). */
const numeroDe = (texto) => {
  let h = 5381;
  for (const ch of texto) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h % 400_000_000;
};
let fichasGaleria = 0;
let fichasConPrecio = 0;
/*
 * Fichas que en Cardmarket se llaman igual dentro de su expansión: qué producto
 * es cada una, comprobado en su página (el número que enseña Cardmarket) y con
 * sus cifras. LC03: "Kuriboh Token (V.2)" es la 006, la rosa (259189); la V.1,
 * la 007, la naranja (258848). Ojo: el orden de los códigos no sigue el de los
 * productos, por eso no se deduce.
 */
const PRODUCTO_FICHA = new Map([
  ['LC03-EN006', 259189],
  ['LC03-EN007', 258848],
]);
try {
  const url = new URL('https://yugipedia.com/api.php');
  for (const [k, v] of Object.entries({ action: 'query', prop: 'revisions', rvprop: 'content', format: 'json', formatversion: '2', titles: 'Card Gallery:Token (card)' }))
    url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
  if (!res.ok) throw new Error(`Yugipedia respondió ${res.status}`);
  const texto = (await res.json()).query?.pages?.[0]?.revisions?.[0]?.content ?? '';
  // Solo la sección en inglés: de su cabecera a la del siguiente idioma.
  const desde = texto.indexOf('{{GalleryHeader|lang=en}}');
  const hasta = texto.indexOf('{{GalleryHeader|', desde + 10);
  const ingles = desde >= 0 ? texto.slice(desde, hasta > desde ? hasta : undefined) : '';
  const ygoPorNombre = new Map(cartas.filter((c) => c.id < ID_EXTRA).map((c) => [norm(c.name), c]));
  const lineas = [];
  for (const linea of ingles.split('\n')) {
    const [archivo, ...resto] = linea.split('|');
    const enlaces = [...resto.join('|').matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim());
    const [code, abreviada] = enlaces;
    const rarity = abreviada ? ABREVIADAS[plana(abreviada)] : undefined;
    if (!code || !rarity || !/^[A-Z0-9]+-(EN)?\d+$/.test(code)) continue;
    // Las "Official Proxy" son copias de sustitución, no cartas que se vendan.
    if (enlaces.includes('Official Proxy')) continue;
    // Tras código y rareza: la edición (si la pone), la colección y, si tiene nombre, la ficha.
    const iSet = /Edition$/.test(enlaces[2] ?? '') ? 3 : 2;
    const set = enlaces[iSet];
    if (!set) continue;
    const nombrada = enlaces.slice(iSet + 1).find((x) => / Token$/.test(x));
    const base = nombrada ? ygoPorNombre.get(norm(nombrada)) : undefined;
    if (base?.card_sets?.some((x) => String(x.set_code).toUpperCase() === code)) continue; // Esa ya la tiene YGOPRODeck.
    lineas.push({ archivo: archivo.trim().replace(/^File:/, ''), code, rarity, set, nombre: nombrada ?? 'Token', base });
  }
  const imagenDe = new Map();
  const archivos = [...new Set(lineas.map((l) => l.archivo))];
  for (let i = 0; i < archivos.length; i += 50) {
    const u = new URL('https://yugipedia.com/api.php');
    for (const [k, v] of Object.entries({ action: 'query', prop: 'imageinfo', iiprop: 'url', format: 'json', formatversion: '2', titles: archivos.slice(i, i + 50).map((a) => `File:${a}`).join('|') }))
      u.searchParams.set(k, v);
    const r = await fetch(u, { headers: { 'User-Agent': AGENTE } });
    if (!r.ok) break;
    const { query } = await r.json();
    const origen = new Map((query.normalized ?? []).map((x) => [x.to, x.from]));
    for (const pg of query.pages ?? []) {
      const img = pg.imageinfo?.[0]?.url;
      if (img) imagenDe.set((origen.get(pg.title) ?? pg.title).replace(/^File:/, ''), img);
    }
    await esperar(1000);
  }
  for (const l of lineas) {
    // Por código y arte: algún código está repetido con dos dibujos (TKN4-EN020).
    const id = ID_FICHA + numeroDe(`${l.code}|${l.archivo}`);
    if (cartasExtra.some((c) => c.id === id)) continue;
    const imagen = imagenDe.get(l.archivo);
    cartasExtra.push({
      id,
      name: l.nombre,
      name_es: l.base ? fichasEs.get(norm(l.base.name)) : l.nombre === 'Token' ? 'Ficha' : fichasEs.get(norm(l.nombre)),
      type: 'Token',
      frameType: 'token',
      desc: l.base?.desc ?? '',
      race: l.base?.race ?? '',
      card_sets: [{ set_name: l.set, set_code: l.code, set_rarity: l.rarity, set_rarity_code: '', set_price: '0' }],
      card_images: imagen ? [{ id, image_url: imagen, image_url_small: imagen, image_url_cropped: imagen }] : [],
    });
    fichasGaleria++;
    /*
     * Precio: el producto de Cardmarket con su nombre en la expansión de su
     * colección, solo si es el único (y la única impresión así en la galería).
     * Si hay varios iguales (las dos Kuriboh de LC03 se llaman igual en los
     * archivos de Cardmarket), solo los de PRODUCTO_FICHA, comprobados a mano.
     */
    const exp = emparejados.find(([nombre]) => nombre === l.set)?.[1];
    const candidatos = exp != null ? (expansiones.get(exp)?.get(norm(l.nombre)) ?? []) : [];
    const fijado = PRODUCTO_FICHA.get(l.code);
    const iguales = lineas.filter((x) => x.set === l.set && x.nombre === l.nombre).length;
    const producto = fijado != null ? candidatos.find((x) => x.idProduct === fijado) : candidatos.length === 1 && iguales === 1 ? candidatos[0] : undefined;
    const precio = producto && precioProducto.get(producto.idProduct);
    if (precio) {
      const clave = `${l.code}|${l.rarity}`;
      deHoy.set(id, { [clave]: precio.ref });
      cifrasDe.set(id, { [clave]: precio.cifras });
      productoDe.set(id, { [clave]: producto.idProduct });
      fichasConPrecio++;
    }
  }
} catch (e) {
  console.warn(`No se pudo leer la galería de fichas de Yugipedia: ${e.message}`);
}
if (cartasExtra.length) await writeFile(join(CARPETA, 'cartas-extra.json'), JSON.stringify({ v: 1, actualizado: hoy, cartas: cartasExtra }));

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
  const trozo = historiales[id % TROZOS];
  const historial = (trozo.cartas[id] ??= {});
  // De qué producto de Cardmarket es cada historial: si la versión pasa a otro
  // producto, lo apuntado era de otra carta y se empieza de nuevo.
  const productosHistorial = (trozo.productos[id] ??= {});
  for (const [clave, eur] of Object.entries(precios)) {
    const producto = productoDe.get(id)?.[clave];
    if (producto != null && productosHistorial[clave] != null && productosHistorial[clave] !== producto) historial[clave] = [];
    if (producto != null) productosHistorial[clave] = producto;
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
      const es = fichasEs.get(norm(c.name));
      if (es && !porId.has(c.id)) {
        porId.set(c.id, es);
        nombresAlias++;
      }
    }
    // Las cartas que YGOPRODeck no tiene, también buscables en español.
    for (const c of cartasExtra) {
      if (c.name_es && !porId.has(c.id)) {
        porId.set(c.id, c.name_es);
        nombresAlias++;
      }
    }
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
  `${conPrecio} de ${versiones} versiones con precio de Cardmarket (${setsSinPareja} sets sin pareja); ${numSobrantes} productos sobrantes; ${cambios} precios nuevos o cambiados; ${rarezasCorregidas} rarezas corregidas con Yugipedia; ${especiales} Ultra Rare de letras plateadas; ${dudasResueltas} de ${dudosas.length} cartas con rarezas de más resueltas con Yugipedia; ${variantesAnadidas} variantes de arte añadidas, ${promosAnadidas} promos de lanzamiento (${conVariantes.length} cartas con más productos que rarezas); ${nombresAlias} nombres en español para artes alternativos; ${cartasExtra.length} cartas que YGOPRODeck no tiene, sacadas de Yugipedia (${fichasGaleria} fichas de su galería, ${fichasConPrecio} con precio); ${reediciones25} versiones de reediciones del 25 aniversario; ${otroNombre.size} nombres de Cardmarket casados con su carta.`,
);
