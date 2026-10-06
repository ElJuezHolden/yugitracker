import type { CardSet } from '../types';

/*
 * Cruce de las versiones de YGOPRODeck con las de Yugipedia.
 *
 * YGOPRODeck no siempre trae bien la rareza: a las cartas recién salidas les
 * pone "New" hasta que la corrige, y en otras copia por error una nota de la
 * tabla de Yugipedia ("2", "Reprint", "New artwork", "European debut",
 * "force-SMW"…) o la escribe distinto ("PLatinum Secret Rare"). La versión
 * buena de Yugipedia (p. ej. BLMM-EN038 Ultra Rare) salía repetida y sin precio.
 * El proceso diario ya corrige esas rarezas antes de casar los precios (ver
 * scripts/actualizar-precios.mjs); aquí se corrige lo que se ve en la ficha.
 */

/** Rareza que no es una rareza de verdad (provisional o una nota copiada por error). */
export const isPlaceholderRarity = (rarity: string) => !/rare|common|short print/i.test(rarity);

const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export const sameRarity = (a: string, b: string) => normalizar(a) === normalizar(b);

export interface PrintingYugipedia {
  code: string;
  set: string;
  rarity: string;
}

export interface Cruce {
  /** Versiones de Yugipedia que faltan en YGOPRODeck. */
  nuevas: CardSet[];
  /**
   * Versiones de YGOPRODeck con rareza falsa que sobran porque Yugipedia da la
   * buena: clave de `claveVersion` → la versión que ocupa su lugar.
   */
  sustituidas: Map<string, CardSet>;
}

export const claveVersion = (code: string, rarity: string) => `${normalizar(code)}|${normalizar(rarity)}`;

export function cruzarVersiones(api: CardSet[], yugipedia: PrintingYugipedia[]): Cruce {
  const nuevas: CardSet[] = [];
  const sustituidas = new Map<string, CardSet>();
  const desdeYugipedia = (p: PrintingYugipedia): CardSet => ({
    set_name: p.set,
    set_code: p.code,
    set_rarity: p.rarity,
    set_rarity_code: '',
    set_price: '0',
    origen: 'yugipedia',
  });

  const porCodigo = new Map<string, PrintingYugipedia[]>();
  for (const p of yugipedia) {
    const c = normalizar(p.code);
    const lista = porCodigo.get(c) ?? [];
    // Sin repetir: el mismo código sale en en_sets, na_sets y eu_sets.
    if (!lista.some((x) => sameRarity(x.rarity, p.rarity))) lista.push(p);
    porCodigo.set(c, lista);
  }

  for (const [codigo, deYugipedia] of porCodigo) {
    const deApi = api.filter((s) => normalizar(s.set_code) === codigo);
    // Las que coinciden (sin distinguir mayúsculas) ya están.
    const casadas = deApi.filter((s) => deYugipedia.some((p) => sameRarity(s.set_rarity, p.rarity)));
    const sueltasYp = deYugipedia.filter((p) => !deApi.some((s) => sameRarity(s.set_rarity, p.rarity))).map(desdeYugipedia);
    const sueltasApi = deApi.filter((s) => !casadas.includes(s));
    const falsas = sueltasApi.filter((s) => isPlaceholderRarity(s.set_rarity));

    if (sueltasYp.length > 0 && sueltasApi.length === sueltasYp.length && falsas.length < sueltasApi.length) {
      // Tantas sin pareja a cada lado, y alguna con rareza de verdad (p. ej.
      // Short Print en YGOPRODeck y Common en Yugipedia): son las mismas cartas
      // con otro nombre. Se quedan las de YGOPRODeck, que es como están los
      // precios, salvo las de rareza falsa, que pasan a la de Yugipedia.
      sueltasApi.forEach((s, i) => {
        if (!isPlaceholderRarity(s.set_rarity)) return;
        sustituidas.set(claveVersion(s.set_code, s.set_rarity), sueltasYp[i]!);
        nuevas.push(sueltasYp[i]!);
      });
      continue;
    }

    // Si no: se añaden las que faltan, y las de rareza falsa sobran (las buenas
    // ya están, de YGOPRODeck o de Yugipedia).
    nuevas.push(...sueltasYp);
    const enSuLugar = sueltasYp[0] ?? casadas[0];
    if (enSuLugar) for (const s of falsas) sustituidas.set(claveVersion(s.set_code, s.set_rarity), enSuLugar);
  }
  return { nuevas, sustituidas };
}
