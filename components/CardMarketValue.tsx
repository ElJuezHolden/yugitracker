import { useEffect, useMemo, useState, type PointerEvent } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { CardSet } from '../types';
import { useCardmarketPrices, usePrices } from '../context/PricesContext';
import {
  PRICE_METRICS,
  conditionFactor,
  leftoverFor,
  loadHistory,
  printingKey,
  printingsFromApi,
  statValue,
  versionPrice,
  type PricePoint,
} from '../services/prices';
import { formatMoney, getRarityColor } from '../utils';

interface Props {
  cardId: number;
  sets: CardSet[] | undefined;
  /** La versión elegida en el formulario. */
  selected: CardSet | null;
  /** Al pulsar otra versión de la lista, se elige en el formulario. */
  onSelect?: (set: CardSet) => void;
  /** Lo que se pagó por esta copia, si se apuntó (0 si no). Solo se enseña aquí. */
  paid?: number;
  /** Estado de la copia (MT, NM, EX…), para estimar lo que vale. Sin él, como NM. */
  condition?: string;
}

const RANGOS = [
  { id: '7D', dias: 7 },
  { id: '30D', dias: 30 },
  { id: '90D', dias: 90 },
  { id: '1A', dias: 365 },
  { id: 'Todo', dias: Infinity },
] as const;
type Rango = (typeof RANGOS)[number]['id'];

const DIA_MS = 24 * 60 * 60 * 1000;
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const esMisma = (a: CardSet | null, code: string, rarity: string) => !!a && a.set_code === code && a.set_rarity === rarity;

/**
 * Valor de mercado de una carta, al estilo de las webs de precios: el precio de
 * la versión elegida en grande, cuánto ha cambiado, su gráfica y, debajo, todas
 * las demás versiones para ver si hay impresiones más caras o más baratas.
 *
 * Los precios son de Cardmarket, y la gráfica, del historial que GitHub Actions
 * apunta cada día (ver services/prices.ts). Si una versión no está en
 * Cardmarket se usa TCGplayer y se marca con un asterisco.
 */
