import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Loader2, Search, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { usePrices } from '../../context/PricesContext';
import type { Card } from '../../types';
import { formatMoney, getRarityColor, getRarityWeight, normalizeStr } from '../../utils';
import { conditionFactor, loadHistories, resolvePrintingKey, type PricePoint } from '../../services/prices';
import { codigoDeCopia } from '../../services/codigosEs';
import { displayName, useNameMode, useSpanishNames } from '../useCardName';

/*
 * Estadísticas de la colección: resumen, valor en el tiempo, por set, por
 * rareza, repetidas y las más valiosas. Las wanted no cuentan como tenidas (se
 * dicen aparte) y los artículos personalizados solo suman en el valor.
 */

interface Props {
  onClose: () => void;
  onOpenCard: (card: Card) => void;
}

type Pestana = 'resumen' | 'valor' | 'sets' | 'rarezas' | 'repetidas' | 'top';
const PESTANAS: { id: Pestana; nombre: string }[] = [
  { id: 'resumen', nombre: 'Resumen' },
  { id: 'valor', nombre: 'Valor en el tiempo' },
  { id: 'sets', nombre: 'Sets' },
  { id: 'rarezas', nombre: 'Rarezas' },
  { id: 'repetidas', nombre: 'Repetidas' },
  { id: 'top', nombre: 'Más valiosas' },
];

const RANGOS = [
  { id: '30D', dias: 30 },
  { id: '90D', dias: 90 },
  { id: '1A', dias: 365 },
  { id: 'Todo', dias: Infinity },
] as const;

