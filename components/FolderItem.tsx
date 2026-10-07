import React from 'react';
import type { Folder, ViewMode } from '../types';
import { useStore } from '../context/StoreContext';
import { formatMoney, ID_ALL, CARD_BACK_IMG } from '../utils';
import { Settings, CheckCircle2, Circle } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePrices } from '../context/PricesContext';

interface Props {
  folder: Folder;
  onEdit: (id: string) => void;
  viewMode: ViewMode;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const FolderItem: React.FC<Props> = React.memo(({ folder, onEdit, viewMode, isSelectionMode, isSelected, onToggleSelect }) => {
  const { state, dispatch, toast } = useStore();
  
  const isSystem = folder.id === ID_ALL;
  const isManualSort = state.ui.sortFolders === 'manual';

  const cards = state.db.cards.filter(c => isSystem ? true : c.folderId === folder.id);
  /*
   * Valor de mercado de las cartas con precio; las que no tienen precio se
   * dicen en la ayuda.
   */
  const resumen = usePrices().summarize(cards);
  const textoValor = resumen.priced > 0 ? `≈ ${formatMoney(resumen.eur)}` : '—';
  const ayudaValor =
    resumen.priced > 0
      ? `Valor de mercado aproximado de ${resumen.priced} cartas` +
        (resumen.unpriced ? ` (${resumen.unpriced} sin precio)` : '')
      : 'Todavía no hay precios para estas cartas';

  const handleClick = () => {
      if (isSelectionMode) {
          if (!isSystem && onToggleSelect) onToggleSelect();
      } else {
          dispatch({ type: 'SET_ACTIVE_FOLDER', payload: folder.id });
      }
  };

  // Fase de captura para esquivar el choque de tipos con framer-motion.
  // Ver la nota más larga en CardItem.
  const handleDragStart = (e: React.DragEvent) => {
    if (isSystem || !isManualSort || isSelectionMode) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', folder.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isSystem || !isManualSort || isSelectionMode) return;
    e.preventDefault();
    e.currentTarget.classList.add('ring-2', 'ring-primary');
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    if (isSystem || !isManualSort || isSelectionMode) return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    e.currentTarget.classList.remove('ring-2', 'ring-primary');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (isSystem || !isManualSort || isSelectionMode) return;

    e.currentTarget.classList.remove('ring-2', 'ring-primary');
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === folder.id) return;

    const originalFolders = [...state.db.folders];
    const srcIndex = originalFolders.findIndex(f => f.id === draggedId);
    const tgtIndex = originalFolders.findIndex(f => f.id === folder.id);
    
    if (srcIndex > -1 && tgtIndex > -1) {
        const newFolders = [...originalFolders];
        [newFolders[srcIndex], newFolders[tgtIndex]] = [newFolders[tgtIndex], newFolders[srcIndex]];
        dispatch({ type: 'REORDER_FOLDERS', payload: newFolders });

        toast("Carpetas reordenadas", "ok", () => {
             dispatch({ type: 'REORDER_FOLDERS', payload: originalFolders });
        });
    }
  };

  const SelectionOverlay = () => {
      if (!isSelectionMode) return null;
      
      if (isSystem) {
          return (
              <div className="absolute inset-0 z-50 bg-black/50 cursor-not-allowed flex items-center justify-center">
              </div>
          );
      }

      return (
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
  };

  if (viewMode === 'list') {
      return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            draggable={!isSystem && isManualSort && !isSelectionMode}
            onDragStartCapture={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            // LIST CONTAINER: Semantic colors + Border
            className={`flex items-center gap-4 p-3 bg-bg-surface rounded-lg cursor-pointer transition-all duration-300 group h-[80px] relative overflow-hidden border ${
                isSystem 
                ? 'border-primary/50 bg-primary/5 cursor-default hover:shadow-[0_0_15px_rgba(var(--rgb-primary),0.15)]' 
                : (isSelectionMode && isSelected 
                    ? 'border-primary ring-1 ring-primary' 
                    : 'border-border-base shadow-sm hover:border-primary/40 hover:bg-main/5 hover:shadow-[0_0_15px_rgba(var(--rgb-primary),0.08)]')
            }`}
        >
            {isSelectionMode && !isSystem && (
                <div className="absolute left-4 z-50">
                     {isSelected ? <CheckCircle2 className="text-primary" size={24} fill="black" /> : <Circle className="text-muted" size={24} />}
                </div>
            )}
            
            <div className={`relative w-16 h-full shrink-0 ${isSelectionMode && !isSystem ? 'ml-8' : ''}`}>
                <img 
                    src={folder.img || CARD_BACK_IMG} 
                    className={`absolute inset-0 w-full h-full object-cover rounded ${isSelectionMode && isSystem ? 'opacity-50' : ''}`} 
                    style={{ objectPosition: folder.align }} 
                    alt=""
                    loading="lazy" 
                />
            </div>
            
            <div className="flex-1 min-w-0">
                {/* TITLE: text-main */}
                <div className="font-bold text-main flex items-center gap-2 truncate">
                    {isSystem && <span className="text-primary">★</span>}
                    {folder.name}
                </div>
                {/* SUBTEXT: text-muted */}
                {folder.subtext && <div className="text-xs text-muted mt-0.5 truncate">{folder.subtext}</div>}
            </div>
            {/* ITEMS: text-muted */}
            <div className="text-sm text-muted whitespace-nowrap">{cards.length} items</div>
            {/* PRICE: text-primary */}
            <div className="text-sm font-bold text-primary w-24 text-right whitespace-nowrap" title={ayudaValor}>{textoValor}</div>
            
            {!isSelectionMode && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(folder.id); }}
                    className="p-2 text-muted hover:text-main hover:bg-main/10 rounded transition-colors"
                >
                    <Settings size={16} />
                </button>
            )}
        </motion.div>
      );
  }

  // GRID VIEW
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      draggable={!isSystem && isManualSort && !isSelectionMode}
      onDragStartCapture={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      whileHover={isSelectionMode ? {} : { y: -5, transition: { duration: 0.2 } }}
      style={{ containerType: 'inline-size' }}
      // GRID CONTAINER: bg-bg-surface, border-border-base
      className={`relative bg-bg-surface border rounded-xl overflow-hidden group cursor-pointer shadow-lg flex flex-col h-full transition-all duration-300 ${
          isSystem 
          ? 'border-primary shadow-[0_0_15px_rgba(var(--rgb-primary),0.15)] cursor-default' 
          : (isSelectionMode && isSelected
              ? 'border-primary ring-2 ring-primary scale-95'
              : 'border-border-base hover:border-primary/40 hover:shadow-[0_0_20px_rgba(var(--rgb-primary),0.15)]')
      }`}
    >
        <div className="relative w-full aspect-[3/2] overflow-hidden bg-black shrink-0">
            <SelectionOverlay />

            <img 
                src={folder.img || CARD_BACK_IMG} 
                className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out ${isSelectionMode ? (isSystem ? 'opacity-50' : '') : 'group-hover:scale-105'}`} 
                style={{ objectPosition: folder.align }}
                alt={folder.name}
                loading="lazy"
                decoding="async"
            />
            {/* GRADIENT: uses bg-surface to blend with the bottom section smoothly */}
            <div className={`absolute inset-0 bg-gradient-to-t from-bg-surface via-transparent to-transparent opacity-90 ${isSelectionMode && isSystem ? 'opacity-90' : ''}`} />
            
            <div 
                className="absolute top-[3%] left-[3%] bg-black/60 backdrop-blur-sm rounded-md border border-white/10 flex items-center justify-center font-medium text-white"
                style={{ 
                    fontSize: '6cqw', 
                    padding: '1.5cqw 2.5cqw'
                }}
            >
                📁 {cards.length}
            </div>
        </div>

        <div className="p-3 relative flex flex-col gap-1 bg-bg-surface flex-1 min-h-[80px]">
             <div className="flex justify-between items-start">
                 <div className="pr-6 w-full">
                    {/* TITLE: text-main */}
                    <h3 className="font-bold text-base text-main leading-tight truncate w-full">
                        {isSystem && <span className="text-primary mr-1">★</span>}
                        {folder.name}
                    </h3>
                    {/* SUBTEXT: text-muted */}
                    {folder.subtext && <div className="text-xs text-muted mt-1 truncate">{folder.subtext}</div>}
                 </div>
             </div>
             
             {/* En fichas estrechas el importe no se parte: se oculta la etiqueta y se achica un poco. */}
             <div className="mt-auto pt-2 flex justify-between items-end gap-2 border-t border-border-base">
                <span className="text-xs text-muted font-medium @max-[190px]:hidden">Valor</span>
                {/* VALUE: text-primary */}
                <span className="text-primary font-bold text-sm whitespace-nowrap ml-auto @max-[150px]:text-xs" title={ayudaValor}>{textoValor}</span>
             </div>
        </div>

        {!isSelectionMode && (
            <button 
                onClick={(e) => { e.stopPropagation(); onEdit(folder.id); }}
                className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black text-static-white rounded-lg backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 border border-white/10"
            >
                <Settings size={14} />
            </button>
        )}
    </motion.div>
  );
});