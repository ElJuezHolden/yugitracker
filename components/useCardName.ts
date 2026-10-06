import { useSyncExternalStore } from 'react';
import type { Card } from '../types';
import { loadSpanishNames } from '../services/cardService';

/*
 * Nombre visible de cada copia según su idioma: las copias en español (ES)
 * salen con su nombre en español; el resto, con el inglés (no hay nombres en
 * japonés). Los nombres en español se descargan una sola vez y los comparten
 * todas las cartas.
 */
let nombres: Map<number, string> | null = null;
let pedido = false;
const oyentes = new Set<() => void>();

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  if (!pedido) {
    pedido = true;
    loadSpanishNames().then((m) => {
      nombres = m;
      oyentes.forEach((o) => o());
    });
  }
  return () => {
    oyentes.delete(oyente);
  };
}

/** Mapa id → nombre en español (`null` mientras se cargan). */
export function useSpanishNames(): Map<number, string> | null {
  return useSyncExternalStore(suscribir, () => nombres);
}

type ConNombre = Pick<Card, 'apiId' | 'name' | 'lang'> & { name_en?: string };

/** El nombre que se enseña de una copia. */
export function displayName(card: ConNombre, mapa: Map<number, string> | null): string {
  return card.lang === 'ES' ? (mapa?.get(card.apiId) ?? card.name) : card.name;
}

/**
 * Nombre visible de una copia y, debajo, el otro (el inglés si se enseña el
 * español; o el `name_en` antiguo si lo hay y es distinto).
 */
export function useCardName(card: ConNombre): { nombre: string; otro: string | null } {
  const mapa = useSpanishNames();
  const nombre = displayName(card, mapa);
  const otro = nombre !== card.name ? card.name : card.name_en && card.name_en !== card.name ? card.name_en : null;
  return { nombre, otro };
}
