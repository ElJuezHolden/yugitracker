import type { ApiCard, CardSet } from '../types';
import { isPlaceholderRarity, sameRarity } from './versiones';

/*
 * Precios de mercado de las cartas.
 *
 * La fuente principal es Cardmarket (en euros, el mercado europeo): cada día
 * GitHub Actions empareja su guía pública de precios con cada versión de cada
 * carta (scripts/actualizar-precios.mjs) y lo publica con la web en /precios/.
 * Cubre más del 95 % de las versiones.
 *
 * Si una versión no está en Cardmarket se usa TCGplayer, que da YGOPRODeck:
 *   - `card_sets[].set_price`: el precio de UNA IMPRESIÓN concreta (set y
 *     rareza), en DÓLARES, pasado a euros al cambio del BCE (vía Frankfurter).
 *   - `card_prices[0].cardmarket_price` NO se usa: es el de la versión más
 *     barata de la carta, y con él un Dark Magician Ghost Rare saldría a 0,02 €.
 *
 * Los datos de YGOPRODeck se guardan un día en IndexedDB: también dan la lista
 * de versiones de cada carta, que hace falta para saber cuál es la de cada copia.
 */

const API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const FX_API = 'https://api.frankfurter.dev/v1/latest?from=USD&to=EUR';

/** Cuánto duran los precios guardados antes de volver a pedirlos. */
export const PRICE_TTL_MS = 24 * 60 * 60 * 1000;
const FX_TTL_MS = 12 * 60 * 60 * 1000;
/** Cambio de reserva si no se puede consultar el del BCE. */
const FALLBACK_USD_EUR = 0.9;
/** Cartas por petición: la API acepta varias ids separadas por comas. */
const BATCH = 40;
/** Separación entre peticiones: YGOPRODeck bloquea una hora al pasar de 20 por segundo. */
const GAP_MS = 250;

export interface Printing {
  code: string;
  name: string;
  rarity: string;
  rarityCode: string;
  /** En dólares; `null` si la API no tiene precio (viene como "0" o vacío). */
  usd: number | null;
}

export interface CardPrices {
  id: number;
  fetchedAt: number;
  printings: Printing[];
}

/** Precios de un día: euros de Cardmarket por impresión, con la clave de `printingKey`. */
export interface PricePoint {
  /** Día, como AAAA-MM-DD. */
  d: string;
  p: Record<string, number>;
}

export const printingKey = (code: string, rarity: string) => `${code}|${rarity}`;

/**
 * La clave con la que está guardado el precio de una versión. Normalmente es la
 * exacta, pero YGOPRODeck a veces trae mal la rareza ("New" en las cartas
 * recién salidas, una nota como "Reprint", "PLatinum Secret Rare"…) y el proceso
 * diario guardaba el precio con esa (ahora la corrige con Yugipedia). Así que,
 * si no está la exacta: la misma rareza escrita de otra forma; si no, la única
 * rareza falsa de ese código (BLMM-EN038 Ultra Rare → BLMM-EN038|New, en datos
 * antiguos); y al revés, una copia guardada con rareza falsa toma el único
 * precio de su código (BLMM-EN038 New → |Ultra Rare). Ver services/versiones.ts.
 */
export function resolvePrintingKey(claves: Iterable<string>, code: string, rarity: string): string {
  const exacta = printingKey(code, rarity);
  const delCodigo: string[] = [];
  const codigo = `${code}|`.toLowerCase();
  for (const k of claves) {
    if (k === exacta) return k;
    if (k.toLowerCase().startsWith(codigo)) delCodigo.push(k);
  }
  const rarezaDe = (k: string) => k.slice(codigo.length);
  const igual = delCodigo.find((k) => sameRarity(rarezaDe(k), rarity));
  if (igual) return igual;
  if (isPlaceholderRarity(rarity)) {
    if (delCodigo.length === 1) return delCodigo[0]!;
  } else {
    const falsas = delCodigo.filter((k) => isPlaceholderRarity(rarezaDe(k)));
    if (falsas.length === 1) return falsas[0]!;
  }
  return exacta;
}

export interface ExchangeRate {
  usdToEur: number;
  /** Fecha del cambio publicado por el BCE, o `null` si es el de reserva. */
  date: string | null;
  fallback: boolean;
}

/** Pasa las impresiones de la API a nuestro formato. Un precio "0" es que no hay dato. */
export function printingsFromApi(sets: CardSet[] | undefined): Printing[] {
  return (sets ?? []).map((s) => {
    const n = Number.parseFloat(s.set_price);
    return {
      code: s.set_code,
      name: s.set_name,
      rarity: s.set_rarity,
      rarityCode: s.set_rarity_code,
      usd: Number.isFinite(n) && n > 0 ? n : null,
    };
  });
}

