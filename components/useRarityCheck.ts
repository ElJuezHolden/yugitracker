import { useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { EXTRA_ID_MIN, getExtraCards, getYugipediaPrintingsBatch } from '../services/cardService';
import { isSpecialRarity, sameRarity } from '../services/versiones';

/*
 * Revisión de las rarezas de la colección.
 *
 * YGOPRODeck tiene versiones que no existen (todas las Lost Art también en
 * Common, MP22-EN081 de Ultimate Dragonic Utopia Ray en Prismatic Secret Rare,
 * la rareza provisional "New"…), y las copias que se guardaron con ellas
 * enseñaban esa rareza. Se consulta Yugipedia (50 cartas por consulta) y, si la
 * rareza guardada no existe para ese código y solo hay una posible, se corrige.
 * Cada copia se revisa una vez (se recuerda en este navegador).
 */
const CLAVE = 'yugi-tracker-rarezas-revisadas';

function leerRevisadas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function guardarRevisadas(revisadas: Set<string>) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify([...revisadas]));
  } catch {
    // Sin almacenamiento se volverá a revisar la próxima vez: no pasa nada.
  }
}

export function useRarityCheck() {
  const { state, dispatch, toast } = useStore();
  const cartas = state.db.cards;

  /*
   * Las cartas que YGOPRODeck no tiene (ver cardService) se guardaron al
   * principio con un tipo genérico; si su ficha ya trae otro (p. ej. "Non-game
   * Card (XYZ)" para "Yu-Gi-Oh! ZEXAL", que decide el brillo del nombre), se pone al día.
   */
  useEffect(() => {
    const extra = cartas.filter((c) => c.apiId >= EXTRA_ID_MIN);
    if (extra.length === 0) return;
    let vivo = true;
    getExtraCards().then((lista) => {
      if (!vivo) return;
      const porId = new Map(lista.map((c) => [c.id, c]));
      for (const c of extra) {
        const ficha = porId.get(c.apiId);
        // Sin los campos de tipo calculados del antiguo: los filtros los vuelven a sacar del nuevo.
        if (ficha && ficha.type !== c.type)
          dispatch({ type: 'UPDATE_CARD', payload: { ...c, type: ficha.type, cardType: undefined, monsterType: undefined, property: undefined } });
      }
    });
    return () => {
      vivo = false;
    };
  }, [cartas, dispatch]);

  useEffect(() => {
    const revisadas = leerRevisadas();
    const clave = (c: (typeof cartas)[number]) => `${c.apiId}|${c.setCode}|${c.rarity}`;
    const pendientes = cartas.filter(
      (c) => c.setCode && c.setCode !== '---' && !isSpecialRarity(c.rarity) && !revisadas.has(clave(c)),
    );
    if (pendientes.length === 0) return;

    let vivo = true;
    // Espera un poco: al cargar la colección o añadir varias seguidas, una sola revisión.
    const t = setTimeout(async () => {
      const impresiones = await getYugipediaPrintingsBatch(pendientes.map((c) => c.name));
      if (!vivo) return;
      const corregidas: string[] = [];
      for (const c of pendientes) {
        const deYugipedia = impresiones.get(c.name);
        if (!deYugipedia) continue; // No se pudo consultar: se intentará otra vez.
        revisadas.add(clave(c));
        const delCodigo = deYugipedia.filter((p) => p.code.toUpperCase() === c.setCode.toUpperCase());
        const rarezas = [...new Set(delCodigo.map((p) => p.rarity))];
        if (rarezas.length !== 1 || rarezas.some((r) => sameRarity(r, c.rarity))) continue;
        // Las variantes que separa Cardmarket ("Premium Gold Rare (Alternate Art)",
        // "Ultra Rare (Extended Art)"…) no salen como rareza aparte en Yugipedia: si la
        // rareza de base existe para ese código, la copia está bien. Antes se "corregía"
        // a la de base y se perdía la variante.
        const base = c.rarity.replace(/\s*\([^)]*\)\s*$/, '');
        if (base !== c.rarity && rarezas.some((r) => sameRarity(r, base))) continue;
        const buena = rarezas[0]!;
        dispatch({ type: 'UPDATE_CARD', payload: { ...c, rarity: buena, rarityCode: '' } });
        revisadas.add(`${c.apiId}|${c.setCode}|${buena}`);
        corregidas.push(`${c.name} ${c.setCode}: ${c.rarity} → ${buena}`);
      }
      guardarRevisadas(revisadas);
      if (corregidas.length > 0) {
        toast(
          corregidas.length === 1
            ? `Rareza corregida (no existía): ${corregidas[0]}`
            : `Corregidas ${corregidas.length} rarezas que no existían (p. ej. ${corregidas[0]})`,
        );
      }
    }, 1500);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [cartas, dispatch, toast]);
}
