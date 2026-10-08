import { useState } from 'react';
import { motion } from 'framer-motion';
import { Printer, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { usePrices } from '../../context/PricesContext';
import type { AlbumColumns, Card } from '../../types';
import { ID_ALL } from '../../utils';
import { compararCartas } from '../ordenCartas';
import { displayName, useNameMode, useSpanishNames } from '../useCardName';

/*
 * Hojas de cartas buscadas para imprimir: cada buscada a tamaño real (59 × 86
 * mm, 9 por A4), con su imagen (la elegida, si se cambió el arte), un sello
 * "BUSCADA" y dónde va en el álbum de verdad: carpeta, página y posición en la
 * hoja de fundas. Se recortan y se meten en los bolsillos vacíos; al conseguir
 * la carta, se cambia por ella.
 *
 * La posición es la del álbum de la web: el orden de cada carpeta (el suyo, sin
 * filtros) con las buscadas en su sitio, y los bolsillos por hoja elegidos aquí.
 */

interface Props {
  onClose: () => void;
}

interface Entrada {
  carpeta: string;
  pagina: number;
  fila: number;
  columna: number;
  card: Card;
}

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function generarHtml(entradas: Entrada[], nombre: (c: Card) => string, opciones: { gris: boolean; lista: boolean; cols: number }) {
  const porHoja = 9;
  const hojas: Entrada[][] = [];
  for (let i = 0; i < entradas.length; i += porHoja) hojas.push(entradas.slice(i, i + porHoja));
  const posicion = (e: Entrada) => `Pág. ${e.pagina} · fila ${e.fila}, col. ${e.columna}`;

  const lista = opciones.lista
    ? `<section class="lista">
        <h1>Cartas buscadas para el álbum</h1>
        <p class="nota">Bolsillos por hoja del álbum: ${opciones.cols}×${opciones.cols}. Marca cada una al conseguirla.</p>
        <table>
          <thead><tr><th></th><th>Carpeta</th><th>Página</th><th>Posición</th><th>Carta</th><th>Versión</th></tr></thead>
          <tbody>${entradas
            .map(
              (e) => `<tr><td class="casilla"></td><td>${escapar(e.carpeta)}</td><td>${e.pagina}</td><td>fila ${e.fila}, col. ${e.columna}</td><td>${escapar(nombre(e.card))}</td><td>${escapar(
                e.card.setCode && e.card.setCode !== '---' ? `${e.card.setCode} · ${e.card.rarity}` : '',
              )}</td></tr>`,
            )
            .join('')}</tbody>
        </table>
      </section>`
    : '';

  const cartas = hojas
    .map(
      (hoja) => `<section class="hoja">${hoja
        .map(
          (e) => `<div class="carta${opciones.gris ? ' gris' : ''}">
            <img src="${escapar(e.card.img)}" alt="">
            <div class="sello">BUSCADA</div>
            <div class="etiqueta"><b>${escapar(posicion(e))}</b><br>${escapar(e.carpeta)}<br><span class="nombre">${escapar(nombre(e.card))}</span>${
              e.card.setCode && e.card.setCode !== '---' ? `<br><span class="version">${escapar(e.card.setCode)} · ${escapar(e.card.rarity)}</span>` : ''
            }</div>
          </div>`,
        )
        .join('')}</section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Cartas buscadas para el álbum</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #111; background: #fff; }
  .barra { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 10px 16px; background: #1b1b1f; color: #fff; font-size: 14px; }
  .barra button { padding: 8px 14px; border: 0; border-radius: 8px; background: #fbbf24; color: #000; font-weight: 700; cursor: pointer; }
  .barra span { opacity: .8; }
  @media print { .barra { display: none; } }
  .lista { padding: 6mm 0; break-after: page; }
  .lista h1 { font-size: 16pt; margin: 0 0 2mm; }
  .nota { margin: 0 0 4mm; color: #555; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th, td { border-bottom: .2mm solid #ccc; padding: 1.4mm 2mm; text-align: left; }
  th { background: #f2f2f2; }
  .casilla { width: 6mm; }
  .casilla::before { content: ''; display: inline-block; width: 3.5mm; height: 3.5mm; border: .3mm solid #333; border-radius: .6mm; }
  .hoja { display: grid; grid-template-columns: repeat(3, 59mm); grid-auto-rows: 86mm; gap: 3mm; justify-content: center; padding-top: 4mm; break-after: page; }
  .hoja:last-child { break-after: auto; }
  .carta { position: relative; width: 59mm; height: 86mm; border-radius: 2.6mm; overflow: hidden; border: .25mm dashed #777; break-inside: avoid; }
  .carta img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .gris img { filter: grayscale(1) brightness(1.08) contrast(.92); }
  .sello { position: absolute; top: 30mm; left: 50%; transform: translateX(-50%) rotate(-12deg); padding: .6mm 2.4mm; border: .8mm solid #c40000; color: #c40000; background: rgba(255,255,255,.8); font-weight: 900; font-size: 6.5mm; letter-spacing: .8mm; }
  .etiqueta { position: absolute; left: 0; right: 0; bottom: 0; padding: 1.2mm 1.8mm; background: rgba(255,255,255,.93); border-top: .25mm solid #999; font-size: 2.5mm; line-height: 1.3; }
  .etiqueta b { font-size: 3.2mm; }
  .nombre { font-weight: 600; }
  .version { color: #444; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head>
<body>
  <div class="barra">
    <button onclick="print()">Imprimir</button>
    <span>${entradas.length} ${entradas.length === 1 ? 'carta' : 'cartas'} en ${hojas.length} ${hojas.length === 1 ? 'hoja' : 'hojas'}. Imprime a tamaño real (escala 100 %, sin «ajustar a la página») para que quepan en las fundas.</span>
  </div>
  ${lista}
  ${cartas}
  <script>
    // Se abre el diálogo de imprimir cuando han cargado todas las imágenes.
    Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))).then(() => setTimeout(() => print(), 300));
  </script>
</body></html>`;
}

export function HojasBuscadasModal({ onClose }: Props) {
  const { state, toast } = useStore();
  const { valueOf } = usePrices();
  const nombresEs = useSpanishNames();
  const modoNombres = useNameMode();
  const nombre = (c: Card) => displayName(c, nombresEs, modoNombres);

  const carpetas = state.db.folders.filter((f) => f.id !== ID_ALL);
  const buscadasDe = (id: string) => state.db.cards.filter((c) => c.folderId === id && c.isWanted).length;
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(carpetas.filter((f) => buscadasDe(f.id) > 0).map((f) => f.id)));
  const [cols, setCols] = useState<AlbumColumns>(state.ui.albumColumns);
  const [gris, setGris] = useState(false);
  const [lista, setLista] = useState(true);

  const total = carpetas.filter((f) => elegidas.has(f.id)).reduce((n, f) => n + buscadasDe(f.id), 0);

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  const generar = () => {
    const porPagina = cols * cols;
    const entradas: Entrada[] = [];
    for (const f of carpetas) {
      if (!elegidas.has(f.id)) continue;
      // El orden de la carpeta, como en el álbum (todas sus cartas, sin filtros).
      let todas = state.db.cards.filter((c) => c.folderId === f.id);
      const comparar = compararCartas(f.cardSort ?? 'type', f.cardSortDir ?? 'asc', nombre, valueOf);
      if (comparar) todas = [...todas].sort(comparar);
      todas.forEach((card, i) => {
        if (!card.isWanted) return;
        const bolsillo = i % porPagina;
        entradas.push({ carpeta: f.name, pagina: Math.floor(i / porPagina) + 1, fila: Math.floor(bolsillo / cols) + 1, columna: (bolsillo % cols) + 1, card });
      });
    }
    if (entradas.length === 0) return toast('No hay cartas buscadas en esas carpetas', 'err');
    const ventana = window.open('', '_blank');
    if (!ventana) return toast('El navegador bloqueó la ventana: permite las ventanas emergentes de esta página', 'err');
    ventana.document.open();
    ventana.document.write(generarHtml(entradas, nombre, { gris, lista, cols }));
    ventana.document.close();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-hojas-buscadas"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-bg-surface border border-border-base rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-4 border-b border-border-base flex items-start justify-between gap-3 shrink-0 bg-bg-panel rounded-t-2xl">
          <div>
            <h3 id="titulo-hojas-buscadas" className="font-bold text-lg text-main">Hojas de cartas buscadas</h3>
            <p className="text-xs text-muted">
              Para imprimir, recortar y meter en los bolsillos vacíos del álbum: cada carta a tamaño real, con su página y su posición.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 hover:bg-main/10 rounded text-main/70 hover:text-main shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted">Carpetas</span>
              <div className="flex gap-3 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setElegidas(new Set(carpetas.filter((f) => buscadasDe(f.id) > 0).map((f) => f.id)))}>
                  Todas
                </button>
                <button type="button" className="text-muted hover:text-main" onClick={() => setElegidas(new Set())}>
                  Ninguna
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {carpetas.map((f) => {
                const n = buscadasDe(f.id);
                return (
                  <label
                    key={f.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                      n === 0 ? 'opacity-40 cursor-not-allowed border-transparent' : elegidas.has(f.id) ? 'border-primary/50 bg-primary/10 cursor-pointer' : 'border-border-base hover:bg-main/5 cursor-pointer'
                    }`}
                  >
                    <input type="checkbox" className="accent-primary" checked={elegidas.has(f.id)} disabled={n === 0} onChange={() => alternar(f.id)} />
                    <span className="flex-1 truncate text-sm text-main">{f.name}</span>
                    <span className="text-xs text-muted whitespace-nowrap">
                      {n} {n === 1 ? 'buscada' : 'buscadas'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-muted block mb-2">Bolsillos por hoja de tu álbum</span>
            <div className="flex gap-2">
              {([2, 3, 4] as AlbumColumns[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCols(n)}
                  aria-pressed={cols === n}
                  className={`flex-1 py-2 rounded-lg border text-sm font-bold transition-colors ${
                    cols === n ? 'bg-primary/15 border-primary text-main' : 'bg-bg-panel border-transparent text-muted hover:text-main'
                  }`}
                >
                  {n}×{n}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-1.5">La posición sigue el orden de cada carpeta en la web, como en la vista álbum.</p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm text-main cursor-pointer">
              <input type="checkbox" className="accent-primary" checked={lista} onChange={(e) => setLista(e.target.checked)} />
              Incluir una lista para ir marcando las que consigues
            </label>
            <label className="flex items-center gap-3 text-sm text-main cursor-pointer">
              <input type="checkbox" className="accent-primary" checked={gris} onChange={(e) => setGris(e.target.checked)} />
              Imágenes en gris (gasta menos tinta)
            </label>
          </div>
        </div>

        <div className="p-4 border-t border-border-base bg-bg-panel rounded-b-2xl flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted">
            {total} {total === 1 ? 'carta' : 'cartas'} · {Math.ceil(total / 9)} {Math.ceil(total / 9) === 1 ? 'hoja' : 'hojas'} A4
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-main bg-main/5 hover:bg-main/10">
              Cancelar
            </button>
            <button
              type="button"
              onClick={generar}
              disabled={total === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-primary text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer size={16} /> Generar hojas
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
