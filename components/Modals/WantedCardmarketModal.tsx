import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ClipboardList, Copy, ExternalLink, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { usePrices } from '../../context/PricesContext';
import type { Card } from '../../types';
import { ID_ALL } from '../../utils';
import { sameRarity } from '../../services/versiones';

/*
 * Las wanted en el formato de importación de los Wants de Cardmarket: una carta
 * por línea, "cantidad nombre (versión) (expansión)", como en su ayuda
 * ("3x Kozmo Dark Destroyer (Dimension of Chaos)", "Ancient Fairy Dragon (V.4)
 * (Ancient Prophecy)"). El nombre va en inglés, que es como los busca.
 *
 * La versión (V.n) la publica el proceso diario cuando en la expansión hay
 * varias de la misma carta: sin ella, Cardmarket aceptaría cualquier rareza de
 * esa expansión. La expansión es el nombre del set de YGOPRODeck, que en inglés
 * casi siempre es el de Cardmarket; si alguna no casa, Cardmarket lo dice al
 * importar.
 */

interface Props {
  onClose: () => void;
}

const URL_WANTS = 'https://www.cardmarket.com/es/YuGiOh/Wants';

export function WantedCardmarketModal({ onClose }: Props) {
  const { state } = useStore();
  const { versionesDe } = usePrices();
  const carpetas = state.db.folders.filter((f) => f.id !== ID_ALL);
  const wantedDe = (id: string) => state.db.cards.filter((c) => c.folderId === id && c.isWanted);
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(carpetas.filter((f) => wantedDe(f.id).length > 0).map((f) => f.id)));
  const [conVersion, setConVersion] = useState(true);
  const [conExpansion, setConExpansion] = useState(true);
  const [copiado, setCopiado] = useState(false);

  const { texto, lineas, cartas, sinSet } = useMemo(() => {
    const cuenta = new Map<string, number>();
    let cartas = 0;
    let sinSet = 0;
    const linea = (c: Card) => {
      if (!c.setCode || c.setCode === '---' || !conExpansion) return c.name;
      const versiones = versionesDe(c.apiId).filter((v) => v.code === c.setCode);
      const v = versiones.find((x) => sameRarity(x.rarity, c.rarity)) ?? (versiones.length === 1 ? versiones[0] : undefined);
      // Sin el nombre del set (aún no han llegado sus datos), solo el nombre: la versión sola no le dice nada a Cardmarket.
      if (!v?.set) {
        sinSet++;
        return c.name;
      }
      return [c.name, conVersion && v.version ? `(V.${v.version})` : null, `(${v.set})`].filter(Boolean).join(' ');
    };
    for (const c of state.db.cards) {
      if (!c.isWanted || !elegidas.has(c.folderId)) continue;
      cartas++;
      const l = linea(c);
      cuenta.set(l, (cuenta.get(l) ?? 0) + 1);
    }
    const lineas = [...cuenta].sort((a, b) => a[0].localeCompare(b[0])).map(([l, n]) => `${n}x ${l}`);
    return { texto: lineas.join('\n'), lineas: lineas.length, cartas, sinSet };
  }, [state.db.cards, elegidas, conVersion, conExpansion, versionesDe]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso para el portapapeles: el texto se puede seleccionar a mano.
    }
  };

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  return (
    <div className="fixed inset-0 z-[115] flex items-start sm:items-center justify-center bg-black/80 p-2 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-wanted-cm"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-bg-surface border border-border-base rounded-2xl shadow-2xl flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[90vh]"
      >
        <div className="p-4 border-b border-border-base flex items-start justify-between gap-3 shrink-0 bg-bg-panel rounded-t-2xl">
          <div>
            <h3 id="titulo-wanted-cm" className="font-bold text-lg text-main flex items-center gap-2">
              <ClipboardList size={18} className="text-primary" /> Wanted para Cardmarket
            </h3>
            <p className="text-xs text-muted">
              Copia la lista y pégala en tus Wants de Cardmarket («Añadir cartas» con texto). Cada línea pide la versión exacta cuando se sabe.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 hover:bg-main/10 rounded text-main/70 hover:text-main shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted">Carpetas</span>
              <div className="flex gap-3 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setElegidas(new Set(carpetas.filter((f) => wantedDe(f.id).length > 0).map((f) => f.id)))}>
                  Todas
                </button>
                <button type="button" className="text-muted hover:text-main" onClick={() => setElegidas(new Set())}>
                  Ninguna
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {carpetas.map((f) => {
                const n = wantedDe(f.id).length;
                if (n === 0) return null;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => alternar(f.id)}
                    aria-pressed={elegidas.has(f.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                      elegidas.has(f.id) ? 'border-primary/60 bg-primary/10 text-main' : 'border-border-base text-muted hover:text-main'
                    }`}
                  >
                    {f.name} <span className="text-muted">· {n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-main cursor-pointer">
              <input type="checkbox" className="accent-primary" checked={conExpansion} onChange={(e) => setConExpansion(e.target.checked)} />
              Con la expansión
            </label>
            <label className={`flex items-center gap-2 text-sm cursor-pointer ${conExpansion ? 'text-main' : 'text-muted opacity-60'}`}>
              <input type="checkbox" className="accent-primary" checked={conVersion} disabled={!conExpansion} onChange={(e) => setConVersion(e.target.checked)} />
              Versión exacta (V.n: la rareza que buscas)
            </label>
          </div>

          {sinSet > 0 && (
            <p className="text-xs text-amber-400">
              {sinSet} {sinSet === 1 ? 'carta va' : 'cartas van'} solo con el nombre: aún no han llegado los datos de su set. Si acabas de abrir la web, espera unos segundos.
            </p>
          )}
          <textarea
            readOnly
            value={texto}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full h-64 bg-bg-panel border border-border-base rounded-lg p-3 text-xs font-mono text-main outline-none focus:border-primary resize-y"
            aria-label="Lista para Cardmarket"
          />
        </div>

        <div className="p-4 border-t border-border-base bg-bg-panel rounded-b-2xl flex flex-wrap items-center gap-3 shrink-0">
          <span className="text-xs text-muted">
            {cartas} {cartas === 1 ? 'carta' : 'cartas'} en {lineas} {lineas === 1 ? 'línea' : 'líneas'}
          </span>
          <div className="ml-auto flex gap-2">
            <a
              href={URL_WANTS}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-main bg-main/5 hover:bg-main/10"
            >
              <ExternalLink size={14} /> Mis Wants
            </a>
            <button
              type="button"
              onClick={copiar}
              disabled={lineas === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-primary text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? 'Copiada' : 'Copiar lista'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
