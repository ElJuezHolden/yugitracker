import { useSyncExternalStore } from 'react';
import type { Card } from '../types';
import { loadSpanishNames } from '../services/cardService';

/*
 * Nombre visible de cada carta. Se elige en la cabecera:
 *   - 'copia': según el idioma de la copia (las ES en español; el resto en inglés).
 *   - 'es': todas en español (si no se conoce el nombre en español, en inglés).
 *   - 'en': todas en inglés.
 * Los nombres en español se descargan una sola vez y los comparten todas las cartas.
 */
export type NameMode = 'copia' | 'es' | 'en';
export const NAME_MODES: { id: NameMode; corto: string; etiqueta: string }[] = [
  { id: 'copia', corto: 'Auto', etiqueta: 'Según el idioma de cada copia' },
  { id: 'es', corto: 'ES', etiqueta: 'Todas en español' },
  { id: 'en', corto: 'EN', etiqueta: 'Todas en inglés' },
];

// --- Nombres en español ------------------------------------------------------

let nombres: Map<number, string> | null = null;
let pedido = false;
const oyentesNombres = new Set<() => void>();

function suscribirNombres(oyente: () => void) {
  oyentesNombres.add(oyente);
  if (!pedido) {
    pedido = true;
    loadSpanishNames().then((m) => {
      nombres = m;
      oyentesNombres.forEach((o) => o());
    });
  }
  return () => {
    oyentesNombres.delete(oyente);
  };
}

/** Mapa id → nombre en español (`null` mientras se cargan). */
export function useSpanishNames(): Map<number, string> | null {
  return useSyncExternalStore(suscribirNombres, () => nombres);
}

// --- Modo elegido (se recuerda en el navegador) -------------------------------

const CLAVE_MODO = 'yugi-tracker-modo-nombres';
let modo: NameMode = (() => {
  try {
    const guardado = localStorage.getItem(CLAVE_MODO);
    if (NAME_MODES.some((m) => m.id === guardado)) return guardado as NameMode;
  } catch {
    // Sin acceso al almacenamiento: el de por defecto.
  }
  return 'copia';
})();
const oyentesModo = new Set<() => void>();

export function setNameMode(nuevo: NameMode) {
  modo = nuevo;
  try {
    localStorage.setItem(CLAVE_MODO, nuevo);
  } catch {
    // No poder recordarlo no impide usarlo.
  }
  oyentesModo.forEach((o) => o());
}

export function useNameMode(): NameMode {
  return useSyncExternalStore(
    (oyente) => {
      oyentesModo.add(oyente);
      return () => {
        oyentesModo.delete(oyente);
      };
    },
    () => modo,
  );
}

// --- Nombre visible -----------------------------------------------------------

type ConNombre = Pick<Card, 'apiId' | 'name' | 'lang'> & { name_en?: string };

/** El nombre que se enseña de una carta, según el modo elegido. */
export function displayName(card: ConNombre, mapa: Map<number, string> | null, modoNombres: NameMode): string {
  const enEspanol = modoNombres === 'es' || (modoNombres === 'copia' && card.lang === 'ES');
  return enEspanol ? (mapa?.get(card.apiId) ?? card.name) : card.name;
}

/**
 * Nombre visible de una carta y, debajo, el otro (el inglés si se enseña el
 * español; o el `name_en` antiguo si lo hay y es distinto).
 */
export function useCardName(card: ConNombre): { nombre: string; otro: string | null } {
  const mapa = useSpanishNames();
  const modoNombres = useNameMode();
  const nombre = displayName(card, mapa, modoNombres);
  const otro = nombre !== card.name ? card.name : card.name_en && card.name_en !== card.name ? card.name_en : null;
  return { nombre, otro };
}
