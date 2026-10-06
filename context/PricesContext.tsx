import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../types';
import { useStore } from './StoreContext';
import {
  PRICE_TTL_MS,
  fetchPrices,
  findPrinting,
  getExchangeRate,
  loadCachedPrices,
  type CardPrices,
  type ExchangeRate,
} from '../services/prices';

/** Resumen de valor de un grupo de cartas (una carpeta, la colección…). */
export interface ValueSummary {
  /** Suma del valor de mercado de las cartas con precio, en euros. */
  eur: number;
  /** Suma de lo pagado por todas las cartas del grupo. */
  paid: number;
  /** Lo pagado solo por las cartas con precio: para comparar con `eur` de igual a igual. */
  paidOfPriced: number;
  /** Cartas que se han podido valorar. */
  priced: number;
  /** Cartas sin precio conocido: no se cuentan como 0, se dicen aparte. */
  unpriced: number;
}

interface PricesContextValue {
  rate: ExchangeRate | null;
  /** Hay peticiones en marcha. */
  loading: boolean;
  error: string | null;
  /** Momento del dato más antiguo de los que se están usando. */
  oldestFetch: number | null;
  /** Valor de mercado de una copia, en euros, o `null` si no hay precio. */
  valueOf: (card: Card) => number | null;
  summarize: (cards: Card[]) => ValueSummary;
  refresh: () => void;
}

const PricesContext = createContext<PricesContextValue | undefined>(undefined);

/** Espera tras un cambio en la colección antes de pedir precios, para agrupar altas seguidas. */
const DEBOUNCE_MS = 800;

export const PricesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state } = useStore();
  const [prices, setPrices] = useState<Map<number, CardPrices>>(() => new Map());
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forzar, setForzar] = useState(0);

  /*
   * Las ids de la colección, como texto ordenado: así el efecto solo se dispara
   * cuando cambia QUÉ cartas hay, no cada vez que se edita una nota o se mueve
   * una carta de carpeta.
   */
  const claveIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of state.db.cards) if (c.apiId > 0) ids.add(c.apiId);
    return [...ids].sort((a, b) => a - b).join(',');
  }, [state.db.cards]);

  useEffect(() => {
    let vivo = true;
    getExchangeRate().then((r) => {
      if (vivo) setRate(r);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const ultimoForzado = useRef(0);

  useEffect(() => {
    const ids = claveIds ? claveIds.split(',').map(Number) : [];
    if (ids.length === 0) return;

    const controller = new AbortController();
    const forzado = forzar !== ultimoForzado.current;
    ultimoForzado.current = forzar;

    const t = window.setTimeout(async () => {
      // 1. Lo guardado, al momento: así los valores aparecen sin esperar a la red.
      const guardados = await loadCachedPrices(ids);
      if (controller.signal.aborted) return;
      setPrices((prev) => new Map([...prev, ...guardados]));

      // 2. En segundo plano, solo lo que falta o ha caducado (o todo, si se pidió actualizar).
      const ahora = Date.now();
      const pendientes = forzado
        ? ids
        : ids.filter((id) => {
            const p = guardados.get(id);
            return !p || ahora - p.fetchedAt > PRICE_TTL_MS;
          });
      if (pendientes.length === 0) return;

      setLoading(true);
      setError(null);
      try {
        const nuevos = await fetchPrices(pendientes, controller.signal);
        if (controller.signal.aborted) return;
        setPrices((prev) => {
          const m = new Map(prev);
          for (const p of nuevos) m.set(p.id, p);
          return m;
        });
      } catch (e) {
        if (controller.signal.aborted) return;
        console.error('No se pudieron actualizar los precios:', e);
        setError('No se pudieron actualizar los precios. Se muestran los últimos guardados.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [claveIds, forzar]);

  const valueOf = useCallback(
    (card: Card): number | null => {
      if (!rate) return null;
      const info = prices.get(card.apiId);
      if (!info) return null;
      const impresion = findPrinting(info.printings, card.setCode, card.rarity, card.rarityCode);
      return impresion?.usd != null ? impresion.usd * rate.usdToEur : null;
    },
    [prices, rate],
  );

  const summarize = useCallback(
    (cards: Card[]): ValueSummary => {
      const resumen: ValueSummary = { eur: 0, paid: 0, paidOfPriced: 0, priced: 0, unpriced: 0 };
      for (const c of cards) {
        // Las "buscadas" no se tienen: ni suman valor ni lo pagado.
        if (c.isWanted) continue;
        resumen.paid += c.paid || 0;
        const v = valueOf(c);
        if (v == null) resumen.unpriced++;
        else {
          resumen.eur += v;
          resumen.paidOfPriced += c.paid || 0;
          resumen.priced++;
        }
      }
      return resumen;
    },
    [valueOf],
  );

  const oldestFetch = useMemo(() => {
    let min: number | null = null;
    for (const p of prices.values()) if (min === null || p.fetchedAt < min) min = p.fetchedAt;
    return min;
  }, [prices]);

  const refresh = useCallback(() => setForzar((n) => n + 1), []);

  const value = useMemo<PricesContextValue>(
    () => ({ rate, loading, error, oldestFetch, valueOf, summarize, refresh }),
    [rate, loading, error, oldestFetch, valueOf, summarize, refresh],
  );

  return <PricesContext.Provider value={value}>{children}</PricesContext.Provider>;
};

export const usePrices = () => {
  const ctx = useContext(PricesContext);
  if (!ctx) throw new Error('usePrices debe usarse dentro de PricesProvider');
  return ctx;
};
