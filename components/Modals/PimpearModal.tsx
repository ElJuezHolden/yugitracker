import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Gem, Search, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { usePrices, type VersionCarta } from '../../context/PricesContext';
import type { Card } from '../../types';
import { ID_ALL, formatMoney, getCardMarketLink, getCardMarketProductLink, getRarityColor, getRarityWeight, normalizeStr } from '../../utils';
import { isPlaceholderRarity } from '../../services/versiones';
import { codigoDeCopia } from '../../services/codigosEs';
import { displayName, useNameMode, useSpanishNames } from '../useCardName';

/*
 * Cartas para "pimpear": las que tienes y existen en una rareza más alta (la
 * tienes en Super y hay Ultra o Secret; en Common y hay Ultimate…). Solo en esta
 * ventana: no marca nada en el resto de la web.
 *
 * Se mira cada carta (no cada copia): cuenta la rareza más alta que tengas de
 * ella, y se listan sus versiones por encima, con su precio.
 */

interface Props {
  onClose: () => void;
  onOpenCard: (card: Card) => void;
}

interface Fila {
  apiId: number;
  /** La copia de rareza más alta: la que se enseña y se abre. */
  copia: Card;
  copias: number;
  carpetas: string[];
  mejoras: VersionCarta[];
  /** Precio de la mejora más barata con precio. */
  desde: number | null;
}

type Orden = 'precio' | 'nombre' | 'salto';

