import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp, X } from 'lucide-react';
import type { Card } from '../../types';
import { useStore } from '../../context/StoreContext';
import { findPrinting, loadCachedPrices, loadHistories, printingKey, resolvePrintingKey, type CardPrices, type PricePoint } from '../../services/prices';
import { formatMoney, getRarityColor } from '../../utils';
import { useCardName } from '../useCardName';

interface Props {
  onClose: () => void;
  /** Abre la ficha de una carta. */
  onOpenCard: (card: Card) => void;
}

const RANGOS = [
  { id: '7D', dias: 7 },
  { id: '30D', dias: 30 },
  { id: '90D', dias: 90 },
  { id: '1A', dias: 365 },
] as const;
type Rango = (typeof RANGOS)[number]['id'];

const UMBRALES = [0, 5, 10, 25] as const;
const DIA_MS = 24 * 60 * 60 * 1000;
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const diaATiempo = (d: string) => new Date(`${d}T12:00:00`).getTime();

interface Movimiento {
  card: Card;
  /** Copias de esa misma versión en la colección. */
  copias: number;
  /** Precios del rango, en euros, del más antiguo al más reciente. */
  serie: { t: number; eur: number }[];
  antes: number;
  ahora: number;
  pct: number;
}

/**
 * Subidas y bajadas de precio de las cartas de la colección.
 *
 * Compara el precio de cada versión al principio del rango con el último
 * apuntado. Sale del historial que la app guarda una vez al día, así que al
 * principio no hay nada y se va llenando con el uso.
 */
