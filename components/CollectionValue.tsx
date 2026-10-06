import { Loader2, RefreshCw } from 'lucide-react';
import type { Card } from '../types';
import { usePrices } from '../context/PricesContext';
import { formatMoney } from '../utils';

const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const fechaDia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });

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
 * Valor de mercado de un grupo de cartas.
 *
 * Es aproximado y lo dice: precios de Cardmarket por versión (o de TCGplayer si
 * la versión no está en Cardmarket), que mezclan idiomas y estados. Las cartas
 * sin precio no cuentan como 0; se indican aparte.
 */
export function CollectionValue({ cards, titulo }: Props) {
  const { summarize, loading, error, rate, oldestFetch, marketDate, refresh } = usePrices();
  const r = summarize(cards);
  if (r.priced === 0 && r.unpriced === 0) return null; // Nada que valorar (vacío o solo buscadas).

  const ayuda =
    'Precios de Cardmarket de cada versión concreta, actualizados cada día. Si una versión no está en Cardmarket se usa' +
    ' el de TCGplayer (EE. UU.) pasado a euros' +
    (rate && !rate.fallback && rate.date ? ` al cambio del BCE (1 $ = ${rate.usdToEur.toFixed(4)} €).` : ' con un cambio aproximado.') +
    ' Las copias que no están en MT o NM se valoran con un descuento estimado por su estado (EX 85 %, GD 75 %, LP 60 %, PL 40 %, PO 25 %).' +
    ' Son orientativos: no distinguen idioma.';

  return (
    <div className="mb-5 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 rounded-xl bg-bg-surface border border-border-base px-4 py-3">
      <div title={ayuda} className="cursor-help">
        <span className="text-sm text-muted">{titulo} vale</span>{' '}
        <span className="text-xl font-black text-main">{r.priced > 0 ? `≈ ${formatMoney(r.eur)}` : '—'}</span>
      </div>

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
        ) : marketDate ? (
          <span>Precios de Cardmarket del {fechaDia.format(marketDate)}</span>
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