export function PimpearModal({ onClose, onOpenCard }: Props) {
  const { state } = useStore();
  const { versionesDe } = usePrices();
  const nombresEs = useSpanishNames();
  const modoNombres = useNameMode();
  const [carpeta, setCarpeta] = useState<string>(ID_ALL);
  const [texto, setTexto] = useState('');
  const [orden, setOrden] = useState<Orden>('precio');
  const [soloConPrecio, setSoloConPrecio] = useState(true);

  const carpetas = state.db.folders.filter((f) => f.id !== ID_ALL);
  const nombreCarpeta = useMemo(() => new Map(carpetas.map((f) => [f.id, f.name])), [carpetas]);

  const filas = useMemo(() => {
    const porCarta = new Map<number, Card[]>();
    for (const c of state.db.cards) {
      if (c.isWanted || c.personalizado || !c.setCode || c.setCode === '---') continue;
      if (carpeta !== ID_ALL && c.folderId !== carpeta) continue;
      porCarta.set(c.apiId, [...(porCarta.get(c.apiId) ?? []), c]);
    }
    const out: Fila[] = [];
    for (const [apiId, copias] of porCarta) {
      const copia = copias.reduce((a, b) => (getRarityWeight(b.rarity) > getRarityWeight(a.rarity) ? b : a));
      // Con una rareza provisional ("New") no se sabe qué tienes: fuera, o todo saldría como mejora.
      if (isPlaceholderRarity(copia.rarity)) continue;
      const tengo = getRarityWeight(copia.rarity);
      const mejoras = versionesDe(apiId)
        .filter((v) => !isPlaceholderRarity(v.rarity) && getRarityWeight(v.rarity) > tengo)
        .sort((a, b) => getRarityWeight(b.rarity) - getRarityWeight(a.rarity) || (a.eur ?? Infinity) - (b.eur ?? Infinity));
      const conPrecio = mejoras.filter((v) => v.eur != null);
      if (mejoras.length === 0 || (soloConPrecio && conPrecio.length === 0)) continue;
      out.push({
        apiId,
        copia,
        copias: copias.length,
        carpetas: [...new Set(copias.map((c) => nombreCarpeta.get(c.folderId) ?? ''))].filter(Boolean),
        mejoras: soloConPrecio ? conPrecio : mejoras,
        desde: conPrecio.length ? Math.min(...conPrecio.map((v) => v.eur!)) : null,
      });
    }
    return out;
  }, [state.db.cards, carpeta, versionesDe, soloConPrecio, nombreCarpeta]);

  const nombre = (c: Card) => displayName(c, nombresEs, modoNombres);
  const q = normalizeStr(texto.trim());
  const visibles = filas
    .filter((f) => !q || normalizeStr(`${nombre(f.copia)} ${f.copia.name}`).includes(q))
    .sort((a, b) =>
      orden === 'nombre'
        ? nombre(a.copia).localeCompare(nombre(b.copia))
        : orden === 'salto'
          ? getRarityWeight(b.mejoras[0]!.rarity) - getRarityWeight(b.copia.rarity) - (getRarityWeight(a.mejoras[0]!.rarity) - getRarityWeight(a.copia.rarity))
          : (a.desde ?? Infinity) - (b.desde ?? Infinity),
    );

  return (
    <div className="fixed inset-0 z-[115] flex items-start sm:items-center justify-center bg-black/80 p-2 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-pimpear"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-bg-surface border border-border-base rounded-2xl shadow-2xl flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[90vh]"
      >
        <div className="p-4 border-b border-border-base flex items-start justify-between gap-3 shrink-0 bg-bg-panel rounded-t-2xl">
          <div>
            <h3 id="titulo-pimpear" className="font-bold text-lg text-main flex items-center gap-2">
              <Gem size={18} className="text-primary" /> Cartas para pimpear
            </h3>
            <p className="text-xs text-muted">Cartas que tienes y que existen en una rareza más alta, con el precio de cada versión.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 hover:bg-main/10 rounded text-main/70 hover:text-main shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 border-b border-border-base flex flex-wrap gap-2 items-center shrink-0">
          <div className="relative flex-1 min-w-[10rem]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar carta…"
              className="w-full bg-bg-panel border border-border-base text-main rounded-lg pl-8 pr-2 py-1.5 text-sm focus:border-primary outline-none"
            />
          </div>
          <select
            value={carpeta}
            onChange={(e) => setCarpeta(e.target.value)}
            className="bg-bg-panel border border-border-base text-main rounded-lg px-2 py-1.5 text-sm outline-none"
            aria-label="Carpeta"
          >
            <option value={ID_ALL}>Todas las carpetas</option>
            {carpetas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            className="bg-bg-panel border border-border-base text-main rounded-lg px-2 py-1.5 text-sm outline-none"
            aria-label="Orden"
          >
            <option value="precio">Mejora más barata primero</option>
            <option value="salto">Mayor salto de rareza</option>
            <option value="nombre">Por nombre</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" className="accent-primary" checked={soloConPrecio} onChange={(e) => setSoloConPrecio(e.target.checked)} />
            Solo versiones con precio
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {visibles.length === 0 ? (
            <div className="text-center text-muted text-sm py-10">
              {filas.length === 0 ? 'No hay cartas que se puedan mejorar de rareza.' : 'Ninguna carta coincide con la búsqueda.'}
            </div>
          ) : (
            visibles.map((f) => (
              <div key={f.apiId} className="flex gap-3 p-2.5 rounded-xl bg-bg-panel border border-border-base">
                <button type="button" onClick={() => onOpenCard(f.copia)} className="shrink-0" title="Abrir la copia">
                  <img src={f.copia.img} alt="" loading="lazy" className="w-12 h-[70px] object-cover rounded" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <button type="button" onClick={() => onOpenCard(f.copia)} className="font-bold text-main truncate hover:text-primary text-left">
                      {nombre(f.copia)}
                    </button>
                    <a
                      href={getCardMarketLink(f.copia.name)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-primary shrink-0"
                      title="Todas sus versiones en Cardmarket"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                  <div className="text-xs text-muted truncate">
                    Tienes:{' '}
                    <span style={{ color: getRarityColor(f.copia.rarity) }}>{f.copia.rarity}</span>{' '}
                    <span className="font-mono">{codigoDeCopia(f.copia.setCode, f.copia.lang)}</span>
                    {f.copias > 1 && ` · ${f.copias} copias`}
                    {f.carpetas.length > 0 && ` · ${f.carpetas.join(', ')}`}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {f.mejoras.map((v) => {
                      const contenido = (
                        <>
                          <span style={{ color: getRarityColor(v.rarity) }}>{v.rarity}</span>
                          <span className="font-mono text-muted">{v.code}</span>
                          <span className="font-semibold text-main">{v.eur != null ? `≈ ${formatMoney(v.eur)}` : '—'}</span>
                        </>
                      );
                      const clase = 'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-bg-surface border border-border-base';
                      return v.idProduct ? (
                        <a
                          key={`${v.code}|${v.rarity}`}
                          href={getCardMarketProductLink(v.idProduct)}
                          target="_blank"
                          rel="noreferrer"
                          className={`${clase} hover:border-primary/60`}
                          title={`${v.set ? `${v.set} · ` : ''}Ver esta versión en Cardmarket`}
                        >
                          {contenido}
                        </a>
                      ) : (
                        <span key={`${v.code}|${v.rarity}`} className={clase} title={v.set || undefined}>
                          {contenido}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-border-base bg-bg-panel rounded-b-2xl text-xs text-muted shrink-0">
          {visibles.length} {visibles.length === 1 ? 'carta' : 'cartas'} se {visibles.length === 1 ? 'puede' : 'pueden'} mejorar de rareza
        </div>
      </motion.div>
    </div>
  );
}
