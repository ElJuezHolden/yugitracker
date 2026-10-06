import type { ApiCard, CardSet } from '../types';

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
 *   precios/actual-NN.json  el precio de hoy de cada versión
 *   precios/NN.json         su historial (solo los días en que cambia)
 * Las cartas van repartidas en 100 archivos por `id % 100`.
 */
const TROZOS = 100;
const DIA_MS = 24 * 60 * 60 * 1000;
const FORMATO = 2;

interface TrozoActual {
  v: number;
  actualizado: number;
  /** id → clave de impresión → euros */
  cartas: Record<string, Record<string, number>>;
}
interface TrozoHistorial {
  v: number;
  actualizado: number;
  /** id → clave de impresión → [día, euros], solo cuando cambia el precio. */
  cartas: Record<string, Record<string, [number, number][]>>;
}

const pedidos = new Map<string, Promise<unknown>>();

function pedir<T extends { v: number }>(archivo: string): Promise<T | null> {
  let p = pedidos.get(archivo) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}precios/${archivo}`)
      .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
      .then((t) => (t?.v === FORMATO ? t : null))
      .catch(() => null);
    pedidos.set(archivo, p);
  }
  return p;
}

/** Olvida lo descargado de Cardmarket, para volver a pedirlo. */
export function forgetMarketData() {
  pedidos.clear();
}

const trozosDe = (ids: number[]) => [...new Set(ids.map((id) => id % TROZOS))];

export interface MarketPrices {
  /** id → clave de impresión → euros */
  porCarta: Map<number, Record<string, number>>;
  /** Día de los precios (ms), o `null` si no hay datos de Cardmarket. */
  fecha: number | null;
}

/** Precio de hoy en Cardmarket de cada versión de estas cartas. */
export async function loadMarketPrices(ids: number[]): Promise<MarketPrices> {
  const trozos = await Promise.all(trozosDe(ids).map((n) => pedir<TrozoActual>(`actual-${n}.json`)));
  const porCarta = new Map<number, Record<string, number>>();
  let fecha: number | null = null;
  for (const t of trozos) {
    if (!t) continue;
    fecha = fecha == null ? t.actualizado * DIA_MS : Math.min(fecha, t.actualizado * DIA_MS);
    for (const [id, precios] of Object.entries(t.cartas)) porCarta.set(Number(id), precios);
  }
  return { porCarta, fecha };
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
  const trozos = await Promise.all(trozosDe(ids).map(async (n) => [n, await pedir<TrozoHistorial>(`${n}.json`)] as const));
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
