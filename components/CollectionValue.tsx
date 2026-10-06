import { Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import type { Card } from '../types';
import { usePrices } from '../context/PricesContext';
import { formatMoney } from '../utils';

const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** "hace 3 horas", "ayer"… para decir de cuándo son los precios. */
function antiguedad(ts: number): string {
  const min = Math.round((ts - Date.now()) / 60000);
  if (Math.abs(min) < 1) return 'ahora mismo';
  if (Math.abs(min) < 60) return relativo.format(min, 'minute');
  const horas = Math.round(min / 60);
  if (Math.abs(horas) < 24) return relativo.format(horas, 'hour');
  return relativo.format(Math.round(horas / 24), 'day');
}

interface Props {
  cards: Card[];
  /** "Tu colección", "Esta carpeta"… */
  titulo: string;
}

/**
 * Valor de mercado de un grupo de cartas, con lo pagado y la diferencia.
 *
 * Es aproximado y lo dice: precios de TCGplayer (EE. UU.) por versión, pasados a
 * euros, que no distinguen idioma, edición ni estado. Las cartas sin precio no
 * cuentan como 0; se indican aparte.
 */
export function CollectionValue({ cards, titulo }: Props) {
  const { summarize, loading, error, rate, oldestFetch, refresh } = usePrices();
  const r = summarize(cards);
  if (r.priced === 0 && r.unpriced === 0) return null; // Nada que valorar (vacío o solo buscadas).

  const diferencia = r.eur - r.paidOfPriced;
  const ayuda =
    'Precios de mercado de TCGplayer (EE. UU.) para cada versión concreta, pasados a euros' +
    (rate && !rate.fallback && rate.date
      ? ` al cambio del BCE del ${new Date(rate.date).toLocaleDateString('es-ES')} (1 $ = ${rate.usdToEur.toFixed(4)} €).`
      : ' con un cambio aproximado (no se pudo consultar el del BCE).') +
    ' Son orientativos: no distinguen idioma, edición ni estado de conservación.';

  return (
    <div className="mb-5 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 rounded-xl bg-bg-surface border border-border-base px-4 py-3">
      <div title={ayuda} className="cursor-help">
        <span className="text-sm text-muted">{titulo} vale</span>{' '}
        <span className="text-xl font-black text-main">{r.priced > 0 ? `≈ ${formatMoney(r.eur)}` : '—'}</span>
      </div>

      {r.paidOfPriced > 0 && r.priced > 0 && (
        <span
          className={`text-sm font-bold flex items-center gap-1 ${diferencia >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
          title={`Comparado con lo que pagaste por esas ${r.priced} cartas (${formatMoney(r.paidOfPriced)})`}
        >
          {diferencia >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {diferencia >= 0 ? '+' : '−'}
          {formatMoney(Math.abs(diferencia))} sobre lo pagado
        </span>
      )}

      <span className="text-sm text-muted">
        {r.priced} con precio
        {r.unpriced > 0 && <span title="Su versión no tiene precio en la API: no se cuentan como 0."> · {r.unpriced} sin precio</span>}
      </span>

      <span className="ml-auto flex items-center gap-2 text-xs text-sub">
        {loading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Actualizando precios…
          </span>
        ) : error ? (
          <span className="text-amber-400">{error}</span>
        ) : oldestFetch ? (
          <span>Precios de {antiguedad(oldestFetch)}</span>
        ) : null}
        <button
          onClick={refresh}
          disabled={loading}
          className="p-1 rounded hover:bg-main/10 text-muted hover:text-main disabled:opacity-40"
          title="Volver a consultar los precios"
          aria-label="Actualizar precios"
        >
          <RefreshCw size={13} />
        </button>
      </span>
    </div>
  );
}
