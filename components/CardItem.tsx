import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Card, ViewMode } from '../types';
import { useStore } from '../context/StoreContext';
import { formatMoney, getConditionMeta, getRarityColor, ID_ALL, onCardImageError } from '../utils';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquareText, FolderOpen, CheckCircle2, Circle } from 'lucide-react';
import CardFoilOverlay from './CardFoilOverlay';
import CardWear from './CardWear';
import EditionHologram from './EditionHologram';
import VeloWanted from './VeloWanted';
import { ANCHO_IMAGEN_PEQUENA, ANCHO_SIN_EFECTOS, CARTAS_SIN_LAYOUT, imagenPequena, useMesa } from './mesaContexto';
import { LanguageFlag, nombreIdioma } from './LanguageFlag';
import { useCardName } from './useCardName';
import { usePrices } from '../context/PricesContext';
import { useCardPointer } from './useCardPointer';

interface Props {
  card: Card;
  onPress: (card: Card) => void;
  viewMode: ViewMode;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

/** Abreviaturas de rareza, como las que usan las tiendas (Cardmarket, TCGplayer). */
const ABREVIATURAS: Record<string, string> = {
  common: 'C',
  rare: 'R',
  'super rare': 'SR',
  'ultra rare': 'UR',
  'ultra rare (special)': 'URS',
  'ultra rare (extended art)': 'URX',
  'grand master rare': 'GMR',
  'secret rare': 'ScR',
  'ultimate rare': 'UtR',
  'ghost rare': 'GR',
  'starlight rare': 'StR',
  "collector's rare": 'CR',
  'prismatic secret rare': 'PScR',
  'platinum secret rare': 'PlScR',
  'quarter century secret rare': 'QCScR',
  'gold rare': 'GUR',
  'gold secret rare': 'GScR',
  'premium gold rare': 'PGR',
  'ultra secret rare': 'UScR',
  'starfoil rare': 'SFR',
  'mosaic rare': 'MSR',
  'shatterfoil rare': 'SHR',
  'short print': 'SP',
  'super short print': 'SSP',
};
/** Cuánto se amplía una carta de la vista mesa al pasar el ratón. */
const AMPLIACION_MESA = 1.75;

/**
 * En la vista mesa, la carta ampliada crece hacia dentro de la ventana: las de
 * los bordes se amplían desde ese borde, para no salirse ni quedar bajo la cabecera.
 */
function crecerHaciaDentro(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  const sobraX = (r.width * (AMPLIACION_MESA - 1)) / 2;
  const sobraY = (r.height * (AMPLIACION_MESA - 1)) / 2;
  const cabecera = 90;
  const x = r.left - sobraX < 8 ? '0%' : r.right + sobraX > window.innerWidth - 8 ? '100%' : '50%';
  const y = r.top - sobraY < cabecera ? '0%' : r.bottom + sobraY > window.innerHeight - 8 ? '100%' : '50%';
  e.currentTarget.style.transformOrigin = `${x} ${y}`;
}

/**
 * Nombre de la rareza para las fichas pequeñas: el completo, salvo los muy
 * largos, que se acortan sin perder lo que distingue ("Quarter Century",
 * "Platinum Secret", "DT Super Parallel").
 */
const RAREZAS_CORTAS: Record<string, string> = {
  'quarter century secret rare': 'Quarter Century',
  'platinum secret rare': 'Platinum Secret',
  'prismatic secret rare': 'Prismatic Secret',
  'ultra rare (special)': 'Ultra Rare Special',
  'ultra rare (extended art)': 'Ultra Rare Ext. Art',
  "ultra rare (pharaoh's rare)": "Pharaoh's Rare",
};
/** Reedición del 25 aniversario: se abrevia su rareza y se le añade "25th". */
const REEDICION_25 = / \(25th Anniversary Edition\)$/i;

function rarezaMedia(rareza: string): string {
  if (REEDICION_25.test(rareza)) return `${rarezaMedia(rareza.replace(REEDICION_25, ''))} 25th`;
  const r = (rareza || 'Common').trim();
  return RAREZAS_CORTAS[r.toLowerCase()] ?? r.replace(/^Duel Terminal /i, 'DT ');
}

function abreviarRareza(rareza: string, codigo?: string): string {
  if (REEDICION_25.test(rareza)) return `${abreviarRareza(rareza.replace(REEDICION_25, ''), codigo)}·25`;
  const r = (rareza || 'Common').toLowerCase().trim();
  if (ABREVIATURAS[r]) return ABREVIATURAS[r];
  const deCodigo = codigo?.replace(/[()]/g, '').trim();
  if (deCodigo) return deCodigo;
  // Iniciales: "Duel Terminal Super Parallel Rare" → "DTSPR".
  return (rareza.match(/\b[A-Za-z]/g) ?? ['?']).join('').toUpperCase();
}

/**
 * Etiquetas de la copia: edición (1.ª o Limited) y estado (NM, EX…).
 * En la franja de datos son chips con borde; `sobreCarta` las hace pastillas
 * oscuras y translúcidas para ir encima de la imagen, escaladas con la carta.
 */
function EtiquetasCopia({ card, edicion, estado, sobreCarta = false }: { card: Card; edicion: boolean; estado: boolean; sobreCarta?: boolean }) {
  const meta = getConditionMeta(card.condition);
  const base = sobreCarta
    ? 'rounded-full font-bold leading-none whitespace-nowrap backdrop-blur-sm bg-black/65 ring-1 ring-white/15 shadow'
    : 'rounded-full font-bold leading-none whitespace-nowrap border px-1.5 py-[3px] text-[10px]';
  const tam = sobreCarta ? { fontSize: '7.5cqw', padding: '1.6cqw 3.2cqw' } : undefined;
  return (
    <>
      {edicion && card.is1st && (
        <span
          className={`${base} ${sobreCarta ? 'text-amber-300' : 'text-amber-300 bg-amber-400/10 border-amber-400/40'}`}
          style={tam}
          title="1.ª edición"
        >
          1ª ED
        </span>
      )}
      {edicion && card.isLimited && (
        <span
          className={`${base} ${sobreCarta ? 'text-sky-300' : 'text-sky-300 bg-sky-400/10 border-sky-400/40'}`}
          style={tam}
          title="Edición limitada"
        >
          LTD
        </span>
      )}
      {estado && (
        <span
          className={base}
          style={sobreCarta ? { ...tam, color: meta.color } : { color: meta.color, borderColor: `${meta.color}66`, backgroundColor: `${meta.color}1a` }}
          title={`Estado: ${meta.label}`}
        >
          {meta.label}
        </span>
      )}
    </>
  );
}

export const CardItem: React.FC<Props> = React.memo(({ card, onPress, viewMode, isSelectionMode, isSelected, onToggleSelect }) => {
  const { state, dispatch, toast } = useStore();
  const { showFoils, showConditionFlags, showEditionFlags } = state.ui;
  const [hoverPos, setHoverPos] = useState<{ top: number, left: number } | null>(null);
  const [obsTooltipPos, setObsTooltipPos] = useState<{ left: number; top: number } | null>(null);
  
  const cardRef = useRef<HTMLDivElement>(null);
  /*
   * Inclinación y reflejo. Va en el contenedor y no en el overlay porque las
   * Common no pintan overlay y también deben inclinarse. Solo se monta una de
   * las cuatro vistas a la vez, así que un único ref vale para todas.
   */
  const contenedorRef = useCardPointer(!isSelectionMode);
  // Vista mesa con muchas cartas: cada una más ligera (ver mesaContexto).
  const mesa = useMesa();
  const [ampliada, setAmpliada] = useState(false);

  const rarityColor = getRarityColor(card.rarity);
  // Valor de mercado de ESTA impresión (set y rareza), en euros; null si no hay precio.
  // Nombre en el idioma de la copia (español si es ES) y, aparte, el otro.
  const { nombre, otro: otroNombre } = useCardName(card);
  const precioCopia = usePrices().priceOf(card);
  const valor = precioCopia?.eur ?? null;
  const fuenteValor = precioCopia?.fuente;
  const tituloValor = !precioCopia
    ? card.personalizado ? 'Sin precio: ponlo en su ficha' : 'Sin precio de mercado para esta versión'
    : fuenteValor === 'manual'
    ? 'Precio puesto a mano (artículo personalizado)'
    : `Precio de ${fuenteValor === 'tcgplayer' ? 'TCGplayer (no está en Cardmarket)' : 'Cardmarket'} de esta versión (${card.setCode} · ${card.rarity})` +
      (precioCopia.factor < 1
        ? `: ${formatMoney(precioCopia.mercado)} en NM, al ${Math.round(precioCopia.factor * 100)} % por estar en ${card.condition} (estimación)`
        : '');

  const folder = state.db.folders.find(f => f.id === card.folderId);
  const showFolderBadge = state.ui.activeFolderId === ID_ALL && folder && folder.id !== ID_ALL;
  const isManualSort = state.ui.sortCards === 'manual';

  /*
   * Reordenar arrastrando (solo con orden manual).
   *
   * Se usa `onDragStartCapture` y no `onDragStart` por los tipos: framer-motion
   * declara `onDragStart` con la firma de su propio sistema de gestos, que no
   * encaja con la del evento del DOM. En la práctica sí reenvía el evento
   * mientras no se use su prop `drag` (comprobado), pero engancharse en fase de
   * captura evita el conflicto sin recurrir a un cast.
   */
  const handleDragStart = (e: React.DragEvent) => {
    if (!isManualSort || isSelectionMode) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/card', card.uid);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isManualSort || isSelectionMode) return;
    e.preventDefault();
    e.currentTarget.classList.add('ring-2', 'ring-primary', 'z-30');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isManualSort || isSelectionMode) return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;

    e.currentTarget.classList.remove('ring-2', 'ring-primary', 'z-30');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('ring-2', 'ring-primary', 'z-30');
    
    if (!isManualSort || isSelectionMode) return;

    const draggedUid = e.dataTransfer.getData('text/card');
    if (!draggedUid || draggedUid === card.uid) return;

    const originalCards = [...state.db.cards];
    const srcIndex = originalCards.findIndex(c => c.uid === draggedUid);
    const tgtIndex = originalCards.findIndex(c => c.uid === card.uid);

    if (srcIndex > -1 && tgtIndex > -1) {
        const newCards = [...originalCards];
        [newCards[srcIndex], newCards[tgtIndex]] = [newCards[tgtIndex], newCards[srcIndex]];
        dispatch({ type: 'REORDER_CARDS', payload: newCards });
        toast("Cartas intercambiadas", "ok", () => {
            dispatch({ type: 'REORDER_CARDS', payload: originalCards });
        });
    }
  };

  const handleFolderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (folder) dispatch({ type: 'SET_ACTIVE_FOLDER', payload: folder.id });
  };
  
