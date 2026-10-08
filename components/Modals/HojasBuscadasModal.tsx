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
 * mm, 9 por A4), con su imagen (la elegida, si se cambió el arte) y, si se
 * quiere, un sello "WANTED" como en la web. Se recortan y se meten en los
 * bolsillos vacíos; al conseguir la carta, se cambia por ella. Dónde va cada una
 * (carpeta, página y posición en la hoja de fundas) lo dice la lista inicial.
 *
 * La posición es la del álbum de la web: el orden de cada carpeta (el suyo, sin
 * filtros) con las buscadas en su sitio, y los bolsillos por hoja elegidos aquí.
 *
 * Tras generarlas se pregunta si se imprimieron: las que sí quedan marcadas
 * (Card.impresa) y la próxima vez se pueden imprimir solo las nuevas.
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

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fechaCorta = (f: string) => new Date(`${f}T00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function generarHtml(
  entradas: Entrada[],
  nombre: (c: Card) => string,
  opciones: { gris: boolean; lista: boolean; sello: boolean; juntas: boolean; carpetas: boolean; cols: number },
) {
  const porHoja = 9;
  const hojas: Entrada[][] = [];
  for (let i = 0; i < entradas.length; i += porHoja) hojas.push(entradas.slice(i, i + porHoja));

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

  /*
   * Juntas: las cartas pegadas, sin margen ni líneas (un corte de guillotina
   * separa dos), y las marcas de corte solo por fuera del bloque, alineadas con
   * cada corte.
   */
  const marcasDeCorte = (n: number) => {
    const columnas = Math.min(3, n);
    const filas = Math.ceil(n / 3);
    const marcas: string[] = [];
    for (let c = 0; c <= columnas; c++) {
      marcas.push(`<i class="marca v" style="left:${c * 59}mm;top:-7mm"></i>`, `<i class="marca v" style="left:${c * 59}mm;bottom:-7mm"></i>`);
    }
    for (let f = 0; f <= filas; f++) {
      marcas.push(`<i class="marca h" style="top:${f * 86}mm;left:-7mm"></i>`, `<i class="marca h" style="top:${f * 86}mm;right:-7mm"></i>`);
    }
    return marcas.join('');
  };

  /*
   * Carpeta de cada grupo: en el margen izquierdo, junto a la fila donde empieza
   * (y "desde la 2.ª" si empieza a mitad de fila). Una hoja que sigue con la
   * carpeta de la anterior lo dice en su primera fila, para que ninguna hoja
   * suelta quede sin saber de dónde es.
   */
  const alto = opciones.juntas ? 86 : 89;
  const arriba = opciones.juntas ? 0 : 4;
  const carpetasDe = (hoja: Entrada[], h: number) => {
    const porFila = new Map<number, string[]>();
    hoja.forEach((e, k) => {
      const anterior = k > 0 ? hoja[k - 1] : h > 0 ? hojas[h - 1]!.at(-1) : undefined;
      if (k > 0 && anterior?.carpeta === e.carpeta) return;
      const sigue = k === 0 && anterior?.carpeta === e.carpeta;
      const fila = Math.floor(k / 3);
      const col = k % 3;
      const texto = `${escapar(e.carpeta)}${sigue ? ' (sigue)' : col > 0 ? ` · desde la ${col + 1}.ª` : ''}`;
      porFila.set(fila, [...(porFila.get(fila) ?? []), texto]);
    });
    return [...porFila]
      .map(([fila, textos]) => `<div class="grupo" style="top:${arriba + fila * alto + 3}mm;height:80mm"><span>${textos.join(' · ')}</span></div>`)
      .join('');
  };

  const cartas = hojas
    .map(
      (hoja, h) => `<section class="hoja${opciones.juntas ? ' juntas' : ''}"${
        opciones.juntas ? ` style="grid-template-columns: repeat(${Math.min(3, hoja.length)}, 59mm)"` : ''
      }>${hoja
        .map(
          (e) => `<div class="carta${opciones.gris ? ' gris' : ''}">
            <img src="${escapar(e.card.img)}" alt="">
            ${opciones.sello ? '<div class="sello">WANTED</div>' : ''}
          </div>`,
        )
        .join('')}${opciones.juntas ? marcasDeCorte(hoja.length) : ''}${opciones.carpetas ? carpetasDe(hoja, h) : ''}</section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Cartas buscadas para el álbum</title>
<style>
  @page { size: A4; margin: 7mm; }
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
  .hoja { position: relative; display: grid; grid-template-columns: repeat(3, 59mm); grid-auto-rows: 86mm; gap: 3mm; width: fit-content; margin: 0 auto 0 max(7mm, calc(50% - 91.5mm)); padding-top: 4mm; break-after: page; }
  .hoja:last-child { break-after: auto; }
  /* Rectangulares, sin esquinas redondeadas: se cortan con guillotina. El borde discontinuo es la guía. */
  .carta { position: relative; width: 59mm; height: 86mm; overflow: hidden; border: .25mm dashed #777; break-inside: avoid; }
  /* Juntas: pegadas del todo, sin margen ni líneas; marcas de corte solo por fuera. */
  .hoja.juntas { gap: 0; margin: 8mm auto 0 max(9mm, calc(50% - 88.5mm)); padding: 0; }
  .juntas .carta { border: 0; }
  .grupo { position: absolute; left: -6mm; width: 4mm; display: flex; align-items: center; justify-content: center; border-right: .4mm solid #000; }
  .grupo span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 2.6mm; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-height: 78mm; }
  .marca { position: absolute; display: block; background: #000; }
  .marca.v { width: .2mm; height: 5mm; margin-left: -.1mm; }
  .marca.h { width: 5mm; height: .2mm; margin-top: -.1mm; }
  .carta img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .gris img { filter: grayscale(1) brightness(1.08) contrast(.92); }
  .sello { position: absolute; top: 30mm; left: 50%; transform: translateX(-50%) rotate(-12deg); padding: .6mm 2.4mm; border: .8mm solid #c40000; color: #c40000; background: rgba(255,255,255,.8); font-weight: 900; font-size: 6.5mm; letter-spacing: .8mm; }
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
  const { state, dispatch, toast } = useStore();
  const { valueOf } = usePrices();
  const nombresEs = useSpanishNames();
  const modoNombres = useNameMode();
  const nombre = (c: Card) => displayName(c, nombresEs, modoNombres);

  const carpetas = state.db.folders.filter((f) => f.id !== ID_ALL);
  const buscadas = (id: string) => state.db.cards.filter((c) => c.folderId === id && c.isWanted);
  const hayImpresas = state.db.cards.some((c) => c.isWanted && c.impresa);
  // Si ya se imprimió alguna, lo normal es imprimir solo las nuevas.
  const [soloNuevas, setSoloNuevas] = useState(hayImpresas);
  const aImprimir = (c: Card) => !(soloNuevas && c.impresa);
  const buscadasDe = (id: string) => buscadas(id).filter(aImprimir).length;
  const conAlgo = (nuevas: boolean) => new Set(carpetas.filter((f) => buscadas(f.id).some((c) => !(nuevas && c.impresa))).map((f) => f.id));
  const [elegidas, setElegidas] = useState<Set<string>>(() => conAlgo(hayImpresas));
  /** Cartas de las hojas recién generadas, a falta de saber si se imprimieron. */
  const [pendientes, setPendientes] = useState<string[] | null>(null);
  const [cols, setCols] = useState<AlbumColumns>(state.ui.albumColumns);
  const [gris, setGris] = useState(false);
  const [lista, setLista] = useState(true);
  const [sello, setSello] = useState(true);
  const [juntas, setJuntas] = useState(false);
  const [conCarpetas, setConCarpetas] = useState(true);

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
        if (!card.isWanted || !aImprimir(card)) return;
        const bolsillo = i % porPagina;
        entradas.push({ carpeta: f.name, pagina: Math.floor(i / porPagina) + 1, fila: Math.floor(bolsillo / cols) + 1, columna: (bolsillo % cols) + 1, card });
      });
    }
    if (entradas.length === 0) return toast('No hay cartas buscadas en esas carpetas', 'err');
    const ventana = window.open('', '_blank');
    if (!ventana) return toast('El navegador bloqueó la ventana: permite las ventanas emergentes de esta página', 'err');
    ventana.document.open();
    ventana.document.write(generarHtml(entradas, nombre, { gris, lista, sello, juntas, carpetas: conCarpetas, cols }));
    ventana.document.close();
    setPendientes(entradas.map((e) => e.card.uid));
  };

  const marcarImpresas = () => {
    if (!pendientes) return;
    dispatch({ type: 'SET_CARDS_PRINTED', payload: { uids: pendientes, fecha: hoy() } });
    toast(`${pendientes.length} ${pendientes.length === 1 ? 'carta marcada como impresa' : 'cartas marcadas como impresas'}`);
    onClose();
  };

  const desmarcar = (id: string) => {
    const uids = buscadas(id).filter((c) => c.impresa).map((c) => c.uid);
    dispatch({ type: 'SET_CARDS_PRINTED', payload: { uids, fecha: undefined } });
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
              Para imprimir, recortar y meter en los bolsillos vacíos del álbum: cada carta a tamaño real. La lista inicial dice la página y la posición de cada una.
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
                <button type="button" className="text-primary hover:underline" onClick={() => setElegidas(conAlgo(soloNuevas))}>
                  Todas
                </button>
                <button type="button" className="text-muted hover:text-main" onClick={() => setElegidas(new Set())}>
                  Ninguna
                </button>
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm text-main cursor-pointer mb-2">
              <input
                type="checkbox"
                className="accent-primary"
                checked={soloNuevas}
                onChange={(e) => {
                  setSoloNuevas(e.target.checked);
                  setElegidas(conAlgo(e.target.checked));
                }}
              />
              Solo las que aún no he impreso
            </label>
            <div className="flex flex-col gap-1">
              {carpetas.map((f) => {
                const n = buscadasDe(f.id);
                const todas = buscadas(f.id);
                const impresas = todas.filter((c) => c.impresa);
                const ultima = impresas.reduce((u, c) => (c.impresa! > u ? c.impresa! : u), '');
                return (
                  <label
                    key={f.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                      n === 0 ? `${impresas.length > 0 ? 'opacity-70' : 'opacity-40'} cursor-not-allowed border-transparent` : elegidas.has(f.id) ? 'border-primary/50 bg-primary/10 cursor-pointer' : 'border-border-base hover:bg-main/5 cursor-pointer'
                    }`}
                  >
                    <input type="checkbox" className="accent-primary" checked={elegidas.has(f.id)} disabled={n === 0} onChange={() => alternar(f.id)} />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm text-main">{f.name}</span>
                      {impresas.length > 0 && (
                        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                          <span>
                            {impresas.length === todas.length ? 'Todas impresas' : `${impresas.length} de ${todas.length} impresas`} · {fechaCorta(ultima)}
                          </span>
                          <button
                            type="button"
                            className="text-primary hover:underline shrink-0"
                            onClick={(e) => {
                              e.preventDefault();
                              desmarcar(f.id);
                            }}
                          >
                            Desmarcar
                          </button>
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted whitespace-nowrap">
                      {n} {soloNuevas && impresas.length > 0 ? (n === 1 ? 'nueva' : 'nuevas') : n === 1 ? 'buscada' : 'buscadas'}
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
              <input type="checkbox" className="accent-primary" checked={sello} onChange={(e) => setSello(e.target.checked)} />
              Sello «WANTED» sobre cada carta
            </label>
            <label className="flex items-center gap-3 text-sm text-main cursor-pointer">
              <input type="checkbox" className="accent-primary" checked={juntas} onChange={(e) => setJuntas(e.target.checked)} />
              Cartas pegadas, sin separación ni líneas (un solo corte entre cartas, con marcas de corte por fuera)
            </label>
            <label className="flex items-center gap-3 text-sm text-main cursor-pointer">
              <input type="checkbox" className="accent-primary" checked={conCarpetas} onChange={(e) => setConCarpetas(e.target.checked)} />
              Indicar en el lateral dónde empieza cada carpeta
            </label>
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

        {pendientes ? (
          <div className="p-4 border-t border-border-base bg-bg-panel rounded-b-2xl flex flex-wrap items-center gap-3 shrink-0">
            <span className="text-sm text-main flex-1 min-w-[12rem]">¿Las has impreso? Márcalas y la próxima vez podrás imprimir solo las nuevas.</span>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-main bg-main/5 hover:bg-main/10">
                Todavía no
              </button>
              <button type="button" onClick={marcarImpresas} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-black hover:brightness-110">
                Sí, marcar {pendientes.length} como impresas
              </button>
            </div>
          </div>
        ) : (
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
        )}
      </motion.div>
    </div>
  );
}
