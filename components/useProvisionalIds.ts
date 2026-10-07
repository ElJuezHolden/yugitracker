import { useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { getCardDetails, getCardsByIds } from '../services/cardService';

/*
 * Números provisionales de YGOPRODeck. Las cartas recién salidas tienen al
 * principio un número corto (Griffoh: 22953) y, cuando se conoce el de la carta
 * (97462632), YGOPRODeck lo cambia. Las copias guardadas con el provisional se
 * quedaban sin precio: los precios van con el número nuevo. Se revisan una vez
 * las copias con número corto; si YGOPRODeck ya no lo conoce, se busca la carta
 * por su nombre y se le ponen el número y, si era la del número viejo, la imagen.
 * Lo ya revisado se recuerda en este navegador.
 */
const CLAVE = 'yugi-tracker-ids-revisados';
/** Los números de carta de verdad tienen 8 dígitos; los provisionales, muchos menos. */
const PROVISIONAL_MAX = 1_000_000;

function leerRevisados(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as number[]);
  } catch {
    return new Set();
  }
}

export function useProvisionalIds() {
  const { state, dispatch, toast } = useStore();
  const cartas = state.db.cards;

  useEffect(() => {
    const revisados = leerRevisados();
    const ids = [...new Set(cartas.filter((c) => !c.personalizado && c.apiId > 0 && c.apiId < PROVISIONAL_MAX && !revisados.has(c.apiId)).map((c) => c.apiId))];
    if (ids.length === 0) return;
    let vivo = true;
    (async () => {
      // Se aplican todas al final: cada cambio en la colección volvería a lanzar la revisión.
      const cambios: typeof cartas = [];
      try {
        const conocidas = new Set<number>();
        for (const c of await getCardsByIds(ids)) for (const id of [c.id, ...(c.card_images ?? []).map((i) => i.id)]) conocidas.add(id);
        for (const id of ids) {
          if (!vivo) return;
          if (conocidas.has(id)) {
            revisados.add(id);
            continue;
          }
          const copias = cartas.filter((c) => c.apiId === id);
          const nueva = copias[0] ? await getCardDetails(copias[0].name) : null;
          if (!vivo) return;
          if (!nueva || nueva.id === id) continue; // Se volverá a intentar.
          revisados.add(id);
          for (const c of copias) {
            const img = c.img.includes(`/${id}.jpg`) ? (nueva.card_images?.[0]?.image_url ?? c.img) : c.img;
            cambios.push({ ...c, apiId: nueva.id, img });
          }
        }
      } catch {
        // Sin YGOPRODeck: se intentará la próxima vez.
      }
      try {
        localStorage.setItem(CLAVE, JSON.stringify([...revisados]));
      } catch {
        // Sin almacenamiento se revisarán otra vez: no pasa nada.
      }
      if (!vivo || cambios.length === 0) return;
      for (const c of cambios) dispatch({ type: 'UPDATE_CARD', payload: c });
      toast(`Actualizado el número de ${cambios.length} ${cambios.length === 1 ? 'copia' : 'copias'} de cartas nuevas: ya tienen precio`);
    })();
    return () => {
      vivo = false;
    };
  }, [cartas, dispatch, toast]);
}
