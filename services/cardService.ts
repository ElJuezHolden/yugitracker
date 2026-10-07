import type { ApiCard } from '../types';
import { normalizeStr } from '../utils';

// API pública de YGOPRODeck (v7). No necesita clave.
const BASE_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';

/** Longitud mínima de búsqueda: por debajo, la API devuelve medio catálogo. */
export const MIN_QUERY_LENGTH = 3;

export class CardServiceError extends Error {}

interface ApiResponse {
  data?: ApiCard[];
}

/**
 * YGOPRODeck corta el acceso durante una hora al pasar de 20 peticiones por
 * segundo, así que conviene no acercarse: se guarda lo ya consultado y se
 * separan las llamadas seguidas.
 */
const cache = new Map<string, ApiCard[]>();
const MIN_GAP_MS = 120;
let lastRequestAt = 0;

async function request(params: string, signal?: AbortSignal): Promise<ApiCard[]> {
  const cached = cache.get(params);
  if (cached) return cached;

  const wait = Math.max(0, lastRequestAt + MIN_GAP_MS - Date.now());
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  if (signal?.aborted) throw new DOMException('Búsqueda cancelada', 'AbortError');
  lastRequestAt = Date.now();

  const res = await fetch(`${BASE_URL}?${params}`, { signal });

  // Un 400 es "no hay ninguna carta que encaje", no un fallo de la API.
  if (res.status === 400) return [];
  if (!res.ok) {
    throw new CardServiceError(
      res.status === 429
        ? 'Demasiadas búsquedas seguidas. Espera un momento e inténtalo otra vez.'
        : `La base de datos de cartas respondió con un error (${res.status}).`,
    );
  }

  const json = (await res.json()) as ApiResponse;
  const data = json.data ?? [];
  cache.set(params, data);
  return data;
}

/*
 * Nombres en español. La API de YGOPRODeck no los tiene; los saca cada semana
 * GitHub Actions de Yugipedia (scripts/actualizar-nombres.mjs) y se publican con
 * la web. Se descargan una vez (unos 500 kB) la primera vez que se busca.
 */
interface NombreEs {
  id: number;
  nombre: string;
  /** El nombre sin tildes ni mayúsculas, para comparar. */
  plano: string;
}
let nombresEs: Promise<NombreEs[]> | null = null;

function cargarNombresEs(): Promise<NombreEs[]> {
  if (!nombresEs) {
    nombresEs = fetch(`${import.meta.env.BASE_URL}precios/nombres-es.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<{ v: number; nombres: [number, string][] }>) : null))
      .then((j) => (j?.v === 1 ? j.nombres.map(([id, nombre]) => ({ id, nombre, plano: normalizeStr(nombre) })) : []))
      .catch(() => []);
    // Si no se pudo (p. ej. en local), se reintenta en la siguiente búsqueda.
    nombresEs.then((lista) => {
      if (lista.length === 0) nombresEs = null;
    });
  }
  return nombresEs;
}

/** Nombres en español de todas las cartas: id → nombre (vacío si no se pudieron cargar). */
export async function loadSpanishNames(): Promise<Map<number, string>> {
  return new Map((await cargarNombresEs()).map((n) => [n.id, n.nombre]));
}

/*
 * Cartas que YGOPRODeck no tiene: las no jugables (p. ej. "Yu-Gi-Oh! ZEXAL",
 * LART-EN054 de las Lost Art), fichas, cartas de premio… Las saca de Yugipedia
 * el proceso diario (scripts/actualizar-precios.mjs) y se publican con los
 * precios. Su número empieza en 2.000.000.000.
 */
export const EXTRA_ID_MIN = 2_000_000_000;
let cartasExtra: Promise<ApiCard[]> | null = null;

function cargarCartasExtra(): Promise<ApiCard[]> {
  if (!cartasExtra) {
    cartasExtra = fetch(`${import.meta.env.BASE_URL}precios/cartas-extra.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<{ v: number; cartas: ApiCard[] }>) : null))
      .then((j) => (j?.v === 1 ? j.cartas : []))
      .catch(() => []);
    // Si no se pudo (p. ej. en local), se reintenta la próxima vez.
    cartasExtra.then((lista) => {
      if (lista.length === 0) cartasExtra = null;
    });
  }
  return cartasExtra;
}

/** Toda la lista de cartas que YGOPRODeck no tiene (vacía si no se pudo cargar). */
export const getExtraCards = () => cargarCartasExtra();

/** Las cartas de la lista extra cuyo nombre (inglés o español) contiene todas las palabras. */
async function buscarExtra(tokens: string[]): Promise<ApiCard[]> {
  const lista = await cargarCartasExtra();
  return lista.filter((c) => {
    const nombres = `${normalizeStr(c.name)} ${normalizeStr(c.name_es ?? '')}`;
    return tokens.every((t) => nombres.includes(t));
  });
}

/** Cartas por número, de YGOPRODeck y de la lista extra. */
export const getCardsByIds = (ids: number[], signal?: AbortSignal) => porIds(ids, signal);

