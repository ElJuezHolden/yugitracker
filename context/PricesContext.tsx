import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../types';
import { useStore } from './StoreContext';
import {
  PRICE_TTL_MS,
  conditionFactor,
  fetchPrices,
  findPrinting,
  forgetMarketData,
  getExchangeRate,
  loadCachedPrices,
  loadMarketPrices,
  resolvePrintingKey,
  type CardPrices,
  type ExchangeRate,
  type MarketPrices,
  type PriceMetric,
  type PriceStats,
  type Sobrante,
  leftoverFor,
  PRICE_METRICS,
  statValue,
} from '../services/prices';

/** Precio de una copia y de dónde sale. */
export interface CopyPrice {
  /** Lo que vale la copia: el de mercado ajustado por su estado. */
  eur: number;
  /** Precio de mercado de la versión (como NM), sin ajustar. */
  mercado: number;
  /** Factor aplicado por el estado (1 en MT y NM). */
  factor: number;
  /** Cardmarket casi siempre; TCGplayer si la versión no está en Cardmarket; manual en los artículos personalizados. */
  fuente: 'cardmarket' | 'tcgplayer' | 'manual';
}

/** Resumen de valor de un grupo de cartas (una carpeta, la colección…). */
export interface ValueSummary {
  /** Suma del valor de mercado de las cartas con precio, en euros. */
  eur: number;
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
  /** Día de los precios de Cardmarket (ms), o `null` si no hay (p. ej. en local). */
  marketDate: number | null;
  /** Precio de una copia, con su fuente, o `null` si no hay. */
  priceOf: (card: Card) => CopyPrice | null;
  /** Valor de mercado de una copia, en euros, o `null` si no hay precio. */
  valueOf: (card: Card) => number | null;
  summarize: (cards: Card[]) => ValueSummary;
  refresh: () => void;
  /** Cifra de Cardmarket con la que se valora todo (por defecto, la de referencia). */
  metric: PriceMetric;
  setMetric: (m: PriceMetric) => void;
}

const PricesContext = createContext<PricesContextValue | undefined>(undefined);

/** Espera tras un cambio en la colección antes de pedir precios, para agrupar altas seguidas. */
const DEBOUNCE_MS = 800;
const CLAVE_METRICA = 'yugi-tracker-metrica-precio';

export const PricesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state } = useStore();
  const [prices, setPrices] = useState<Map<number, CardPrices>>(() => new Map());
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forzar, setForzar] = useState(0);
  // La cifra elegida se recuerda en este navegador; si no se puede leer, la de referencia.
  const [metric, setMetricState] = useState<PriceMetric>(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_METRICA);
      if (PRICE_METRICS.some((m) => m.id === guardada)) return guardada as PriceMetric;
    } catch {
      // Sin acceso al almacenamiento: se usa la de por defecto.
    }
    return 'referencia';
  });
  const setMetric = useCallback((m: PriceMetric) => {
    setMetricState(m);
    try {
      localStorage.setItem(CLAVE_METRICA, m);
    } catch {
      // No poder recordarla no impide usarla.
    }
  }, []);
  const [mercado, setMercado] = useState<MarketPrices>(() => ({ porCarta: new Map(), productos: new Map(), sobrantes: new Map(), fecha: null }));

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
      // 0. Cardmarket: lo publicado hoy por GitHub Actions (en local no hay).
      if (forzado) forgetMarketData();
      loadMarketPrices(ids).then((m) => {
        if (!controller.signal.aborted) setMercado(m);
      });

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

  const priceOf = useCallback(
    (card: Card): CopyPrice | null => {
      // Artículos personalizados: el precio que puso quien lo añadió, tal cual (ya es el de su copia).
      if (card.personalizado) {
        const p = card.personalizado.precio;
        return p != null && p >= 0 ? { eur: p, mercado: p, factor: 1, fuente: 'manual' } : null;
      }
      if (!card.setCode || card.setCode === '---') return null;
      const info = prices.get(card.apiId);
      const impresion = info ? findPrinting(info.printings, card.setCode, card.rarity, card.rarityCode) : null;
      const cm = mercado.porCarta.get(card.apiId);
      // Primero con la rareza de la copia; si no, con la de YGOPRODeck (que puede ser una falsa, como "New").
      const claves = Object.keys(cm ?? {});
      const propia = resolvePrintingKey(claves, card.setCode, card.rarity);
      const clave = cm?.[propia] || !impresion ? propia : resolvePrintingKey(claves, impresion.code, impresion.rarity);
      const factor = conditionFactor(card.condition);
      // Si la versión no está en YGOPRODeck (p. ej. TN23 de Utopia), su producto sobrante de Cardmarket.
      const cifras = cm?.[clave] ?? leftoverFor(mercado.sobrantes.get(card.apiId), card.setCode, card.rarity)?.stats;
      const deCardmarket = cifras ? (statValue(cifras, metric) ?? statValue(cifras, 'referencia')) : undefined;
      const deMercado = deCardmarket ?? (impresion?.usd != null && rate ? impresion.usd * rate.usdToEur : null);
      if (deMercado == null) return null;
      return { eur: deMercado * factor, mercado: deMercado, factor, fuente: deCardmarket != null ? 'cardmarket' : 'tcgplayer' };
    },
    [prices, rate, mercado, metric],
  );

  const valueOf = useCallback((card: Card): number | null => priceOf(card)?.eur ?? null, [priceOf]);

  const summarize = useCallback(
    (cards: Card[]): ValueSummary => {
      const resumen: ValueSummary = { eur: 0, priced: 0, unpriced: 0 };
      for (const c of cards) {
        // Las "buscadas" no se tienen: no suman valor.
        if (c.isWanted) continue;
        const v = valueOf(c);
        if (v == null) resumen.unpriced++;
        else {
          resumen.eur += v;
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
    () => ({ rate, loading, error, oldestFetch, marketDate: mercado.fecha, priceOf, valueOf, summarize, refresh, metric, setMetric }),
    [rate, loading, error, oldestFetch, mercado.fecha, priceOf, valueOf, summarize, refresh, metric, setMetric],
  );

  return <PricesContext.Provider value={value}>{children}</PricesContext.Provider>;
};

export interface CardmarketData {
  /** Clave de impresión → cifras de Cardmarket. */
  precios: Record<string, PriceStats>;
  /** Clave de impresión → número de producto en Cardmarket. */
  productos: Record<string, number>;
  /** Productos sin versión en YGOPRODeck, para las versiones de Yugipedia. */
  sobrantes: Sobrante[];
}
const SIN_DATOS: CardmarketData = { precios: {}, productos: {}, sobrantes: [] };

/** Precios y productos de Cardmarket de cada versión de una carta (vacío mientras carga o si no hay). */
export function useCardmarketPrices(cardId: number | undefined): CardmarketData {
  const [datos, setDatos] = useState<{ id: number } & CardmarketData>();
  useEffect(() => {
    if (cardId == null) return;
    let vivo = true;
    loadMarketPrices([cardId]).then((m) => {
      if (vivo)
        setDatos({
          id: cardId,
          precios: m.porCarta.get(cardId) ?? {},
          productos: m.productos.get(cardId) ?? {},
          sobrantes: m.sobrantes.get(cardId) ?? [],
        });
    });
    return () => {
      vivo = false;
    };
  }, [cardId]);
  return datos && datos.id === cardId ? datos : SIN_DATOS;
}

export const usePrices = () => {
  const ctx = useContext(PricesContext);
  if (!ctx) throw new Error('usePrices debe usarse dentro de PricesProvider');
  return ctx;
};