export function CardMarketValue({ cardId, sets, selected, onSelect, paid = 0, condition }: Props) {
  const { rate, metric, setMetric } = usePrices();
  const [historial, setHistorial] = useState<PricePoint[]>([]);
  const [rango, setRango] = useState<Rango>('30D');

  useEffect(() => {
    let vivo = true;
    loadHistory(cardId).then((h) => {
      if (vivo) setHistorial(h);
    });
    return () => {
      vivo = false;
    };
  }, [cardId]);

  const { precios: cardmarket, sobrantes } = useCardmarketPrices(cardId);
  const versiones = useMemo(() => {
    const lista = printingsFromApi(sets).map((p, i) => {
      const precio = versionPrice(cardmarket, sets![i]!, rate, metric, sobrantes);
      return { ...p, set: sets![i]!, eur: precio?.eur ?? null, deTcgplayer: precio?.deTcgplayer ?? false };
    });
    // Las que tienen precio primero, de la más cara a la más barata; luego las demás.
    return lista.sort((a, b) => (b.eur ?? -1) - (a.eur ?? -1));
  }, [sets, cardmarket, rate, metric, sobrantes]);

  const conPrecio = versiones.filter((v) => v.eur != null);
  const hayTcgplayer = versiones.some((v) => v.deTcgplayer);
  const masCara = conPrecio.length > 1 ? conPrecio[0] : undefined;
  const masBarata = conPrecio.length > 1 ? conPrecio[conPrecio.length - 1] : undefined;
  const actual = versiones.find((v) => esMisma(selected, v.code, v.rarity));

  // Serie de la versión elegida dentro del rango.
  const serie = useMemo(() => {
    if (!actual) return [];
    const clave = printingKey(actual.code, actual.rarity);
    const dias = RANGOS.find((r) => r.id === rango)!.dias;
    const puntos = historial
      .map((pt) => ({ t: new Date(`${pt.d}T12:00:00`).getTime(), eur: pt.p[clave] }))
      .filter((x): x is { t: number; eur: number } => x.eur != null);
    // El rango se cuenta hacia atrás desde el último día apuntado (normalmente hoy).
    const desde = (puntos[puntos.length - 1]?.t ?? 0) - dias * DIA_MS;
    return puntos.filter((x) => x.t >= desde);
  }, [actual, historial, rango]);

  if (versiones.length === 0) return null;

  const precio = actual?.eur ?? null;
  // Todas las cifras de Cardmarket de la versión elegida, como en su web.
  const cifras = actual
    ? (cardmarket[printingKey(actual.code, actual.rarity)] ?? leftoverFor(sobrantes, actual.code, actual.rarity)?.stats)
    : undefined;
  const ORDEN_TABLA = ['low', 'trend', 'avg30', 'avg7', 'avg1', 'referencia'] as const;
  // Lo que vale TU copia: el precio de la versión ajustado por su estado (estimación).
  const factor = conditionFactor(condition);
  const valorCopia = precio != null ? precio * factor : null;
  const cambio = serie.length >= 2 ? serie[serie.length - 1]!.eur - serie[0]!.eur : null;
  const cambioPct = cambio != null && serie[0]!.eur > 0 ? (cambio / serie[0]!.eur) * 100 : null;
  const sube = (cambio ?? 0) >= 0;

  return (
    <div className="bg-bg-panel rounded-xl border border-border-base overflow-hidden">
      {/* Cabecera: versión y fuente */}
      <div className="p-4 pb-3 border-b border-border-base">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-primary uppercase tracking-wide">Valor de mercado</div>
            <div className="text-xs text-muted truncate mt-0.5">{actual ? actual.name : 'Elige una versión'}</div>
          </div>
          {actual?.deTcgplayer && (
            <span
              className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted bg-bg-surface border border-border-base rounded px-2 py-1"
              title="Esta versión no está en Cardmarket"
            >
              TCGplayer
            </span>
          )}
        </div>
        {actual && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span
              className="text-[11px] font-bold bg-bg-surface border border-border-base rounded-md px-2 py-0.5"
              style={{ color: getRarityColor(actual.rarity) }}
            >
              {actual.rarity}
            </span>
            <span className="text-[11px] font-bold text-main bg-bg-surface border border-border-base rounded-md px-2 py-0.5 font-mono">
              {actual.code}
            </span>
          </div>
        )}
      </div>

      {/* Precio, cambio y gráfica */}
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-3xl font-black text-main tracking-tight">
            {precio != null ? `≈ ${formatMoney(precio)}` : actual ? 'Sin precio' : '—'}
          </span>
          {cambio != null && metric === 'referencia' && (
            <span
              className={`inline-flex items-center gap-1 text-sm font-bold rounded-md px-2 py-1 ${
                sube ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
              }`}
              title={`Desde el ${fechaCorta.format(serie[0]!.t)}`}
            >
              {sube ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {sube ? '+' : '−'}
              {formatMoney(Math.abs(cambio))}
              {cambioPct != null && <span className="font-semibold opacity-80">({sube ? '+' : '−'}{Math.abs(cambioPct).toFixed(1).replace('.', ',')} %)</span>}
            </span>
          )}
        </div>

        {factor < 1 && valorCopia != null && (
          <div className="text-sm text-muted" title="Cardmarket no da precios por estado: es una estimación sobre el precio en NM">
            Tu copia en <span className="font-bold text-main">{condition}</span> ≈{' '}
            <span className="font-bold text-main">{formatMoney(valorCopia)}</span>{' '}
            <span className="text-xs text-sub">({Math.round(factor * 100)} % del precio, estimado)</span>
          </div>
        )}

        {paid > 0 && valorCopia != null && (
          <div className="text-xs text-muted">
            Pagaste <span className="font-bold text-main">{formatMoney(paid)}</span> ·{' '}
            <span className={`font-bold ${valorCopia >= paid ? 'text-emerald-400' : 'text-red-400'}`}>
              {valorCopia >= paid ? '+' : '−'}
              {formatMoney(Math.abs(valorCopia - paid))} ({valorCopia >= paid ? '+' : '−'}
              {Math.abs(((valorCopia - paid) / paid) * 100).toFixed(0)} %)
            </span>{' '}
            desde entonces
          </div>
        )}

        {cifras && (
          <div className="rounded-lg border border-border-base bg-bg-surface divide-y divide-border-base">
            {ORDEN_TABLA.map((id) => {
              const m = PRICE_METRICS.find((x) => x.id === id)!;
              const valor = statValue(cifras, id);
              const elegida = metric === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMetric(id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors ${
                    elegida ? 'bg-primary/10' : 'hover:bg-main/5'
                  }`}
                  title={`${m.ayuda}${elegida ? ' · Es con la que se valora tu colección.' : ' · Pulsa para valorar tu colección con esta cifra.'}`}
                >
                  <span className={`text-xs ${elegida ? 'text-primary font-bold' : 'text-muted'}`}>
                    {m.etiqueta}
                    {elegida && <span className="ml-1.5 text-[9px] uppercase tracking-wide">· valorando con esta</span>}
                  </span>
                  <span className={`text-xs font-bold ${valor != null ? 'text-main' : 'text-sub'}`}>
                    {valor != null ? formatMoney(valor) : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-sub">
          <span>Evolución del precio de referencia</span>
          {cambio != null && metric !== 'referencia' && (
            <span className={`font-bold ${sube ? 'text-emerald-400' : 'text-red-400'}`}>
              {sube ? '+' : '−'}
              {formatMoney(Math.abs(cambio))}
              {cambioPct != null && ` (${sube ? '+' : '−'}${Math.abs(cambioPct).toFixed(1).replace('.', ',')} %)`}
            </span>
          )}
        </div>
        {serie.length >= 2 ? (
          <PriceChart serie={serie} color={sube ? '#34d399' : '#f87171'} />
        ) : (
          <div className="h-36 rounded-lg bg-bg-surface border border-border-base flex flex-col items-center justify-center text-center px-6">
            <span className="text-sm text-muted">Aún no hay historial de precios</span>
            <span className="text-[11px] text-sub mt-1">
              Los precios se apuntan solos cada día, aunque no abras la web; la gráfica se irá llenando.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {RANGOS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRango(r.id)}
                className={`text-[11px] font-bold px-2 py-1 rounded transition-colors ${
                  rango === r.id ? 'bg-main/10 text-main' : 'text-muted hover:text-main'
                }`}
              >
                {r.id}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Todas las versiones */}
      <div className="border-t border-border-base p-4 pt-3">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="text-xs font-bold text-main">Precio de sus versiones</span>
          <span className="text-[11px] text-muted">
            {versiones.length} {versiones.length === 1 ? 'versión' : 'versiones'} · {conPrecio.length} con precio
          </span>
        </div>
        {masCara && masBarata && (
          <div className="text-[11px] text-muted mb-2">
            De <span className="text-emerald-400 font-bold">{formatMoney(masBarata.eur!)}</span> a{' '}
            <span className="text-amber-400 font-bold">{formatMoney(masCara.eur!)}</span> según la versión.
          </div>
        )}
        <div className="max-h-44 overflow-y-auto rounded-lg border border-border-base divide-y divide-border-base bg-bg-surface">
          {versiones.map((v, i) => {
            const esActual = esMisma(selected, v.code, v.rarity);
            const etiqueta = v === masCara ? 'la más cara' : v === masBarata ? 'la más barata' : null;
            const diferencia = precio != null && v.eur != null && !esActual ? v.eur - precio : null;
            return (
              <button
                key={`${v.code}-${v.rarity}-${i}`}
                type="button"
                onClick={() => onSelect?.(v.set)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                  esActual ? 'bg-primary/10' : 'hover:bg-main/5'
                }`}
                title={esActual ? 'La versión elegida' : onSelect ? 'Pulsa para elegir esta versión' : undefined}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-main truncate">
                    <span className="font-bold font-mono">{v.code}</span>{' '}
                    <span style={{ color: getRarityColor(v.rarity) }}>{v.rarity}</span>
                    {esActual && <span className="ml-1.5 text-[9px] font-bold uppercase text-primary">elegida</span>}
                    {etiqueta && (
                      <span
                        className={`ml-1.5 text-[9px] font-bold uppercase ${etiqueta === 'la más cara' ? 'text-amber-400' : 'text-emerald-400'}`}
                      >
                        {etiqueta}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-sub truncate">{v.name}</div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`text-xs font-bold ${v.eur != null ? 'text-main' : 'text-sub'}`}
                    title={v.deTcgplayer ? 'No está en Cardmarket: precio de TCGplayer' : undefined}
                  >
                    {v.eur != null ? formatMoney(v.eur) : '—'}
                    {v.deTcgplayer && <span className="text-muted">*</span>}
                  </div>
                  {diferencia != null && Math.abs(diferencia) >= 0.01 && (
                    <div className={`text-[10px] font-semibold ${diferencia > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {diferencia > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(diferencia))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-sub leading-relaxed mt-2">
          Precio de cada versión, actualizado cada día. Orientativo: mezcla idiomas y estados.
          {hayTcgplayer && ' * No está en Cardmarket: precio de TCGplayer (EE. UU.) pasado a euros.'}
        </p>
      </div>
    </div>
  );
}

/** Gráfica de área con el precio de cada día; al pasar el ratón muestra el de ese día. */
function PriceChart({ serie, color }: { serie: { t: number; eur: number }[]; color: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 120;
  const PAD = 8;

  const valores = serie.map((s) => s.eur);
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (max - min < 0.01) {
    // Precio plano: se le da margen para que la línea quede en medio y no pegada al borde.
    min -= Math.max(0.5, min * 0.05);
    max += Math.max(0.5, max * 0.05);
  }
  const t0 = serie[0]!.t;
  const t1 = serie[serie.length - 1]!.t;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);

  const linea = serie.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(2)},${y(s.eur).toFixed(2)}`).join(' ');
  const area = `${linea} L${W},${H} L0,${H} Z`;
  const gradId = `grad-${color.slice(1)}`;
  const punto = hover != null ? serie[hover] : null;

  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    let mejor = 0;
    for (let i = 1; i < serie.length; i++) if (Math.abs(serie[i]!.t - t) < Math.abs(serie[mejor]!.t - t)) mejor = i;
    setHover(mejor);
  };

  return (
    <div>
      <div className="relative h-36 mt-7 select-none" onPointerMove={alMover} onPointerLeave={() => setHover(null)}>
        {/* Líneas de referencia con su precio */}
        {[max, (max + min) / 2, min].map((v, i) => (
          <div key={i} className="absolute inset-x-0 border-t border-border-base/60" style={{ top: `${(y(v) / H) * 100}%` }}>
            <span className="absolute left-0 -top-4 text-[10px] text-sub">{formatMoney(v)}</span>
          </div>
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
          <path d={linea} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {punto && (
          <>
            <div
              className="absolute top-0 bottom-0 border-l border-dashed border-main/30 pointer-events-none"
              style={{ left: `${(x(punto.t) / W) * 100}%` }}
            />
            <div
              className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-bg-panel pointer-events-none"
              style={{ left: `${(x(punto.t) / W) * 100}%`, top: `${(y(punto.eur) / H) * 100}%`, background: color }}
            />
            <div
              className="absolute -top-1 text-[11px] bg-bg-surface border border-border-base rounded px-2 py-1 whitespace-nowrap pointer-events-none shadow-lg"
              style={{
                left: `${(x(punto.t) / W) * 100}%`,
                transform: `translate(${x(punto.t) / W > 0.7 ? '-100%' : x(punto.t) / W < 0.3 ? '0' : '-50%'}, -100%)`,
              }}
            >
              <span className="font-bold text-main">{formatMoney(punto.eur)}</span>{' '}
              <span className="text-muted">{fechaCorta.format(punto.t)}</span>
            </div>
          </>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-sub mt-1">
        <span>{fechaCorta.format(t0)}</span>
        <span>{fechaCorta.format(t1)}</span>
      </div>
    </div>
  );
}