/** Porcentaje con un decimal y coma, como se escribe en español. */
const pct1 = (x: number) => x.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const fechaCorta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export function EstadisticasModal({ onClose, onOpenCard }: Props) {
  const { state } = useStore();
  const { summarize, valueOf, versionesDe } = usePrices();
  const nombresEs = useSpanishNames();
  const modoNombres = useNameMode();
  const nombre = (c: Card) => displayName(c, nombresEs, modoNombres);
  const [pestana, setPestana] = useState<Pestana>('resumen');

  const tenidas = useMemo(() => state.db.cards.filter((c) => !c.isWanted), [state.db.cards]);
  const conVersion = useMemo(() => tenidas.filter((c) => !c.personalizado && c.setCode && c.setCode !== '---'), [tenidas]);
  const wanted = state.db.cards.length - tenidas.length;
  const resumen = summarize(tenidas);

  return (
    <div className="fixed inset-0 z-[115] flex items-start sm:items-center justify-center bg-black/80 p-2 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-estadisticas"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-bg-surface border border-border-base rounded-2xl shadow-2xl flex flex-col h-[calc(100dvh-1rem)] sm:h-[88vh]"
      >
        <div className="p-4 border-b border-border-base flex items-start justify-between gap-3 shrink-0 bg-bg-panel rounded-t-2xl">
          <div>
            <h3 id="titulo-estadisticas" className="font-bold text-lg text-main flex items-center gap-2">
              <BarChart3 size={18} className="text-primary" /> Estadísticas de la colección
            </h3>
            <p className="text-xs text-muted">
              {tenidas.length} copias · {resumen.priced > 0 ? `≈ ${formatMoney(resumen.eur)}` : 'sin precios aún'}
              {wanted > 0 && ` · ${wanted} wanted`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 hover:bg-main/10 rounded text-main/70 hover:text-main shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="px-3 pt-2 border-b border-border-base flex gap-1 overflow-x-auto shrink-0 tira-movil" role="tablist">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              onClick={() => setPestana(p.id)}
              className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                pestana === p.id ? 'border-primary text-main' : 'border-transparent text-muted hover:text-main'
              }`}
            >
              {p.nombre}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {pestana === 'resumen' && <Resumen tenidas={tenidas} conVersion={conVersion} wanted={wanted} />}
          {pestana === 'valor' && <ValorEnElTiempo tenidas={conVersion} />}
          {pestana === 'sets' && <PorSet cartas={conVersion} />}
          {pestana === 'rarezas' && <PorRareza cartas={conVersion} />}
          {pestana === 'repetidas' && <Repetidas cartas={conVersion} nombre={nombre} onOpenCard={onOpenCard} />}
          {pestana === 'top' && <Top cartas={tenidas} nombre={nombre} onOpenCard={onOpenCard} valueOf={valueOf} versionesDe={versionesDe} />}
        </div>
      </motion.div>
    </div>
  );
}

function Dato({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="p-3 rounded-xl bg-bg-panel border border-border-base">
      <div className="text-[11px] text-muted font-medium">{titulo}</div>
      <div className="text-xl font-bold text-main mt-0.5">{valor}</div>
      {nota && <div className="text-[11px] text-muted mt-0.5">{nota}</div>}
    </div>
  );
}

function Reparto({ titulo, datos }: { titulo: string; datos: [string, number][] }) {
  const total = datos.reduce((n, [, x]) => n + x, 0) || 1;
  return (
    <div className="p-3 rounded-xl bg-bg-panel border border-border-base">
      <div className="text-xs font-semibold text-main mb-2">{titulo}</div>
      <div className="space-y-1.5">
        {datos.map(([k, n]) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-20 text-muted truncate">{k}</span>
            <div className="flex-1 h-2 rounded bg-main/10 overflow-hidden">
              <div className="h-full bg-primary/70" style={{ width: `${(n / total) * 100}%` }} />
            </div>
            <span className="w-14 text-right text-main tabular-nums">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Resumen({ tenidas, conVersion, wanted }: { tenidas: Card[]; conVersion: Card[]; wanted: number }) {
  const { summarize, valueOf } = usePrices();
  const r = summarize(tenidas);
  const distintas = new Set(tenidas.map((c) => c.apiId)).size;
  const pagadas = tenidas.filter((c) => c.paid > 0);
  const pagado = pagadas.reduce((n, c) => n + c.paid, 0);
  const valorPagadas = pagadas.reduce((n, c) => n + (valueOf(c) ?? 0), 0);
  const primeras = conVersion.filter((c) => c.is1st).length;
  const cuenta = (f: (c: Card) => string) => {
    const m = new Map<string, number>();
    for (const c of tenidas) m.set(f(c), (m.get(f(c)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Dato titulo="Copias" valor={String(tenidas.length)} nota={`${distintas} cartas distintas`} />
        <Dato titulo="Valor" valor={r.priced ? `≈ ${formatMoney(r.eur)}` : '—'} nota={`${r.priced} con precio${r.unpriced ? ` · ${r.unpriced} sin` : ''}`} />
        <Dato titulo="Precio medio por copia" valor={r.priced ? formatMoney(r.eur / r.priced) : '—'} />
        <Dato titulo="Wanted" valor={String(wanted)} nota="Cartas que te faltan" />
        <Dato
          titulo="Lo que pagaste"
          valor={pagadas.length ? formatMoney(pagado) : '—'}
          nota={pagadas.length ? `${pagadas.length} copias apuntadas · hoy valen ≈ ${formatMoney(valorPagadas)}` : 'Apúntalo en cada copia para verlo'}
        />
        <Dato
          titulo="Ganancia o pérdida"
          valor={pagadas.length ? `${valorPagadas - pagado >= 0 ? '+' : ''}${formatMoney(valorPagadas - pagado)}` : '—'}
          nota="De las copias con precio de compra"
        />
        <Dato titulo="1.ª edición" valor={String(primeras)} nota={conVersion.length ? `${Math.round((primeras / conVersion.length) * 100)} % de las copias` : undefined} />
        <Dato titulo="Sets distintos" valor={String(new Set(conVersion.map((c) => c.setCode.split('-')[0])).size)} />
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <Reparto titulo="Por idioma" datos={cuenta((c) => c.lang || '—')} />
        <Reparto titulo="Por estado" datos={cuenta((c) => (c.personalizado ? 'Personal.' : c.condition || '—'))} />
      </div>
    </div>
  );
}

/*
 * El valor de las copias que tienes ahora, día a día, con el precio de
 * referencia de cada versión (el que guarda el historial) y su estado. No es
 * el de la colección que tenías cada día: no se sabe cuándo entró cada copia.
 */
function ValorEnElTiempo({ tenidas }: { tenidas: Card[] }) {
  const [historiales, setHistoriales] = useState<Map<number, PricePoint[]> | null>(null);
  const [rango, setRango] = useState<(typeof RANGOS)[number]['id']>('90D');
  const ids = useMemo(() => [...new Set(tenidas.map((c) => c.apiId))], [tenidas]);

  useEffect(() => {
    let vivo = true;
    loadHistories(ids)
      .then((h) => vivo && setHistoriales(h))
      .catch(() => vivo && setHistoriales(new Map()));
    return () => {
      vivo = false;
    };
  }, [ids]);

  const serie = useMemo(() => {
    if (!historiales) return [];
    const porDia = new Map<string, number>();
    for (const c of tenidas) {
      const puntos = historiales.get(c.apiId);
      if (!puntos?.length) continue;
      const claves = new Set(puntos.flatMap((p) => Object.keys(p.p)));
      const clave = resolvePrintingKey(claves, c.setCode, c.rarity, c.lang);
      const factor = conditionFactor(c.condition);
      for (const p of puntos) {
        const eur = p.p[clave];
        if (eur != null) porDia.set(p.d, (porDia.get(p.d) ?? 0) + eur * factor);
      }
    }
    return [...porDia].sort(([a], [b]) => a.localeCompare(b)).map(([d, eur]) => ({ d, eur }));
  }, [historiales, tenidas]);

  if (!historiales) {
    return (
      <div className="flex items-center justify-center gap-2 text-muted text-sm py-16">
        <Loader2 size={16} className="animate-spin" /> Cargando el historial…
      </div>
    );
  }
  const dias = RANGOS.find((r) => r.id === rango)!.dias;
  const ultimo = serie.at(-1);
  const desde = ultimo ? new Date(`${ultimo.d}T12:00:00`).getTime() - dias * 86_400_000 : 0;
  const puntos = serie.filter((p) => !Number.isFinite(dias) || new Date(`${p.d}T12:00:00`).getTime() >= desde);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-2xl font-bold text-main">{ultimo ? `≈ ${formatMoney(ultimo.eur)}` : '—'}</div>
          {puntos.length > 1 && (() => {
            const dif = puntos.at(-1)!.eur - puntos[0]!.eur;
            const pct = puntos[0]!.eur ? (dif / puntos[0]!.eur) * 100 : 0;
            return (
              <div className={`text-sm font-semibold ${dif >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {dif >= 0 ? '+' : ''}
                {formatMoney(dif)} ({dif >= 0 ? '+' : ''}
                {pct1(pct)} %) desde el {fechaCorta(puntos[0]!.d)}
              </div>
            );
          })()}
        </div>
        <div className="flex gap-1">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRango(r.id)}
              aria-pressed={rango === r.id}
              className={`px-2.5 py-1 rounded-md text-xs font-bold ${rango === r.id ? 'bg-main/10 text-main' : 'text-muted hover:text-main'}`}
            >
              {r.id}
            </button>
          ))}
        </div>
      </div>
      {puntos.length < 2 ? (
        <div className="text-center text-muted text-sm py-16">Aún no hay historial suficiente: se apunta solo cada día.</div>
      ) : (
        <Grafica puntos={puntos} />
      )}
      <p className="text-[11px] text-muted">
        Lo que valían cada día las copias que tienes ahora (precio de referencia de Cardmarket, ajustado por su estado). El historial empieza el 7 de octubre de
        2026, cuando se rehízo el emparejamiento con Cardmarket.
      </p>
    </div>
  );
}