async function porIds(ids: number[], signal?: AbortSignal): Promise<ApiCard[]> {
  const normales = ids.filter((id) => id < EXTRA_ID_MIN);
  const extra = ids.filter((id) => id >= EXTRA_ID_MIN);
  const [deApi, deExtra] = await Promise.all([
    normales.length ? request(`id=${normales.join(',')}&misc=yes`, signal) : Promise.resolve([] as ApiCard[]),
    extra.length ? cargarCartasExtra().then((l) => l.filter((c) => extra.includes(c.id))) : Promise.resolve([] as ApiCard[]),
  ]);
  return [...deApi, ...deExtra];
}

/** Cartas cuyo nombre en español contiene todas las palabras buscadas. */
async function buscarEnEspanol(tokens: string[], signal?: AbortSignal): Promise<ApiCard[]> {
  const lista = await cargarNombresEs();
  const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Un número solo casa entero ("5" no encuentra el 85); las palabras, en cualquier sitio.
  const casa = tokens.map((t) => (/^\d+$/.test(t) ? new RegExp(`(^|\\D)${t}(\\D|$)`) : null));
  const alInicio = tokens.map((t) => new RegExp(`(^|[^a-z0-9])${escapar(t)}`));
  const puntos = (plano: string) => alInicio.filter((r) => r.test(plano)).length;
  const encontradas = lista
    .filter((n) => tokens.every((t, i) => (casa[i] ? casa[i]!.test(n.plano) : n.plano.includes(t))))
    // Primero las que tienen las palabras al principio de palabra, luego las que
    // empiezan por lo buscado, y de las más cortas a las más largas.
    .sort(
      (a, b) =>
        puntos(b.plano) - puntos(a.plano) ||
        Number(b.plano.startsWith(tokens[0]!)) - Number(a.plano.startsWith(tokens[0]!)) ||
        a.plano.length - b.plano.length,
    )
    .slice(0, MAX_RESULTADOS_ES);
  if (encontradas.length === 0) return [];
  const cartas = await porIds(encontradas.map((n) => n.id), signal);
  const nombre = new Map(encontradas.map((n) => [n.id, n.nombre]));
  const orden = new Map(encontradas.map((n, i) => [n.id, i]));
  return cartas.map((c) => ({ ...c, name_es: nombre.get(c.id) })).sort((a, b) => orden.get(a.id)! - orden.get(b.id)!);
}

/** Cuántas cartas se piden como mucho por nombre en español (una sola petición a la API). */
const MAX_RESULTADOS_ES = 40;

/**
 * Busca por nombre, en inglés o en español, o por el número de la carta.
 *
 * En inglés: la API solo admite un término, así que se consulta con la palabra
 * más larga (la que más descarta) y se afina aquí exigiendo que el nombre
 * contenga todas las demás. En español: en la lista de nombres de Yugipedia.
 */
export const searchCards = async (query: string, signal?: AbortSignal): Promise<ApiCard[]> => {
  // El número de la carta (passcode, abajo a la izquierda) es igual en todos los idiomas.
  const passcode = query.replace(/\s/g, '');
  if (/^\d{5,9}$/.test(passcode)) {
    return request(`id=${Number(passcode)}&misc=yes`, signal);
  }

  const tokens = normalizeStr(query)
    .split(' ')
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return [];

  const mainTerm = [...tokens].sort((a, b) => b.length - a.length)[0];
  if (!mainTerm) return [];

  const [enIngles, enEspanol, extra] = await Promise.all([
    request(`fname=${encodeURIComponent(mainTerm)}&misc=yes`, signal).then((data) =>
      data.filter((card) => {
        const name = normalizeStr(card.name);
        return tokens.every((token) => name.includes(token));
      }),
    ),
    buscarEnEspanol(tokens, signal).catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      return [] as ApiCard[];
    }),
    buscarExtra(tokens),
  ]);

  // Sin repetir: si una carta sale por los dos nombres, se queda con el español.
  const espanolPorId = new Map(enEspanol.map((c) => [c.id, c]));
  const vistas = new Set([...espanolPorId.keys(), ...enIngles.map((c) => c.id)]);
  return [...enEspanol, ...enIngles.filter((c) => !espanolPorId.has(c.id)), ...extra.filter((c) => !vistas.has(c.id))];
};

/*
 * Impresiones que le faltan a YGOPRODeck. Su base de datos no tiene todas: p. ej.
 * Number 39: Utopia no trae la TN23-EN013 (Quarter Century). La ficha de cada
 * carta en Yugipedia sí lista todas sus impresiones en inglés (campos en_sets,
 * na_sets y eu_sets), así que se piden ahí y se añaden las que falten.
 */
export interface Printing {
  code: string;
  set: string;
  rarity: string;
}
const impresionesPedidas = new Map<string, Promise<Printing[]>>();
const YUGIPEDIA = 'https://yugipedia.com/api.php';

