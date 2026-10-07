import { useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { EXTRA_ID_MIN, getCardsByIds } from '../services/cardService';
import type { Card } from '../types';

/*
 * Nivel de los monstruos guardados antes de que se apuntara (para ordenar por
 * tipo y nivel). Se piden a YGOPRODeck, 50 por consulta, una sola vez por carta
 * y sesión; las que no tienen nivel (o no se encuentran) no se vuelven a pedir.
 */
const pedidas = new Set<number>();
const POR_CONSULTA = 50;

const esMonstruo = (c: Card) => /monster/i.test(c.type) && !/token/i.test(c.type);

export function useCardLevels() {
  const { state, dispatch } = useStore();
  const cartas = state.db.cards;

  useEffect(() => {
    const faltan = [
      ...new Set(cartas.filter((c) => c.level == null && esMonstruo(c) && c.apiId < EXTRA_ID_MIN && !pedidas.has(c.apiId)).map((c) => c.apiId)),
    ];
    if (faltan.length === 0) return;
    faltan.forEach((id) => pedidas.add(id));
    (async () => {
      const nivel: Record<number, number> = {};
      for (let i = 0; i < faltan.length; i += POR_CONSULTA) {
        try {
          for (const c of await getCardsByIds(faltan.slice(i, i + POR_CONSULTA))) {
            // Las Link traen nivel 0: cuenta su número de enlace.
            const n = /link/i.test(c.type) ? c.linkval : c.level;
            // Con todos sus números: YGOPRODeck puede devolverla con el de otro arte (Barrel Dragon).
            if (n != null) for (const id of [c.id, ...(c.card_images ?? []).map((i) => i.id)]) nivel[id] = n;
          }
        } catch {
          // Sin conexión con YGOPRODeck: esas se quedan sin nivel (salen las primeras de su tipo).
        }
      }
      if (Object.keys(nivel).length) dispatch({ type: 'SET_CARD_LEVELS', payload: nivel });
    })();
  }, [cartas, dispatch]);
}