function Grafica({ puntos }: { puntos: { d: string; eur: number }[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { t: 10, r: 10, b: 22, l: 52 };
  const valores = puntos.map((p) => p.eur);
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (max - min < 1) {
    min -= 0.5;
    max += 0.5;
  }
  const x = (i: number) => pad.l + (i / (puntos.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.eur).toFixed(1)}`).join(' ');
  const area = `${linea} L${x(puntos.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const sube = puntos.at(-1)!.eur >= puntos[0]!.eur;
  const color = sube ? 'rgb(52 211 153)' : 'rgb(248 113 113)';
  const p = foco != null ? puntos[foco] : null;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (puntos.length - 1));
          setFoco(Math.max(0, Math.min(puntos.length - 1, i)));
        }}
        onPointerLeave={() => setFoco(null)}
      >
        {[0, 0.5, 1].map((t) => {
          const v = min + (max - min) * t;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-main/10" />
              <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="fill-current text-muted" fontSize="10">
                {formatMoney(v)}
              </text>
            </g>
          );
        })}
        <path d={area} fill={color} opacity="0.15" />
        <path d={linea} fill="none" stroke={color} strokeWidth="2" />
        <text x={pad.l} y={H - 6} className="fill-current text-muted" fontSize="10">
          {fechaCorta(puntos[0]!.d)}
        </text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-current text-muted" fontSize="10">
          {fechaCorta(puntos.at(-1)!.d)}
        </text>
        {p && foco != null && (
          <g>
            <line x1={x(foco)} x2={x(foco)} y1={pad.t} y2={H - pad.b} stroke="currentColor" className="text-main/30" />
            <circle cx={x(foco)} cy={y(p.eur)} r="4" fill={color} />
          </g>
        )}
      </svg>
      {p && (
        <div className="absolute top-1 right-2 text-xs bg-bg-panel border border-border-base rounded-md px-2 py-1 text-main">
          {fechaCorta(p.d)} · ≈ {formatMoney(p.eur)}
        </div>
      )}
    </div>
  );
}

