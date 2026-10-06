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
  const cartas = await request(`id=${encontradas.map((n) => n.id).join(',')}&misc=yes`, signal);
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

  const [enIngles, enEspanol] = await Promise.all([
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
  ]);

  // Sin repetir: si una carta sale por los dos nombres, se queda con el español.
  const espanolPorId = new Map(enEspanol.map((c) => [c.id, c]));
  return [...enEspanol, ...enIngles.filter((c) => !espanolPorId.has(c.id))];
};

/** Ficha completa de una carta: primero por nombre exacto, luego aproximado. */
export const getCardDetails = async (
  name: string,
  signal?: AbortSignal,
): Promise<ApiCard | null> => {
  const cleanName = name.trim();
  if (!cleanName) return null;

  const exact = await request(`name=${encodeURIComponent(cleanName)}&misc=yes`, signal);
  if (exact.length > 0) return exact[0] ?? null;

  const fuzzy = await request(`fname=${encodeURIComponent(cleanName)}&misc=yes`, signal);
  return fuzzy[0] ?? null;
};
