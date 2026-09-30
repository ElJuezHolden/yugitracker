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

/**
 * Busca por nombre. La API solo admite un término, así que se consulta con la
 * palabra más larga (la que más descarta) y se afina aquí exigiendo que el
 * nombre contenga todas las demás.
 */
export const searchCards = async (query: string, signal?: AbortSignal): Promise<ApiCard[]> => {
  // El número de la carta (passcode, abajo a la izquierda) es igual en todos los
  // idiomas: es la forma de encontrar una carta en español, ya que la API no
  // tiene nombres en español.
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

  const data = await request(`fname=${encodeURIComponent(mainTerm)}&misc=yes`, signal);
  return data.filter((card) => {
    const name = normalizeStr(card.name);
    return tokens.every((token) => name.includes(token));
  });
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
