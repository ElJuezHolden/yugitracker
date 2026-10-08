import type { Card, CardSort, SortDirection } from '../types';
import { compareNames, compareSetNumber, getRarityWeight, getTypeWeight } from '../utils';

/*
 * Orden de las cartas de una carpeta (el de la vista y el del álbum). Sacado de
 * App tal cual para que las hojas de buscadas para imprimir pongan cada carta en
 * la misma posición que el álbum de la web.
 */

/** Desempate: set, arte, rareza, estado e idioma. */
const compareAttributes = (a: Card, b: Card) => {
  const setDiff = compareNames(a.setCode || '', b.setCode || '');
  if (setDiff !== 0) return setDiff;
  const imgDiff = a.img.localeCompare(b.img);
  if (imgDiff !== 0) return imgDiff;
  const rarityDiff = (a.rarityCode || '').localeCompare(b.rarityCode || '');
  if (rarityDiff !== 0) return rarityDiff;
  const condDiff = a.condition.localeCompare(b.condition);
  if (condDiff !== 0) return condDiff;
  const langDiff = a.lang.localeCompare(b.lang);
  if (langDiff !== 0) return langDiff;
  return 0;
};

/**
 * Comparador para ordenar las cartas como la carpeta (null con orden manual: se
 * deja el orden guardado). `nombre` es el nombre que se ve (español o inglés) y
 * `valor`, el valor de mercado de la copia.
 */
export function compararCartas(
  sortCards: CardSort,
  sortCardsDir: SortDirection,
  nombre: (c: Card) => string,
  valor: (c: Card) => number | null,
): ((a: Card, b: Card) => number) | null {
  if (sortCards === 'manual') return null;
  const dir = sortCardsDir === 'asc' ? 1 : -1;
  return (a, b) => {
    if (sortCards === 'name') {
      const nameDiff = compareNames(nombre(a), nombre(b)) * dir;
      if (nameDiff !== 0) return nameDiff;
      const attrDiff = compareAttributes(a, b);
      if (attrDiff !== 0) return attrDiff;
      return 0;
    }
    if (sortCards === 'price') {
      // Por valor de mercado. Sin precio cuenta como -1 para que quede al final.
      const priceDiff = ((valor(b) ?? -1) - (valor(a) ?? -1)) * dir;
      if (priceDiff !== 0) return priceDiff;
      const tA = getTypeWeight(a.type);
      const tB = getTypeWeight(b.type);
      const typeDiff = (tA - tB) * dir;
      if (typeDiff !== 0) return typeDiff;
      const nameDiff = compareNames(nombre(a), nombre(b)) * dir;
      if (nameDiff !== 0) return nameDiff;
      return compareAttributes(a, b);
    }
    if (sortCards === 'rarity') {
      const wA = getRarityWeight(a.rarity);
      const wB = getRarityWeight(b.rarity);
      const rarityDiff = (wB - wA) * dir;
      if (rarityDiff !== 0) return rarityDiff;
      const nameDiff = compareNames(nombre(a), nombre(b)) * dir;
      if (nameDiff !== 0) return nameDiff;
      const attrDiff = compareAttributes(a, b);
      if (attrDiff !== 0) return attrDiff;
      return 0;
    }
    if (sortCards === 'set') {
      // Por número dentro del set: LART-SP001 antes que LART-EN029 (el idioma no cuenta).
      const setDiff = compareSetNumber(a.setCode, b.setCode) * dir;
      if (setDiff !== 0) return setDiff;
      return compareNames(nombre(a), nombre(b)) * dir;
    }
    if (sortCards === 'level') {
      // Por tipo de carta y, en los monstruos, por nivel (rango en las Xyz,
      // enlace en las Link); dentro de cada nivel, por nombre.
      const typeDiff = (getTypeWeight(a.type) - getTypeWeight(b.type)) * dir;
      if (typeDiff !== 0) return typeDiff;
      const levelDiff = ((a.level ?? 0) - (b.level ?? 0)) * dir;
      if (levelDiff !== 0) return levelDiff;
      const nameDiff = compareNames(nombre(a), nombre(b));
      if (nameDiff !== 0) return nameDiff;
      return compareAttributes(a, b);
    }
    if (sortCards === 'type') {
      const wA = getTypeWeight(a.type);
      const wB = getTypeWeight(b.type);
      const typeDiff = (wA - wB) * dir;
      if (typeDiff !== 0) return typeDiff;
      const nameDiff = compareNames(nombre(a), nombre(b)) * dir;
      if (nameDiff !== 0) return nameDiff;
      const attrDiff = compareAttributes(a, b);
      if (attrDiff !== 0) return attrDiff;
      return 0;
    }
    return 0;
  };
}