  const handleClick = () => {
      if (isSelectionMode && onToggleSelect) {
          onToggleSelect();
      } else {
          onPress(card);
      }
  };

  // --- Zoom Tooltip Logic ---
  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isSelectionMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const zoomHeight = 450;
    const windowHeight = window.innerHeight;
    const headerHeight = 80;
    
    let top = rect.top + (rect.height / 2) - (zoomHeight / 2);
    if (top < headerHeight) top = headerHeight;
    if (top + zoomHeight > windowHeight - 20) top = windowHeight - zoomHeight - 20;

    setHoverPos({ top: top, left: rect.right + 20 });
  };

  // Capa de selección (un elemento, no un componente: definir componentes dentro
  // del render hace que React los vuelva a montar en cada pintado).
  const selectionOverlay = (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`absolute inset-0 z-50 flex items-center justify-center transition-colors duration-200 ${isSelected ? 'bg-primary/20 backdrop-blur-[1px]' : 'bg-black/30 hover:bg-black/10'}`}
      >
          {isSelected ? (
              <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-primary bg-black/50 rounded-full p-2">
                  <CheckCircle2 size={48} fill="currentColor" className="text-black" />
              </motion.div>
          ) : (
              <Circle size={48} className="text-white/50" />
          )}
      </motion.div>
  );

  // --- VIEW MODE: DISPLAY (Pure Image Grid) ---
  if (viewMode === 'display') {
      return (
          <motion.div 
            layout={!mesa || mesa.cantidad < CARTAS_SIN_LAYOUT}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileHover={!isSelectionMode ? { scale: AMPLIACION_MESA, zIndex: 100, transition: { duration: 0.2 } } : {}}
            onMouseEnter={(e) => {
                crecerHaciaDentro(e);
                setAmpliada(true);
            }}
            onMouseLeave={() => setAmpliada(false)}
            onClick={handleClick}
            style={{ containerType: 'inline-size' }} // Critical for CQW units in WANTED overlay
            // Sin recortar: la carta ampliada tiene que verse entera (ver .mesa-carta en CardFoilOverlay.css).
            className={`group mesa-carta relative rounded-lg cursor-pointer shadow-md border w-full h-full ${
                isSelectionMode 
                ? (isSelected ? 'border-primary ring-2 ring-primary' : 'border-transparent opacity-80') 
                : 'border-transparent'
            }`}
          >
              <div ref={contenedorRef} className="card-container relative w-full h-full bg-[#111]">
                   {isSelectionMode && selectionOverlay}
                   
                   {/* La imagen y el foil se inclinan juntos; las insignias, no. */}
                   <div className="card-tilt">
                   <img 
                        // Pequeña, la imagen reducida (mucho menos que descargar con cientos de
                        // cartas); al ampliarla con el ratón, la grande.
                        src={mesa && mesa.ancho < ANCHO_IMAGEN_PEQUENA && !ampliada ? imagenPequena(card.img) : card.img}
                        onError={onCardImageError} 
                        className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out`}
                        loading="lazy"
                        decoding="async"
                        alt={nombre}
                   />
                {card.isWanted && <VeloWanted />}
                   
                   {/* Muy pequeñas, los brillos y el desgaste no se aprecian y pesan: solo en la carta ampliada. */}
                   {(!mesa || mesa.ancho >= ANCHO_SIN_EFECTOS || ampliada) && (
                     <>
                   {showFoils && !isSelectionMode && !card.isWanted && <CardFoilOverlay rarity={card.rarity} img={card.img} cardType={card.type} nameColor={card.nameColor} />}
                   {showFoils && !card.isWanted && !card.personalizado && <EditionHologram img={card.img} is1st={card.is1st} isLimited={card.isLimited} />}
                {showConditionFlags && !card.isWanted && <CardWear condition={card.condition} seed={card.uid} />}
                     </>
                   )}
                   </div>
                   
                   {card.isWanted && !isSelectionMode && (
                        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                            <h2 className="text-red-600 font-black tracking-widest border-[0.5cqw] border-red-600 px-[2cqw] py-[0.5cqw] -rotate-12 opacity-90 bg-black/40 backdrop-blur-[1px]" style={{ fontSize: '14cqw' }}>
                                WANTED
                            </h2>
                        </div>
                   )}
              </div>
          </motion.div>
      );
  }

  if (viewMode === 'album') {
    return (
        <motion.div 
            ref={cardRef}
            // Sin aparición propia: la hoja del álbum ya entra girando, y una carta que
            // se fundiera al pasar de la hoja que gira a la apoyada parpadearía.
            initial={false}
            className={`carta-funda group relative w-full h-full cursor-pointer transition-all duration-300 ${
                isSelectionMode 
                    ? (isSelected ? 'ring-2 ring-primary scale-95' : 'opacity-75 hover:opacity-100')
                    : ''
            }`}
            onClick={handleClick}
            style={{ containerType: 'inline-size' }} // Safer than 'size' to avoid height collapse
        >
            {/* SELECTION OVERLAY */}
            {isSelectionMode && selectionOverlay}

            {/* CARD IMAGE */}
            <div ref={contenedorRef} className="card-container w-full h-full bg-[#111] relative">
                 {/* La imagen y el foil se inclinan juntos; las insignias, no. */}
                 <div className="card-tilt">
                 <img 
                    src={card.img}
                        onError={onCardImageError} 
                    className={`w-full h-full object-cover transition-transform duration-500`}
                    loading="lazy"
                    alt={nombre}
                />
                {card.isWanted && <VeloWanted />}
                {showFoils && !isSelectionMode && !card.isWanted && <CardFoilOverlay rarity={card.rarity} img={card.img} cardType={card.type} nameColor={card.nameColor} />}
                   {showFoils && !card.isWanted && !card.personalizado && <EditionHologram img={card.img} is1st={card.is1st} isLimited={card.isLimited} />}
                {showConditionFlags && !card.isWanted && <CardWear condition={card.condition} seed={card.uid} />}

                {/*
                  Edición y estado: pastillas pequeñas DENTRO de la carta, para que
                  se levanten e inclinen con ella en vez de quedarse en la funda.
                */}
                {!isSelectionMode && !card.isWanted && (showEditionFlags || showConditionFlags) && (card.is1st || card.isLimited || showConditionFlags) && (
                    <div
                        className="absolute flex items-center pointer-events-none"
                        style={{ right: '4%', bottom: '2.5%', gap: '2.5cqw' }}
                    >
                        <EtiquetasCopia card={card} edicion={showEditionFlags} estado={showConditionFlags} sobreCarta />
                    </div>
                )}
                 </div>

                {/* WANTED Overlay */}
                {card.isWanted && !isSelectionMode && (
                    <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                         <h2 className="text-red-600 font-black tracking-widest border-[0.5cqw] border-red-600 px-[2cqw] py-[0.5cqw] -rotate-12 opacity-90 bg-black/40 backdrop-blur-[1px]" style={{ fontSize: '14cqw' }}>
                            WANTED
                         </h2>
                    </div>
                )}

            </div>

            {/* Minimal Info on Hover */}
            {!isSelectionMode && (
                <div className="absolute inset-0 flex items-end justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[45]" style={{ padding: '0 5% 5%' }}>
                     <div className="w-full bg-black/80 backdrop-blur-md p-[2cqw] text-center rounded-[3cqw] border border-white/10 shadow-lg">
                         <div className="text-white truncate px-1" style={{ fontSize: '9cqw', fontWeight: 700 }}>{nombre}</div>
                         {!card.isWanted && <div className="text-primary font-mono" style={{ fontSize: '8cqw' }} title={tituloValor}>{valor != null ? `${fuenteValor === 'manual' ? '✎ ' : '≈ '}${formatMoney(valor)}` : '—'}</div>}
                     </div>
                </div>
            )}
        </motion.div>
    );
  }

  if (viewMode === 'list') {
      return (
        <>
            <motion.div 
                ref={cardRef}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                draggable={isManualSort && !isSelectionMode}
                onDragStartCapture={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
                // LIST VIEW CONTAINER
                className={`group relative grid grid-cols-[64px_minmax(0,1fr)_auto_auto] md:grid-cols-[100px_2fr_3fr_1fr] gap-3 md:gap-6 p-3 md:p-4 bg-bg-surface rounded-xl cursor-pointer transition-all duration-300 items-center min-h-[104px] md:h-[140px] border ${
                    isSelectionMode 
                        ? (isSelected ? 'border-primary ring-1 ring-primary' : 'border-border-base opacity-80 hover:opacity-100 shadow-sm')
                        : 'border-border-base shadow-sm hover:border-primary/40 hover:bg-main/5 hover:shadow-[0_0_15px_rgba(var(--rgb-primary),0.1)] hover:z-10'
                }`}
            >
                {/* LIST VIEW SELECTION OVERLAY */}
                {isSelectionMode && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-50">
                        {isSelected ? <CheckCircle2 className="text-primary" size={24} fill="black" /> : <Circle className="text-muted" size={24} />}
                    </div>
                )}

                <div 
                    ref={contenedorRef}
                    className="card-container relative w-full md:w-auto md:h-full aspect-[421/614] mx-auto rounded-lg bg-zinc-900 overflow-hidden shadow-lg shrink-0 z-30"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={() => setHoverPos(null)}
                >
                    {/* La imagen y el foil se inclinan juntos; las insignias, no. */}
                    <div className="card-tilt">
                    <img 
                        src={card.img}
                        onError={onCardImageError} 
                        className={`absolute inset-0 w-full h-full object-cover ${isSelectionMode ? 'grayscale-[0.5]' : ''}`}
                        alt="" 
                        loading="lazy"
                        decoding="async"
                    />
                {card.isWanted && <VeloWanted />}
                    {showFoils && !isSelectionMode && !card.isWanted && <CardFoilOverlay rarity={card.rarity} img={card.img} cardType={card.type} nameColor={card.nameColor} />}
                   {showFoils && !card.isWanted && !card.personalizado && <EditionHologram img={card.img} is1st={card.is1st} isLimited={card.isLimited} />}
                {showConditionFlags && !card.isWanted && <CardWear condition={card.condition} seed={card.uid} />}
                    </div>
                    
                    {card.isWanted && !isSelectionMode && (
                         <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                            <h2 className="text-red-600 font-black tracking-widest border-2 border-red-600 px-1 -rotate-12 bg-black/40 text-[10px]">
                                WANTED
                            </h2>
                        </div>
                    )}
                </div>

                {/* INFO SECTION */}
                <div className={`flex flex-col gap-2 min-w-0 overflow-hidden z-30 pointer-events-none ${isSelectionMode ? 'pl-8' : ''}`}>
                    <div className="flex flex-col">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-bold text-base md:text-xl leading-tight truncate ${card.isWanted ? 'text-muted' : 'text-main'}`}>{nombre}</span>
                            {!card.isWanted && <EtiquetasCopia card={card} edicion={showEditionFlags} estado={false} />}
                            {showFolderBadge && (
                                <button className="flex items-center gap-1 text-[10px] bg-bg-panel text-muted px-2 py-0.5 rounded-full border border-border-base ml-2">
                                    <FolderOpen size={10} />
                                    {folder.name}
                                </button>
                            )}
                        </div>
                        {otroNombre && (
                            <span className="text-sm text-muted font-medium italic truncate">{otroNombre}</span>
                        )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        {card.tags.map(t => <span key={t} className="text-xs bg-main/5 px-2 py-0.5 rounded text-muted border border-border-base">{t}</span>)}
                    </div>

                    {!card.isWanted && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-sub mt-1">
                            <span style={{ color: rarityColor }} className="font-bold text-sm md:text-base drop-shadow-sm">{card.rarity}</span>
                            <span className="text-muted">•</span>
                            <span className="font-mono text-main font-medium">{card.personalizado ? 'Personalizado' : card.setCode}</span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2 min-w-0 border-l border-border-base pl-3 md:pl-4 h-full justify-center z-30 pointer-events-none">
                    {!card.isWanted && (
                        <div className="flex flex-wrap items-center gap-2 md:gap-4 text-sm">
                            <span className="flex items-center" title={nombreIdioma(card.lang)}><LanguageFlag lang={card.lang} size={16} /></span>
                            <EtiquetasCopia card={card} edicion={false} estado={showConditionFlags} />
                        </div>
                    )}
                    {card.obs && (
                        <div className="text-sm text-muted italic break-words leading-relaxed line-clamp-2">
                        📝 {card.obs}
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-end gap-1 h-full justify-center z-30 pointer-events-none">
                    {!card.isWanted && (
                        <div className="text-right" title={tituloValor}>
                            <div className="text-base md:text-xl font-black text-main tracking-tight whitespace-nowrap">
                                {valor != null ? `${fuenteValor === 'manual' ? '✎ ' : '≈ '}${formatMoney(valor)}` : <span className="text-muted">—</span>}
                            </div>
                        </div>
                    )}
                    {!isSelectionMode && <div className="hidden md:block text-muted opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full">✏️</div>}
                </div>
            </motion.div>
            
            {createPortal(
                <AnimatePresence>
                    {hoverPos && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, x: -10 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }}
                            className="fixed z-[9999] w-72 rounded-xl shadow-2xl border-4 border-bg-panel bg-black pointer-events-none overflow-hidden"
                            style={{ top: hoverPos.top, left: hoverPos.left }}
                        >
                            <img src={card.img}
                        onError={onCardImageError} className={`w-full h-auto object-contain bg-black ${card.isWanted ? 'grayscale' : ''}`} alt="Zoom" />
                            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                                <div className="text-xs text-white text-center font-medium">{nombre}</div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
      );
  }

  // GRID VIEW
  return (
    <>
        <motion.div 
        ref={cardRef}
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ 
            duration: 0.35, 
            ease: "easeOut",
            layout: { duration: 0.3 }
        }}
        draggable={isManualSort && !isSelectionMode}
        onDragStartCapture={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        style={{ containerType: 'inline-size' }}
        className={`ficha-carta group relative bg-bg-surface rounded-lg overflow-hidden hover:overflow-visible hover:z-[80] cursor-pointer shadow-lg flex flex-col transition-all duration-300 border ${
            isSelectionMode 
                ? (isSelected ? 'border-primary ring-2 ring-primary scale-95' : 'border-border-base opacity-75 hover:opacity-100')
                : 'border-border-base hover:shadow-[0_0_20px_rgba(var(--rgb-primary),0.15)] hover:border-primary/40'
        }`}
        >
            <div ref={contenedorRef} className="card-container relative w-full aspect-[421/614] bg-[#111] overflow-hidden shrink-0">
                {/* SELECTION OVERLAY */}
                {isSelectionMode && selectionOverlay}

                {/* La imagen y el foil se inclinan juntos; las insignias, no. */}
                <div className="card-tilt">
                <img 
                    src={card.img}
                        onError={onCardImageError} 
                    className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out`} 
                    loading="lazy" 
                    decoding="async"
                    alt={nombre} 
                />
                {card.isWanted && <VeloWanted />}

                {showFoils && !isSelectionMode && !card.isWanted && <CardFoilOverlay rarity={card.rarity} img={card.img} cardType={card.type} nameColor={card.nameColor} />}
                   {showFoils && !card.isWanted && !card.personalizado && <EditionHologram img={card.img} is1st={card.is1st} isLimited={card.isLimited} />}
                {showConditionFlags && !card.isWanted && <CardWear condition={card.condition} seed={card.uid} />}
                </div>
                
                {/* WANTED Overlay */}
                {card.isWanted && !isSelectionMode && (
                    <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                         <h2 className="text-red-600 font-black tracking-widest border-[0.5cqw] border-red-600 px-[2cqw] py-[0.5cqw] -rotate-12 opacity-90 bg-black/40 backdrop-blur-[1px]" style={{ fontSize: '14cqw' }}>
                            WANTED
                         </h2>
                    </div>
                )}

                {/*
                  La edición y el estado ya no van pegados a las esquinas de la imagen:
                  tapaban el nombre y, al levantarse la carta, se quedaban fuera de
                  sitio. Van como etiquetas en la franja de datos de abajo.
                */}
                {!isSelectionMode && !card.isWanted && <div className="absolute bottom-0 left-0 right-0 h-1 shadow-lg z-30" style={{ backgroundColor: rarityColor }} />}
            </div>

            <div className="p-3 flex flex-col justify-between gap-2 @max-[210px]:p-2 @max-[210px]:gap-1.5 bg-bg-surface relative z-30 flex-1 min-h-[80px] @max-[210px]:min-h-0">
                <div className="flex flex-col gap-1 @max-[210px]:gap-0.5">
                    <div className="flex justify-between items-start gap-1">
                        <div className={`font-bold text-sm leading-tight line-clamp-2 ${card.isWanted ? 'text-muted' : 'text-main'}`} title={otroNombre ? `${nombre} · ${otroNombre}` : nombre}>{nombre}</div>
                        {card.obs && !isSelectionMode && (
                            <div 
                                className="text-muted hover:text-primary transition-colors cursor-help shrink-0 pt-0.5"
                                onMouseEnter={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setObsTooltipPos({ left: rect.left + rect.width / 2, top: rect.top });
                                }}
                                onMouseLeave={() => setObsTooltipPos(null)}
                            >
                                <MessageSquareText size={16} />
                            </div>
                        )}
                    </div>
                    {otroNombre && (
                        <div className="text-[10px] text-muted italic truncate -mt-0.5">{otroNombre}</div>
                    )}
                    {showFolderBadge && !isSelectionMode && (
                         <div 
                            onClick={handleFolderClick}
                            className="self-start flex items-center gap-1 text-[10px] bg-bg-panel text-muted hover:text-main hover:bg-main/10 px-1.5 py-0.5 rounded border border-border-base transition-colors mt-0.5 max-w-full truncate"
                            title={`Ir a carpeta: ${folder.name}`}
                         >
                            <FolderOpen size={8} />
                            <span className="truncate">{folder.name}</span>
                         </div>
                    )}
                </div>

                {!card.isWanted && (
                    <div className="space-y-1 @max-[210px]:space-y-0.5 mt-auto">
                        {/*
                          Con la carta pequeña (la ficha mide menos de ~210 px) la rareza pasa a
                          su abreviatura y las etiquetas bajan de línea en vez de cortarse.
                        */}
                        {/*
                          Disposición FIJA según el ancho de la ficha (nada de "partir donde
                          quepa", que dejaba unas fichas en una línea y otras en dos):
                          - ancha: rareza completa y código en una línea;
                          - menos de 210 px: rareza abreviada y código más pequeño, en una línea.
                          El precio va siempre en su propia línea a la derecha en las pequeñas.
                        */}
                        <div className="flex items-center justify-between text-xs gap-2 @max-[210px]:gap-1">
                            {card.personalizado ? (
                                // Artículo personalizado: su tipo en lugar de la rareza.
                                <span className="font-bold truncate text-sky-300" title="Artículo personalizado">{card.type}</span>
                            ) : card.setCode === '---' ? (
                                <span className="text-muted italic truncate">Sin versión</span>
                            ) : (
                                <>
                                    <span style={{ color: rarityColor }} className="font-bold truncate flex-1 drop-shadow-sm @max-[210px]:hidden" title={card.rarity}>{card.rarity || 'Common'}</span>
                                    {/* Pequeña: el nombre (acortado si es muy largo); diminuta: la abreviatura. */}
                                    <span style={{ color: rarityColor }} className="font-bold drop-shadow-sm hidden @max-[210px]:inline @max-[130px]:hidden truncate min-w-0 flex-1 @max-[210px]:text-[11px]" title={card.rarity}>{rarezaMedia(card.rarity)}</span>
                                    <span style={{ color: rarityColor }} className="font-bold drop-shadow-sm hidden @max-[130px]:inline shrink-0" title={card.rarity}>{abreviarRareza(card.rarity, card.rarityCode)}</span>
                                </>
                            )}
                            <span className="text-muted whitespace-nowrap @max-[210px]:text-[10px] @max-[150px]:text-[9px]">{card.setCode !== '---' ? card.setCode : ''}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs gap-2 @max-[210px]:flex-col @max-[210px]:items-stretch @max-[210px]:gap-0.5">
                            <span className="text-muted flex items-center gap-1 min-w-0">
                                <span className="flex items-center" title={nombreIdioma(card.lang)}><LanguageFlag lang={card.lang} size={12} /></span>
                                {!isSelectionMode && <EtiquetasCopia card={card} edicion={showEditionFlags} estado={showConditionFlags} />}
                            </span>
                            <span className="font-black text-main whitespace-nowrap @max-[210px]:self-end" title={tituloValor}>
                                {valor != null ? `${fuenteValor === 'manual' ? '✎ ' : '≈ '}${formatMoney(valor)}` : <span className="text-muted font-bold">—</span>}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
        
        {createPortal(
            <AnimatePresence>
                {obsTooltipPos && !isSelectionMode && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, x: "-50%", y: "-110%" }}
                        animate={{ opacity: 1, scale: 1, x: "-50%", y: "-100%" }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }}
                        className="fixed z-[9999] max-w-[200px] w-auto bg-bg-panel border border-border-base p-3 rounded-lg shadow-2xl pointer-events-none"
                        style={{ 
                            left: obsTooltipPos.left, 
                            top: obsTooltipPos.top - 8
                        }}
                    >
                        <div className="text-xs text-main leading-relaxed relative text-center">
                            {card.obs}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-bg-panel translate-y-[0px]" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>,
            document.body
        )}
    </>
  );
});