async function textoDeYugipedia(titulo: string, signal?: AbortSignal): Promise<string | null> {
  const url = new URL(YUGIPEDIA);
  const params = { action: 'query', prop: 'revisions', rvprop: 'content', format: 'json', formatversion: '2', redirects: '1', origin: '*', titles: titulo };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal, headers: { 'Api-User-Agent': 'YugiTracker (coleccion personal)' } });
  if (!res.ok) return null;
  const json = (await res.json()) as { query?: { pages?: { revisions?: { content?: string }[] }[] } };
  const texto = json.query?.pages?.[0]?.revisions?.[0]?.content ?? null;
  return texto && texto.includes('CardTable2') ? texto : null;
}

/** Las impresiones en inglés de la ficha de Yugipedia (campos en_sets, na_sets y eu_sets). */
function impresionesDeTexto(texto: string): Printing[] {
  const impresiones: Printing[] = [];
  for (const campo of texto.matchAll(/\|\s*(?:en|na|eu)_sets\s*=([\s\S]*?)(?=\n\s*\||\n\}\})/g)) {
    for (const linea of campo[1]!.split('\n')) {
      const [code, set, rarezas] = linea.split(';').map((x) => x.trim());
      if (!code || !set || !rarezas) continue;
      for (const rarity of rarezas.split(',').map((r) => r.trim()).filter(Boolean)) impresiones.push({ code, set, rarity });
    }
  }
  return impresiones;
}

/** Impresiones en inglés de una carta según Yugipedia (vacío si no se pudo consultar). */
export function getYugipediaPrintings(nombreIngles: string, signal?: AbortSignal): Promise<Printing[]> {
  let p = impresionesPedidas.get(nombreIngles);
  if (!p) {
    p = (async () => {
      // Algunas cartas tienen página de desambiguación: la ficha es "Nombre (card)".
      const texto = (await textoDeYugipedia(nombreIngles, signal)) ?? (await textoDeYugipedia(`${nombreIngles} (card)`, signal));
      return texto ? impresionesDeTexto(texto) : [];
    })().catch(() => {
      impresionesPedidas.delete(nombreIngles);
      return [];
    });
    impresionesPedidas.set(nombreIngles, p);
  }
  return p;
}

/**
 * Impresiones de muchas cartas a la vez: 50 por consulta a Yugipedia en vez de
 * una (para revisar la colección entera). Comparte la caché con la de arriba.
 */
export async function getYugipediaPrintingsBatch(nombres: string[]): Promise<Map<string, Printing[]>> {
  const resultado = new Map<string, Printing[]>();
  const faltan: string[] = [];
  for (const n of new Set(nombres)) {
    const ya = impresionesPedidas.get(n);
    if (ya) resultado.set(n, await ya);
    else faltan.push(n);
  }
  for (let i = 0; i < faltan.length; i += 50) {
    const lote = faltan.slice(i, i + 50);
    const url = new URL(YUGIPEDIA);
    const params = { action: 'query', prop: 'revisions', rvprop: 'content', format: 'json', formatversion: '2', redirects: '1', origin: '*', titles: lote.join('|') };
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    try {
      const res = await fetch(url, { headers: { 'Api-User-Agent': 'YugiTracker (coleccion personal)' } });
      if (!res.ok) continue;
      const { query } = (await res.json()) as {
        query?: {
          normalized?: { from: string; to: string }[];
          redirects?: { from: string; to: string }[];
          pages?: { title: string; revisions?: { content?: string }[] }[];
        };
      };
      // Título de la página → nombre pedido (por si redirige).
      const origen = new Map<string, string>();
      for (const r of [...(query?.normalized ?? []), ...(query?.redirects ?? [])]) origen.set(r.to, origen.get(r.from) ?? r.from);
      for (const pg of query?.pages ?? []) {
        const texto = pg.revisions?.[0]?.content ?? '';
        if (!texto.includes('CardTable2')) continue;
        const nombre = origen.get(pg.title) ?? pg.title;
        const impresiones = impresionesDeTexto(texto);
        impresionesPedidas.set(nombre, Promise.resolve(impresiones));
        resultado.set(nombre, impresiones);
      }
    } catch {
      // Sin Yugipedia no se revisa ese lote: se intentará otro día.
    }
  }
  return resultado;
}

/** Ficha completa de una carta: primero por nombre exacto, luego aproximado. */
export const getCardDetails = async (
  name: string,
  signal?: AbortSignal,
): Promise<ApiCard | null> => {
  const cleanName = name.trim();
  if (!cleanName) return null;

  const exact = await request(`name=${encodeURIComponent(cleanName)}&misc=yes`, signal);
  if (exact.length > 0) return exact[0] ?? null;

  // Las que YGOPRODeck no tiene (no jugables, fichas…), de la lista extra.
  const extra = (await cargarCartasExtra()).find((c) => normalizeStr(c.name) === normalizeStr(cleanName));
  if (extra) return extra;

  const fuzzy = await request(`fname=${encodeURIComponent(cleanName)}&misc=yes`, signal);
  return fuzzy[0] ?? null;
};