/**
 * La impresión que corresponde a una copia de la colección.
 *
 * Se busca por código y rareza; si no casa (la rareza se pudo cambiar a mano en
 * el formulario), por código y código de rareza; y si un código solo tiene una
 * impresión, esa. Si nada de eso funciona no se adivina: mejor "sin precio"
 * que un precio de otra versión.
 */
export function findPrinting(
  printings: Printing[],
  setCode: string,
  rarity: string,
  rarityCode?: string,
): Printing | null {
  if (!setCode || setCode === '---') return null;
  const code = setCode.toLowerCase();
  const mismoCodigo = printings.filter((p) => p.code.toLowerCase() === code);
  if (mismoCodigo.length === 0) return null;

  const r = rarity.toLowerCase();
  return (
    mismoCodigo.find((p) => p.rarity.toLowerCase() === r) ??
    (rarityCode ? mismoCodigo.find((p) => p.rarityCode === rarityCode) : undefined) ??
    (mismoCodigo.length === 1 ? mismoCodigo[0] : undefined) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Caché en IndexedDB
// ---------------------------------------------------------------------------

const IDB_NAME = 'yugitracker-precios';
const STORE_CARDS = 'cartas';
const STORE_KV = 'kv';
const STORE_HISTORY = 'historial';
let idbPromise: Promise<IDBDatabase> | null = null;

function openIdb(): Promise<IDBDatabase> {
  if (!idbPromise) {
    idbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no está disponible'));
        return;
      }
      const req = indexedDB.open(IDB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CARDS)) db.createObjectStore(STORE_CARDS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
        if (!db.objectStoreNames.contains(STORE_HISTORY)) db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    idbPromise.catch(() => {
      idbPromise = null;
    });
  }
  return idbPromise;
}

function asPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Lo que haya guardado de estas cartas, sea reciente o no. */
export async function loadCachedPrices(ids: number[]): Promise<Map<number, CardPrices>> {
  const out = new Map<number, CardPrices>();
  try {
    const idb = await openIdb();
    const store = idb.transaction(STORE_CARDS, 'readonly').objectStore(STORE_CARDS);
    const filas = await Promise.all(ids.map((id) => asPromise(store.get(id) as IDBRequest<CardPrices | undefined>)));
    for (const f of filas) if (f) out.set(f.id, f);
  } catch (e) {
    console.error('No se pudieron leer los precios guardados:', e);
  }
  return out;
}

/*
 * Cardmarket: lo genera cada día GitHub Actions (scripts/actualizar-precios.mjs)
 * y se publica con la web. En local no existe: solo hay TCGplayer.
 *   precios/actual-NN.json  las cifras de hoy de cada versión (desde, tendencia, medias)
 *   precios/NN.json         su historial (solo los días en que cambia)
 * Las cartas van repartidas en 100 archivos por `id % 100`.
 */
const TROZOS = 100;
const DIA_MS = 24 * 60 * 60 * 1000;
const FORMATO_ACTUAL = 3;
const FORMATO_HISTORIAL = 2;

/** Cifras de Cardmarket de una versión, en euros (`null` si no la tiene). */
export interface PriceStats {
  /** "Desde": la oferta más barata (de cualquier idioma, estado y país). */
  low: number | null;
  trend: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
}

/** Con qué cifra se valora: la de referencia o cualquiera de las de Cardmarket. */
export type PriceMetric = 'referencia' | keyof PriceStats;

export const PRICE_METRICS: { id: PriceMetric; etiqueta: string; ayuda: string }[] = [
  {
    id: 'referencia',
    etiqueta: 'Referencia',
    ayuda: 'La más baja de las medias de 1, 7 y 30 días: una venta suelta disparatada no la infla.',
  },
  { id: 'low', etiqueta: 'Desde', ayuda: 'La oferta más barata ahora mismo (de cualquier idioma, estado y país).' },
  { id: 'trend', etiqueta: 'Tendencia', ayuda: 'La tendencia de precio que calcula Cardmarket.' },
  { id: 'avg30', etiqueta: 'Media 30 días', ayuda: 'Precio medio de venta del último mes.' },
  { id: 'avg7', etiqueta: 'Media 7 días', ayuda: 'Precio medio de venta de la última semana.' },
  { id: 'avg1', etiqueta: 'Media 1 día', ayuda: 'Precio medio de venta del último día.' },
];

/**
 * La cifra elegida de una versión. La de referencia es la más baja de las
 * medias de 1, 7 y 30 días (o la tendencia si no hay medias): la misma regla
 * que usa scripts/actualizar-precios.mjs para el historial.
 */
export function statValue(stats: PriceStats, metric: PriceMetric): number | null {
  if (metric !== 'referencia') return stats[metric];
  const medias = [stats.avg1, stats.avg7, stats.avg30].filter((x): x is number => x != null);
  return medias.length ? Math.min(...medias) : stats.trend;
}

interface TrozoActual {
  v: number;
  actualizado: number;
  /** id → clave de impresión → [desde, tendencia, media1, media7, media30] */
  cartas: Record<string, Record<string, (number | null)[]>>;
  /** id → clave de impresión → número de producto en Cardmarket (para enlazar a su página). */
  productos?: Record<string, Record<string, number>>;
  /** id → productos de Cardmarket sin versión en YGOPRODeck: [prefijo, set, idProduct, desde, tendencia, media1, media7, media30] */
  sobrantes?: Record<string, (string | number | null)[][]>;
}

/**
 * Producto de Cardmarket que no casa con ninguna versión de YGOPRODeck (le
 * faltan impresiones). Se casa en la web con las versiones de Yugipedia por el
 * prefijo del set (TN23-EN013 → TN23).
 */
export interface Sobrante {
  prefijo: string;
  set: string;
  idProduct: number;
  stats: PriceStats;
}

// Rarezas de menor a mayor (la misma escala que el proceso diario).
const RAREZAS = [
  'common', 'short print', 'super short print', 'rare', 'super rare', 'ultra rare', 'ultimate rare', 'secret rare',
  'prismatic secret rare', 'ultra secret rare', 'platinum secret rare', "collector's rare", 'quarter century secret rare',
  'starlight rare', 'ghost rare', 'grand master rare',
];
const rangoRareza = (r: string) => {
  const i = RAREZAS.indexOf(r.toLowerCase().trim());
  return i < 0 ? RAREZAS.indexOf('ultra rare') : i;
};

/**
 * El producto sobrante que corresponde a una versión: el de su mismo set; si hay
 * varios (varias rarezas en el set), el más caro para las rarezas altas (de
 * Secret para arriba) y el más barato para las demás.
 */
export function leftoverFor(sobrantes: Sobrante[] | undefined, code: string, rarity: string): Sobrante | null {
  if (!sobrantes?.length) return null;
  const prefijo = code.split('-')[0]?.toUpperCase();
  const delSet = sobrantes
    .filter((s) => s.prefijo === prefijo)
    .sort((a, b) => (statValue(a.stats, 'referencia') ?? 0) - (statValue(b.stats, 'referencia') ?? 0));
  if (delSet.length === 0) return null;
  return rangoRareza(rarity) >= rangoRareza('secret rare') ? delSet[delSet.length - 1]! : delSet[0]!;
}
interface TrozoHistorial {
  v: number;
  actualizado: number;
  /** id → clave de impresión → [día, euros], solo cuando cambia el precio. */
  cartas: Record<string, Record<string, [number, number][]>>;
}

const pedidos = new Map<string, Promise<unknown>>();

/*
 * GitHub Pages deja que el navegador guarde los archivos 10 minutos. Tras un
 * cambio de formato, el navegador seguía usando el archivo viejo, la web lo
 * descartaba y todas las cartas salían "sin precio". Por eso se pide con
 * `no-cache` (se pregunta al servidor si ha cambiado; si no, no se descarga
 * otra vez) y un fallo no se recuerda: se reintenta en la siguiente petición.
 */
function pedir<T extends { v: number }>(archivo: string, formato: number): Promise<T | null> {
  let p = pedidos.get(archivo) as Promise<T | null> | undefined;
  if (!p) {
    const peticion = fetch(`${import.meta.env.BASE_URL}precios/${archivo}`, { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
      .then((t) => (t?.v === formato ? t : null))
      .catch(() => null);
    peticion.then((t) => {
      if (t == null) pedidos.delete(archivo);
    });
    p = peticion;
    pedidos.set(archivo, p);
  }
  return p;
}

/**
 * Parte del precio de mercado que vale una copia según su estado. Cardmarket
 * da un precio por versión que mezcla estados y en la práctica se parece al de
 * una NM; para el resto se aplica este descuento, que es una ESTIMACIÓN (no
 * hay precios públicos por estado).
 */
export const CONDITION_FACTOR: Record<string, number> = {
  MT: 1,
  NM: 1,
  EX: 0.85,
  GD: 0.75,
  LP: 0.6,
  PL: 0.4,
  PO: 0.25,
};
export const conditionFactor = (condition: string | undefined) => CONDITION_FACTOR[condition ?? 'NM'] ?? 1;

/**
 * Precio de una versión en euros, con la cifra elegida de Cardmarket (si esa
 * versión no la tiene, la de referencia). Si la versión no está en Cardmarket,
 * el de TCGplayer pasado a euros, y se dice. Lo usan todas las pantallas, para
 * que la misma versión no salga con dos precios distintos.
 */
export function versionPrice(
  cardmarket: Record<string, PriceStats> | undefined,
  set: CardSet,
  rate: ExchangeRate | null,
  metric: PriceMetric = 'referencia',
  sobrantes?: Sobrante[],
): { eur: number; deTcgplayer: boolean } | null {
  const stats =
    cardmarket?.[resolvePrintingKey(Object.keys(cardmarket ?? {}), set.set_code, set.set_rarity)] ??
    leftoverFor(sobrantes, set.set_code, set.set_rarity)?.stats;
  const cm = stats ? (statValue(stats, metric) ?? statValue(stats, 'referencia')) : null;
  if (cm != null) return { eur: cm, deTcgplayer: false };
  const usd = Number.parseFloat(set.set_price);
  if (rate && Number.isFinite(usd) && usd > 0) return { eur: usd * rate.usdToEur, deTcgplayer: true };
  return null;
}

/** Olvida lo descargado de Cardmarket, para volver a pedirlo. */
export function forgetMarketData() {
  pedidos.clear();
}

const trozosDe = (ids: number[]) => [...new Set(ids.map((id) => id % TROZOS))];

export interface MarketPrices {
  /** id → clave de impresión → cifras de Cardmarket */
  porCarta: Map<number, Record<string, PriceStats>>;
  /** id → clave de impresión → número de producto en Cardmarket */
  productos: Map<number, Record<string, number>>;
  /** id → productos de Cardmarket sin versión en YGOPRODeck */
  sobrantes: Map<number, Sobrante[]>;
  /** Día de los precios (ms), o `null` si no hay datos de Cardmarket. */
  fecha: number | null;
}

/** Precio de hoy en Cardmarket de cada versión de estas cartas. */
export async function loadMarketPrices(ids: number[]): Promise<MarketPrices> {
  const trozos = await Promise.all(trozosDe(ids).map((n) => pedir<TrozoActual>(`actual-${n}.json`, FORMATO_ACTUAL)));
  const porCarta = new Map<number, Record<string, PriceStats>>();
  const productos = new Map<number, Record<string, number>>();
  const sobrantes = new Map<number, Sobrante[]>();
  let fecha: number | null = null;
  for (const t of trozos) {
    if (!t) continue;
    fecha = fecha == null ? t.actualizado * DIA_MS : Math.min(fecha, t.actualizado * DIA_MS);
    for (const [id, versiones] of Object.entries(t.cartas)) {
      const porVersion: Record<string, PriceStats> = {};
      for (const [clave, [low, trend, avg1, avg7, avg30]] of Object.entries(versiones)) {
        porVersion[clave] = { low: low ?? null, trend: trend ?? null, avg1: avg1 ?? null, avg7: avg7 ?? null, avg30: avg30 ?? null };
      }
      porCarta.set(Number(id), porVersion);
    }
    for (const [id, ids] of Object.entries(t.productos ?? {})) productos.set(Number(id), ids);
    for (const [id, lista] of Object.entries(t.sobrantes ?? {})) {
      sobrantes.set(
        Number(id),
        lista.map(([prefijo, set, idProduct, low, trend, avg1, avg7, avg30]) => ({
          prefijo: String(prefijo),
          set: String(set),
          idProduct: Number(idProduct),
          stats: {
            low: (low as number | null) ?? null,
            trend: (trend as number | null) ?? null,
            avg1: (avg1 as number | null) ?? null,
            avg7: (avg7 as number | null) ?? null,
            avg30: (avg30 as number | null) ?? null,
          },
        })),
      );
    }
  }
  return { porCarta, productos, sobrantes, fecha };
}

const diaTexto = (dia: number) => new Date(dia * DIA_MS).toISOString().slice(0, 10);

/** Pasa los cambios de precio a un precio por día (el de cada cambio sigue hasta el siguiente). */
function expandir(historial: Record<string, [number, number][]>, hasta: number): Map<string, Record<string, number>> {
  const dias = new Map<string, Record<string, number>>();
  for (const [clave, puntos] of Object.entries(historial)) {
    puntos.forEach(([dia, eur], i) => {
      const fin = i + 1 < puntos.length ? puntos[i + 1]![0] : hasta + 1;
      for (let d = dia; d < fin; d++) {
        const texto = diaTexto(d);
        let p = dias.get(texto);
        if (!p) dias.set(texto, (p = {}));
        p[clave] = eur;
      }
    });
  }
  return dias;
}

/** Historial de precios de Cardmarket de varias cartas, un punto por día. */
export async function loadHistories(ids: number[]): Promise<Map<number, PricePoint[]>> {
  const trozos = await Promise.all(trozosDe(ids).map(async (n) => [n, await pedir<TrozoHistorial>(`${n}.json`, FORMATO_HISTORIAL)] as const));
  const porTrozo = new Map(trozos);
  const out = new Map<number, PricePoint[]>();
  for (const id of ids) {
    const trozo = porTrozo.get(id % TROZOS);
    const historial = trozo?.cartas[id];
    if (!trozo || !historial) continue;
    const dias = expandir(historial, trozo.actualizado);
    out.set(id, [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, p]) => ({ d, p })));
  }
  return out;
}

/** Historial de precios de una carta, del día más antiguo al más reciente. */
export async function loadHistory(id: number): Promise<PricePoint[]> {
  return (await loadHistories([id])).get(id) ?? [];
}

async function savePrices(prices: CardPrices[]) {
  try {
    const idb = await openIdb();
    const tx = idb.transaction(STORE_CARDS, 'readwrite');
    for (const p of prices) tx.objectStore(STORE_CARDS).put(p);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('No se pudieron guardar los precios:', e);
  }
}

// ---------------------------------------------------------------------------
// Peticiones
// ---------------------------------------------------------------------------

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pide a la API los precios de estas cartas, en lotes, y los guarda.
 * Las cartas que la API ya no reconozca simplemente no aparecen en el resultado.
 */
export async function fetchPrices(ids: number[], signal?: AbortSignal): Promise<CardPrices[]> {
  const resultado: CardPrices[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    if (signal?.aborted) break;
    if (i > 0) await esperar(GAP_MS);

    const lote = ids.slice(i, i + BATCH);
    const res = await fetch(`${API}?id=${lote.join(',')}`, { signal });
    // Un 400 significa que ninguna de las ids existe: no es un fallo de la red.
    if (res.status === 400) continue;
    if (!res.ok) throw new Error(`La API de precios respondió ${res.status}`);

    const json = (await res.json()) as { data?: ApiCard[] };
    const ahora = Date.now();
    const lotePrecios = (json.data ?? []).map((c) => ({
      id: c.id,
      fetchedAt: ahora,
      printings: printingsFromApi(c.card_sets),
    }));
    resultado.push(...lotePrecios);
    await savePrices(lotePrecios);
  }
  return resultado;
}

/** Cambio dólar → euro del BCE, guardado medio día. Nunca falla: si no puede, da uno aproximado. */
export async function getExchangeRate(): Promise<ExchangeRate> {
  try {
    const idb = await openIdb();
    const guardado = await asPromise(
      idb.transaction(STORE_KV, 'readonly').objectStore(STORE_KV).get('cambio') as IDBRequest<
        (ExchangeRate & { fetchedAt: number }) | undefined
      >,
    );
    if (guardado && !guardado.fallback && Date.now() - guardado.fetchedAt < FX_TTL_MS) {
      return { usdToEur: guardado.usdToEur, date: guardado.date, fallback: false };
    }
  } catch {
    // Sin caché: se pide de nuevo.
  }

  try {
    const res = await fetch(FX_API);
    if (!res.ok) throw new Error(`Cambio no disponible (${res.status})`);
    const json = (await res.json()) as { date?: string; rates?: { EUR?: number } };
    const usdToEur = json.rates?.EUR;
    if (!usdToEur || !Number.isFinite(usdToEur)) throw new Error('Respuesta de cambio sin EUR');

    const cambio: ExchangeRate = { usdToEur, date: json.date ?? null, fallback: false };
    try {
      const idb = await openIdb();
      idb.transaction(STORE_KV, 'readwrite').objectStore(STORE_KV).put({ ...cambio, fetchedAt: Date.now() }, 'cambio');
    } catch {
      // No poder guardarlo no impide usarlo.
    }
    return cambio;
  } catch (e) {
    console.warn('No se pudo consultar el cambio dólar-euro; se usa uno aproximado:', e);
    return { usdToEur: FALLBACK_USD_EUR, date: null, fallback: true };
  }
}