function Tabla({ cabeceras, filas }: { cabeceras: string[]; filas: ReactNode[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] text-muted text-left border-b border-border-base">
          {cabeceras.map((c, i) => (
            <th key={c} className={`py-2 px-2 font-medium ${i > 0 ? 'text-right' : ''}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-b border-border-base/50 hover:bg-main/5">
            {f.map((celda, j) => (
              <td key={j} className={`py-1.5 px-2 ${j > 0 ? 'text-right tabular-nums text-main' : 'text-main'}`}>
                {celda}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PorSet({ cartas }: { cartas: Card[] }) {
  const { valueOf, versionesDe } = usePrices();
  const [q, setQ] = useState('');
  const filas = useMemo(() => {
    const porSet = new Map<string, { nombre: string; copias: number; distintas: Set<number>; valor: number; conPrecio: number }>();
    for (const c of cartas) {
      const prefijo = c.setCode.split('-')[0]!;
      let s = porSet.get(prefijo);
      if (!s) {
        s = { nombre: '', copias: 0, distintas: new Set(), valor: 0, conPrecio: 0 };
        porSet.set(prefijo, s);
      }
      if (!s.nombre) s.nombre = versionesDe(c.apiId).find((v) => v.code === c.setCode)?.set ?? '';
      s.copias++;
      s.distintas.add(c.apiId);
      const v = valueOf(c);
      if (v != null) {
        s.valor += v;
        s.conPrecio++;
      }
    }
    return [...porSet].sort((a, b) => b[1].copias - a[1].copias);
  }, [cartas, valueOf, versionesDe]);
  const nq = normalizeStr(q.trim());
  const visibles = filas.filter(([p, s]) => !nq || normalizeStr(`${p} ${s.nombre}`).includes(nq));
  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar set…"
          className="w-full bg-bg-panel border border-border-base text-main rounded-lg pl-8 pr-2 py-1.5 text-sm focus:border-primary outline-none"
        />
      </div>
      <p className="text-xs text-muted">{filas.length} sets distintos.</p>
      <Tabla
        cabeceras={['Set', 'Copias', 'Cartas', 'Valor', 'Medio']}
        filas={visibles.map(([p, s]) => [
          <span>
            <span className="font-mono font-bold">{p}</span> <span className="text-muted text-xs">{s.nombre}</span>
          </span>,
          s.copias,
          s.distintas.size,
          s.conPrecio ? formatMoney(s.valor) : '—',
          s.conPrecio ? formatMoney(s.valor / s.conPrecio) : '—',
        ])}
      />
    </div>
  );
}

function PorRareza({ cartas }: { cartas: Card[] }) {
  const { valueOf } = usePrices();
  const filas = useMemo(() => {
    const m = new Map<string, { copias: number; valor: number; conPrecio: number; max: number }>();
    for (const c of cartas) {
      const r = m.get(c.rarity) ?? { copias: 0, valor: 0, conPrecio: 0, max: 0 };
      r.copias++;
      const v = valueOf(c);
      if (v != null) {
        r.valor += v;
        r.conPrecio++;
        r.max = Math.max(r.max, v);
      }
      m.set(c.rarity, r);
    }
    return [...m].sort((a, b) => getRarityWeight(b[0]) - getRarityWeight(a[0]) || b[1].copias - a[1].copias);
  }, [cartas, valueOf]);
  const total = cartas.length || 1;
  return (
    <Tabla
      cabeceras={['Rareza', 'Copias', '%', 'Valor', 'Medio', 'La más cara']}
      filas={filas.map(([r, s]) => [
        <span style={{ color: getRarityColor(r) }}>{r}</span>,
        s.copias,
        `${pct1((s.copias / total) * 100)} %`,
        s.conPrecio ? formatMoney(s.valor) : '—',
        s.conPrecio ? formatMoney(s.valor / s.conPrecio) : '—',
        s.conPrecio ? formatMoney(s.max) : '—',
      ])}
    />
  );
}

function Repetidas({ cartas, nombre, onOpenCard }: { cartas: Card[]; nombre: (c: Card) => string; onOpenCard: (c: Card) => void }) {
  const { valueOf } = usePrices();
  const [modo, setModo] = useState<'version' | 'carta'>('version');
  const grupos = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const c of cartas) {
      const k = modo === 'version' ? `${c.apiId}|${c.setCode}|${c.rarity}|${c.lang}` : String(c.apiId);
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.values()]
      .filter((g) => g.length > 1)
      .map((g) => {
        // De más: todas menos la mejor (la más valiosa).
        const valores = g.map((c) => valueOf(c) ?? 0).sort((a, b) => b - a);
        return { g, sobran: valores.slice(1).reduce((n, v) => n + v, 0) };
      })
      .sort((a, b) => b.sobran - a.sobran || b.g.length - a.g.length);
  }, [cartas, modo, valueOf]);
  const totalSobran = grupos.reduce((n, x) => n + x.sobran, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(['version', 'carta'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              aria-pressed={modo === m}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${modo === m ? 'border-primary/60 bg-primary/10 text-main' : 'border-border-base text-muted hover:text-main'}`}
            >
              {m === 'version' ? 'Misma versión' : 'Misma carta (cualquier versión)'}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">
          {grupos.length} repetidas · las de más valen ≈ {formatMoney(totalSobran)}
        </span>
      </div>
      <Tabla
        cabeceras={['Carta', 'Copias', 'Cada una', 'Las de más']}
        filas={grupos.map(({ g, sobran }) => {
          const c = g[0]!;
          const v = valueOf(c);
          return [
            <button type="button" onClick={() => onOpenCard(c)} className="text-left hover:text-primary">
              {nombre(c)}{' '}
              {modo === 'version' && (
                <span className="text-xs text-muted">
                  <span className="font-mono">{codigoDeCopia(c.setCode, c.lang)}</span> · <span style={{ color: getRarityColor(c.rarity) }}>{c.rarity}</span>
                </span>
              )}
            </button>,
            g.length,
            modo === 'version' && v != null ? formatMoney(v) : '—',
            sobran ? formatMoney(sobran) : '—',
          ];
        })}
      />
    </div>
  );
}

function Top({
  cartas,
  nombre,
  onOpenCard,
  valueOf,
  versionesDe,
}: {
  cartas: Card[];
  nombre: (c: Card) => string;
  onOpenCard: (c: Card) => void;
  valueOf: (c: Card) => number | null;
  versionesDe: ReturnType<typeof usePrices>['versionesDe'];
}) {
  const top = useMemo(
    () =>
      cartas
        .map((c) => ({ c, v: valueOf(c) }))
        .filter((x): x is { c: Card; v: number } => x.v != null)
        .sort((a, b) => b.v - a.v)
        .slice(0, 25),
    [cartas, valueOf],
  );
  return (
    <div className="space-y-1.5">
      {top.map(({ c, v }, i) => (
        <button
          key={c.uid}
          type="button"
          onClick={() => onOpenCard(c)}
          className="w-full flex items-center gap-3 p-2 rounded-xl bg-bg-panel border border-border-base hover:border-primary/50 text-left"
        >
          <span className="w-6 text-right text-xs text-muted tabular-nums">{i + 1}</span>
          <img src={c.img} alt="" loading="lazy" className="w-9 h-[52px] object-cover rounded" />
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-main truncate">{nombre(c)}</span>
            <span className="block text-xs text-muted truncate">
              <span style={{ color: getRarityColor(c.rarity) }}>{c.rarity}</span>
              {c.setCode && c.setCode !== '---' && (
                <>
                  {' '}
                  · <span className="font-mono">{codigoDeCopia(c.setCode, c.lang)}</span> · {versionesDe(c.apiId).find((x) => x.code === c.setCode)?.set ?? ''}
                </>
              )}
            </span>
          </span>
          <span className="font-bold text-primary tabular-nums">{formatMoney(v)}</span>
        </button>
      ))}
    </div>
  );
}