export function PriceMovesModal({ onClose, onOpenCard }: Props) {
  const { state } = useStore();
  const [historiales, setHistoriales] = useState<Map<number, PricePoint[]> | null>(null);
  const [precios, setPrecios] = useState<Map<number, CardPrices>>(new Map());
  const [rango, setRango] = useState<Rango>('7D');
  const [umbral, setUmbral] = useState<number>(10);
  const [lado, setLado] = useState<'suben' | 'bajan'>('suben');

  const cartas = useMemo(() => state.db.cards.filter((c) => !c.isWanted && c.apiId > 0), [state.db.cards]);

  useEffect(() => {
    let vivo = true;
    const ids = [...new Set(cartas.map((c) => c.apiId))];
    Promise.all([loadHistories(ids), loadCachedPrices(ids)]).then(([h, p]) => {
      if (!vivo) return;
      setHistoriales(h);
      setPrecios(p);
    });
    return () => {
      vivo = false;
    };
  }, [cartas]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Días distintos apuntados en total: para explicar por qué no hay datos todavía. */
  const diasApuntados = useMemo(() => {
    const dias = new Set<string>();
    for (const puntos of historiales?.values() ?? []) for (const p of puntos) dias.add(p.d);
    return dias.size;
  }, [historiales]);

  const movimientos = useMemo(() => {
    if (!historiales) return [];
    const dias = RANGOS.find((r) => r.id === rango)!.dias;
    const porVersion = new Map<string, Movimiento>();

    for (const card of cartas) {
      const info = precios.get(card.apiId);
      if (!card.setCode || card.setCode === '---') continue;
      const impresion = info ? findPrinting(info.printings, card.setCode, card.rarity, card.rarityCode) : null;
      const historial = historiales.get(card.apiId) ?? [];
      const k = impresion
        ? printingKey(impresion.code, impresion.rarity)
        : resolvePrintingKey((x) => historial.some((p) => p.p[x] != null), card.setCode, card.rarity);
      const clave = `${card.apiId}|${k}`;
      const ya = porVersion.get(clave);
      if (ya) {
        ya.copias++;
        continue;
      }

      const puntos = historial
        .map((p) => ({ t: diaATiempo(p.d), eur: p.p[k] }))
        .filter((p): p is { t: number; eur: number } => p.eur != null);
      if (puntos.length < 2) continue;

      const ultimo = puntos[puntos.length - 1]!;
      const desde = ultimo.t - dias * DIA_MS;
      const serie = puntos.filter((p) => p.t >= desde);
      if (serie.length < 2) continue;

      const antes = serie[0]!.eur;
      const ahora = ultimo.eur;
      porVersion.set(clave, { card, copias: 1, serie, antes, ahora, pct: ((ahora - antes) / antes) * 100 });
    }
    return [...porVersion.values()];
  }, [cartas, historiales, precios, rango]);

  const lista = movimientos
    .filter((m) => (lado === 'suben' ? m.pct > 0 : m.pct < 0) && Math.abs(m.pct) >= umbral)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const cuantasSuben = movimientos.filter((m) => m.pct > 0 && m.pct >= umbral).length;
  const cuantasBajan = movimientos.filter((m) => m.pct < 0 && -m.pct >= umbral).length;

  return (
    <div
      className="fixed inset-0 z-[115] flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-3xl bg-bg-surface border border-border-base rounded-2xl shadow-2xl flex flex-col my-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="p-4 border-b border-border-base bg-bg-panel rounded-t-2xl flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg text-main">Subidas y bajadas</h3>
            <p className="text-xs text-muted mt-0.5">Cómo ha cambiado el precio de tus cartas.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-muted hover:text-main hover:bg-main/10" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Controles */}
        <div className="p-4 pb-3 space-y-3 border-b border-border-base">
          <div className="grid grid-cols-2 gap-2">
            {(['suben', 'bajan'] as const).map((l) => {
              const activo = lado === l;
              const sube = l === 'suben';
              return (
                <button
                  key={l}
                  onClick={() => setLado(l)}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold border transition-colors ${
                    activo
                      ? sube
                        ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-400'
                        : 'bg-red-500/15 border-red-500/60 text-red-400'
                      : 'bg-bg-panel border-border-base text-muted hover:text-main'
                  }`}
                >
                  {sube ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {sube ? 'Suben' : 'Bajan'}
                  <span className="text-xs font-semibold opacity-80">{sube ? cuantasSuben : cuantasBajan}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              {RANGOS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRango(r.id)}
                  className={`text-[11px] font-bold px-2 py-1 rounded transition-colors ${
                    rango === r.id ? 'bg-main/10 text-main' : 'text-muted hover:text-main'
                  }`}
                >
                  {r.id}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              Cambio mínimo
              <select
                value={umbral}
                onChange={(e) => setUmbral(Number(e.target.value))}
                className="bg-bg-panel border border-border-base text-main rounded px-2 py-1 text-xs focus:border-primary outline-none"
              >
                {UMBRALES.map((u) => (
                  <option key={u} value={u}>
                    {u === 0 ? 'Cualquiera' : `${u} %`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto p-4 pt-3">
          {historiales === null ? (
            <div className="py-10 text-center text-sm text-muted">Cargando…</div>
          ) : diasApuntados < 2 ? (
            <div className="py-10 px-6 text-center">
              <div className="text-sm text-main font-bold">Todavía no hay con qué comparar</div>
              <p className="text-xs text-muted mt-2 max-w-sm mx-auto leading-relaxed">
                Los precios de todas las cartas se apuntan solos cada día, aunque no abras la web. En cuanto haya dos días
                distintos empezarán a salir aquí las que suben y las que bajan.
                {diasApuntados === 1 && ' Ya está el de hoy.'}
              </p>
            </div>
          ) : lista.length === 0 ? (
            <div className="py-10 px-6 text-center text-sm text-muted">
              Ninguna carta {lado === 'suben' ? 'ha subido' : 'ha bajado'}
              {umbral > 0 ? ` un ${umbral} % o más` : ''} en este periodo.
            </div>
          ) : (
            <div className="divide-y divide-border-base rounded-lg border border-border-base bg-bg-panel overflow-hidden">
              {lista.map((m) => (
                <Fila key={`${m.card.apiId}-${m.card.setCode}-${m.card.rarity}`} m={m} onOpen={() => onOpenCard(m.card)} />
              ))}
            </div>
          )}
          <p className="text-[10px] text-sub leading-relaxed mt-3">
            Compara el primer precio apuntado del periodo con el último, por versión. Precio de referencia de Cardmarket (la más baja de sus medias):
            orientativos, mezclan idiomas y estados.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function Fila({ m, onOpen }: { m: Movimiento; onOpen: () => void }) {
  const { nombre } = useCardName(m.card);
  const sube = m.pct >= 0;
  const color = sube ? '#34d399' : '#f87171';
  const diferencia = m.ahora - m.antes;

  // Mini gráfica: 64×24.
  const vals = m.serie.map((s) => s.eur);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const t0 = m.serie[0]!.t;
  const t1 = m.serie[m.serie.length - 1]!.t;
  const puntos = m.serie
    .map((s) => `${(((s.t - t0) / Math.max(1, t1 - t0)) * 64).toFixed(1)},${(22 - ((s.eur - min) / Math.max(0.0001, max - min)) * 20).toFixed(1)}`)
    .join(' ');

  return (
    <button onClick={onOpen} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-main/5 transition-colors">
      <img src={m.card.img} alt="" loading="lazy" className="w-9 h-[52px] object-cover rounded shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-main truncate">
          {nombre}
          {m.copias > 1 && <span className="text-muted font-semibold"> ×{m.copias}</span>}
        </div>
        <div className="text-[11px] truncate">
          <span className="text-muted font-mono">{m.card.setCode}</span>{' '}
          <span style={{ color: getRarityColor(m.card.rarity) }}>{m.card.rarity}</span>
        </div>
        <div className="text-[10px] text-sub">desde el {fechaCorta.format(t0)}</div>
      </div>
      <svg viewBox="0 0 64 24" className="w-16 h-6 shrink-0 hidden sm:block" aria-hidden>
        <polyline points={puntos} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div className="text-right shrink-0 w-28">
        <div className="text-sm font-black text-main">{formatMoney(m.ahora)}</div>
        <div className={`text-[11px] font-bold ${sube ? 'text-emerald-400' : 'text-red-400'}`}>
          {sube ? '+' : '−'}
          {formatMoney(Math.abs(diferencia))} ({sube ? '+' : '−'}
          {Math.abs(m.pct).toFixed(1).replace('.', ',')} %)
        </div>
      </div>
    </button>
  );
}
