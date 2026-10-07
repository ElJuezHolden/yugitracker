import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { NAME_MODES, setNameMode, useNameMode } from './useCardName';
import { ID_ALL, CARD_BACK_IMG } from '../utils';
import { useBackup } from '../context/BackupContext';
import { Search, ChevronLeft, Shield, ShieldCheck, Grid, List, Hash, ArrowUp, ArrowDown, Palette, Trash, Filter, BookOpen, Sparkles, Stamp, Award, Target, Monitor, TrendingUp, Languages } from 'lucide-react';
import { TagsPanel } from './TagsPanel';
import { motion, AnimatePresence } from 'framer-motion';
import type { FolderSort, CardSort } from '../types';

interface Props {
  onOpenFolderModal: () => void;
  onOpenSearchModal: () => void;
  onOpenBackupModal: () => void;
  onOpenPriceMoves: () => void;
  onOpenThemeModal: () => void;
  isSelectionMode: boolean;
  onToggleSelectionMode: () => void;
  // Filter Props
  onToggleFilter: () => void;
  isFilterOpen: boolean;
  activeFilterCount: number;
}

export const Header: React.FC<Props> = ({ 
    onOpenFolderModal, 
    onOpenSearchModal, 
    onOpenBackupModal,
    onOpenPriceMoves,
    onOpenThemeModal, 
    isSelectionMode, 
    onToggleSelectionMode,
    onToggleFilter,
    isFilterOpen,
    activeFilterCount
}) => {
  const { state, dispatch } = useStore();
  const modoNombres = useNameMode();
  const backup = useBackup();
  const { view, activeFolderId, gridSize, searchQuery, sortFolders, sortFoldersDir, sortCards, sortCardsDir, isTagsPanelOpen, showFoils, showConditionFlags, showEditionFlags, wantedMode } = state.ui;
  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  // Ref for the slider container to attach non-passive wheel listener
  const sliderRef = useRef<HTMLDivElement>(null);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local state for smooth slider
  const [localGridSize, setLocalGridSize] = useState(gridSize);

  // Sync local state when global state changes (e.g. initial load)
  useEffect(() => {
    setLocalGridSize(gridSize);
    document.documentElement.style.setProperty('--grid-size', `${gridSize}px`);
  }, [gridSize]);

  // Handle Wheel Scroll on Slider
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const dynamicStep = Math.max(5, Math.floor(localGridSize * 0.05));
        const finalDelta = e.deltaY > 0 ? -dynamicStep : dynamicStep;

        setLocalGridSize(prev => {
            const next = Math.min(460, Math.max(120, prev + finalDelta));
            document.documentElement.style.setProperty('--grid-size', `${next}px`);
            
            if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
            commitTimeoutRef.current = setTimeout(() => {
                dispatch({ type: 'SET_GRID_SIZE', payload: next });
            }, 600);

            return next;
        });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
        el.removeEventListener('wheel', handleWheel);
        if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
    };
  }, [dispatch, localGridSize]);

  const handleGoHome = () => dispatch({ type: 'SET_ACTIVE_FOLDER', payload: null });
  
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (activeFolderId === null && val.trim().startsWith('#')) {
        dispatch({ type: 'SET_ACTIVE_FOLDER', payload: ID_ALL });
    }
    dispatch({ type: 'SET_SEARCH_QUERY', payload: val });
  };

  const handleGridResize = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      setLocalGridSize(val);
      document.documentElement.style.setProperty('--grid-size', `${val}px`);
  };

  const handleGridResizeCommit = () => {
      dispatch({ type: 'SET_GRID_SIZE', payload: localGridSize });
  };
  
  const isFolderView = activeFolderId !== null;
  const currentFolder = isFolderView 
    ? state.db.folders.find(f => f.id === activeFolderId)
    : null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isTagsPanelOpen &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        dispatch({ type: 'TOGGLE_TAGS_PANEL' });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTagsPanelOpen, dispatch]);

  // Crear carpeta en la portada, añadir carta dentro de una: en el móvil va arriba, a mano.
  const botonPrincipal = !isFolderView ? (
    <button
      onClick={onOpenFolderModal}
      className="bg-primary text-black font-bold text-sm px-3 py-1.5 rounded-lg hover:brightness-110 active:scale-95 transition-all whitespace-nowrap"
    >
      + Carpeta
    </button>
  ) : (
    <button
      onClick={onOpenSearchModal}
      className="bg-primary text-black font-bold text-sm px-3 py-1.5 rounded-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-1 whitespace-nowrap"
    >
      <Search size={14} /> Añadir
    </button>
  );

  return (
    /*
      En el móvil, dos filas (ver --alto-cabecera en index.css): arriba la carpeta y
      el botón principal; abajo el buscador y una tira de botones que se desliza con
      el dedo. Antes todo iba en una fila que se salía por la derecha y había
      opciones (orden, brillos, WANTED…) que en el móvil ni aparecían.
    */
    <header className="fixed top-0 left-0 right-0 h-[var(--alto-cabecera)] bg-bg-body/95 backdrop-blur-md shadow-sm z-[100] flex flex-wrap md:flex-nowrap items-center content-center justify-between gap-y-2 px-4 sm:px-6 transition-colors duration-500">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 md:flex-none md:max-w-[60%] overflow-hidden">
        {isFolderView && (
          <button onClick={handleGoHome} className="p-2 hover:bg-main/10 rounded-lg text-main/60 hover:text-main transition-colors shrink-0">
            <ChevronLeft size={20} />
          </button>
        )}
        
        {/* LOGO WITH FOIL EFFECT */}
        <div 
          onClick={handleGoHome}
          className="cursor-pointer group relative overflow-hidden select-none shrink-0 flex items-center gap-2 px-2 py-1 rounded-lg"
        >
            <div className="absolute inset-0 -translate-x-[150%] group-hover:translate-x-[150%] bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-[-25deg] transition-transform duration-1000 ease-in-out z-10 pointer-events-none" />

            <h1 className="text-lg font-bold tracking-tight hidden sm:block relative z-0 text-main transition-all duration-500 group-hover:text-white group-hover:drop-shadow-[0_0_12px_rgba(var(--rgb-primary),0.6)]">
                Yugi-Tracker <span className="text-primary transition-all duration-500 group-hover:brightness-125">Platinum</span>
            </h1>

            <h1 className="text-lg font-bold tracking-tight sm:hidden relative z-0 transition-transform duration-300 group-hover:scale-105">
                <span className="text-primary group-hover:drop-shadow-[0_0_8px_rgba(var(--rgb-primary),0.8)]">YT</span>
            </h1>
        </div>

        <AnimatePresence>
            {isFolderView && (
                <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="flex items-center gap-3 overflow-hidden"
                >
                    <span className="text-main/50 text-lg font-light shrink-0">/</span>
                    
                    {currentFolder && (
                         <img 
                            src={currentFolder.img || CARD_BACK_IMG} 
                            className="w-8 h-8 rounded-md object-cover shadow-sm shrink-0" 
                            style={{ objectPosition: currentFolder.align }}
                            alt=""
                        />
                    )}

                    <h1 className="text-lg font-bold tracking-tight truncate text-main">
                        {currentFolder?.name || 'Carpeta'}
                    </h1>
                </motion.div>
            )}
        </AnimatePresence>
      </div>

      <div className="md:hidden shrink-0 pl-2">{botonPrincipal}</div>

      <div className="flex items-center gap-2 sm:gap-4 w-full md:w-auto md:flex-1 justify-end min-w-0">
        <div className="relative group w-[42%] shrink-0 md:w-auto" ref={searchContainerRef}>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-main/50 group-focus-within:text-primary transition-colors">
                <Search size={16} />
            </div>
            <input 
                type="text" 
                value={searchQuery}
                onChange={handleSearch}
                placeholder="Buscar..."
                className="bg-bg-surface border-none text-main rounded-full pl-9 pr-8 py-1.5 w-full md:w-[240px] md:focus:w-[320px] transition-all duration-300 ease-out focus:outline-none focus:ring-1 focus:ring-primary text-sm placeholder:text-main/30"
            />
            <button 
                onClick={() => dispatch({ type: 'TOGGLE_TAGS_PANEL' })}
                className={`absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-main/10 transition-colors ${isTagsPanelOpen ? 'text-primary' : 'text-main/50'}`}
            >
                <Hash size={14} />
            </button>
            <TagsPanel />
        </div>

        <div className="tira-movil flex items-center gap-2 md:gap-3 min-w-0 flex-1 md:flex-none overflow-x-auto md:overflow-visible [&>*]:shrink-0">
            {view === 'grid' && (
                <div 
                    ref={sliderRef}
                    className="relative hidden md:flex items-center bg-bg-surface px-3 py-1 rounded-full border-none h-[34px] transition-colors"
                    title="Scroll para ajustar tamaño"
                >
                    <input 
                        type="range" 
                        min="120" max="460" 
                        value={localGridSize} 
                        onChange={handleGridResize}
                        onMouseUp={handleGridResizeCommit}
                        onTouchEnd={handleGridResizeCommit}
                        className="w-20 accent-primary h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            )}

            <div className="flex items-center gap-1 bg-bg-surface p-1 rounded-lg">
                <button 
                    onClick={() => dispatch({ type: 'TOGGLE_WANTED_CARDS' })}
                    className={`p-1.5 rounded transition-colors ${
                        wantedMode === 'solo' ? 'text-red-400 bg-red-500/15' : wantedMode === 'todas' ? 'text-primary hover:text-primary/80' : 'text-main/60 hover:text-main'
                    }`}
                    title={
                        wantedMode === 'todas' ? 'Buscadas (WANTED): se ven todas. Clic: ver solo las buscadas'
                        : wantedMode === 'solo' ? 'Viendo solo las buscadas (WANTED). Clic: ocultarlas'
                        : 'Buscadas (WANTED) ocultas. Clic: verlas todas'
                    }
                    aria-label="Cartas buscadas (WANTED)"
                >
                    <Target size={16} className={wantedMode !== 'ocultar' ? (wantedMode === 'solo' ? 'fill-red-400' : 'fill-primary') : ''} />
                </button>
                <button 
                    onClick={() => dispatch({ type: 'TOGGLE_EDITION_FLAGS' })}
                    className={`p-1.5 rounded transition-colors ${showEditionFlags ? 'text-primary hover:text-primary/80' : 'text-main/60 hover:text-main'}`}
                    title={showEditionFlags ? "Ocultar Edición" : "Mostrar Edición"}
                >
                    <Award size={16} fill={showEditionFlags ? 'currentColor' : 'none'} />
                </button>
                <button 
                    onClick={() => dispatch({ type: 'TOGGLE_CONDITION_FLAGS' })}
                    className={`p-1.5 rounded transition-colors ${showConditionFlags ? 'text-primary hover:text-primary/80' : 'text-main/60 hover:text-main'}`}
                    title={showConditionFlags ? "Ocultar estados y desgaste" : "Mostrar estados y desgaste"}
                >
                    <Stamp size={16} fill={showConditionFlags ? 'currentColor' : 'none'} />
                </button>
                <button 
                    onClick={() => dispatch({ type: 'TOGGLE_FOILS' })}
                    className={`p-1.5 rounded transition-colors ${showFoils ? 'text-primary hover:text-primary/80' : 'text-main/60 hover:text-main'}`}
                    title={showFoils ? "Desactivar Brillos" : "Activar Brillos"}
                >
                    <Sparkles size={16} fill={showFoils ? 'currentColor' : 'none'} />
                </button>
                <button onClick={onOpenThemeModal} className="p-1.5 hover:text-main text-main/60 hover:bg-main/10 rounded transition-colors" title="Personalizar Tema">
                    <Palette size={16} />
                </button>
            </div>

            {/* Idioma de los nombres: según cada copia, todo en español o todo en inglés */}
            <button
                onClick={() => {
                    const i = NAME_MODES.findIndex(m => m.id === modoNombres);
                    setNameMode(NAME_MODES[(i + 1) % NAME_MODES.length]!.id);
                }}
                className="flex items-center gap-1 px-2 py-2 bg-bg-surface rounded-lg text-main/60 hover:text-main hover:bg-main/10 transition-colors"
                title={`Nombres: ${NAME_MODES.find(m => m.id === modoNombres)!.etiqueta}. Pulsa para cambiar.`}
                aria-label="Idioma de los nombres de las cartas"
            >
                <Languages size={16} />
                <span className="text-[11px] font-bold w-7 text-left">{NAME_MODES.find(m => m.id === modoNombres)!.corto}</span>
            </button>

            {/* Subidas y bajadas de precio de la colección */}
            <button
                onClick={onOpenPriceMoves}
                className="p-2 bg-bg-surface rounded-lg text-main/60 hover:text-main hover:bg-main/10 transition-colors"
                title="Subidas y bajadas de precio"
                aria-label="Subidas y bajadas de precio"
            >
                <TrendingUp size={16} />
            </button>

            {/*
              Copias de seguridad. Fuera del grupo de iconos que se oculta en el
              móvil: antes exportar e importar no existían en pantallas pequeñas.
              El punto avisa del estado sin tener que abrir el panel.
            */}
            <button
                onClick={onOpenBackupModal}
                className="relative p-2 bg-bg-surface rounded-lg text-main/60 hover:text-main hover:bg-main/10 transition-colors"
                title={
                    backup.fileState === 'active' ? 'Copias de seguridad: guardando también en tu archivo'
                    : backup.fileState === 'needs-permission' || backup.fileState === 'error' ? 'Copias de seguridad: la copia en archivo está en pausa'
                    : 'Copias de seguridad'
                }
                aria-label="Copias de seguridad"
            >
                {backup.fileState === 'active' ? <ShieldCheck size={16} /> : <Shield size={16} />}
                {backup.fileState === 'active' && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-bg-surface" />
                )}
                {(backup.fileState === 'needs-permission' || backup.fileState === 'error') && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-bg-surface animate-pulse" />
                )}
            </button>

            <div className="flex items-center gap-1 bg-bg-surface p-1 rounded-lg">
                <button 
                    onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'grid' })}
                    className={`p-1.5 rounded transition-colors ${view === 'grid' ? 'bg-primary text-black' : 'text-main/60 hover:text-main'}`}
                    title="Vista Cuadrícula"
                >
                    <Grid size={16} />
                </button>
                <button 
                    onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'list' })}
                    className={`p-1.5 rounded transition-colors ${view === 'list' ? 'bg-primary text-black' : 'text-main/60 hover:text-main'}`}
                    title="Vista Lista"
                >
                    <List size={16} />
                </button>
                {/* ALBUM BUTTON: Only show if inside a folder */}
                {isFolderView && (
                    <>
                        <button 
                            onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'display' })}
                            className={`p-1.5 rounded transition-colors ${view === 'display' ? 'bg-primary text-black' : 'text-main/60 hover:text-main'}`}
                            title="Vista Display (Sin datos)"
                        >
                            <Monitor size={16} />
                        </button>
                        <button 
                            onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'album' })}
                            className={`p-1.5 rounded transition-colors ${view === 'album' ? 'bg-primary text-black' : 'text-main/60 hover:text-main'}`}
                            title="Modo Álbum"
                        >
                            <BookOpen size={16} />
                        </button>
                    </>
                )}
            </div>

            {!isFolderView ? (
                <div className="flex gap-2 [&>*]:shrink-0">
                    <button
                        onClick={onToggleSelectionMode}
                        className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${isSelectionMode ? 'bg-red-500/20 text-red-500' : 'bg-bg-surface text-main/60 hover:text-red-500 hover:bg-red-500/10'}`}
                        title={isSelectionMode ? "Salir de modo eliminación" : "Eliminar carpetas"}
                    >
                        <Trash size={16} />
                    </button>

                    <div className="flex items-center gap-1 bg-bg-surface rounded-lg p-0.5">
                        <select 
                            className="bg-transparent text-main text-sm px-2 py-1.5 border-none focus:ring-0 cursor-pointer hover:text-primary transition-colors outline-none"
                            value={sortFolders}
                            onChange={(e) => dispatch({ type: 'SET_FOLDER_SORT', payload: e.target.value as FolderSort })}
                        >
                            <option value="manual" className="bg-bg-panel text-main">✋ Manual</option>
                            <option value="name" className="bg-bg-panel text-main">Aa Nombre</option>
                            <option value="value" className="bg-bg-panel text-main">💰 Valor</option>
                        </select>
                        {sortFolders !== 'manual' && (
                            <button 
                                onClick={() => dispatch({ type: 'SET_FOLDER_SORT_DIR', payload: sortFoldersDir === 'asc' ? 'desc' : 'asc' })}
                                className="p-1 text-main/60 hover:text-primary hover:bg-main/10 rounded transition-colors"
                            >
                                {sortFoldersDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                            </button>
                        )}
                    </div>
                    
                    <div className="hidden md:block">{botonPrincipal}</div>
                </div>
            ) : (
                <div className="flex gap-2 [&>*]:shrink-0">
                    <button
                        onClick={onToggleFilter}
                        className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 relative group ${
                            isFilterOpen || activeFilterCount > 0 
                                ? 'bg-primary text-black hover:bg-primary/90' 
                                : 'bg-bg-surface text-main/60 hover:text-main hover:bg-main/10'
                        }`}
                        title="Filtrar cartas"
                    >
                        <Filter size={16} />
                        {activeFilterCount > 0 && (
                            <span className={`text-[10px] font-bold px-1 rounded-full ${isFilterOpen ? 'bg-black text-primary' : 'bg-primary text-black'}`}>
                                {activeFilterCount}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={onToggleSelectionMode}
                        className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${isSelectionMode ? 'bg-red-500/20 text-red-500' : 'bg-bg-surface text-main/60 hover:text-red-500 hover:bg-red-500/10'}`}
                        title={isSelectionMode ? "Salir de modo eliminación" : "Eliminar cartas"}
                    >
                        <Trash size={16} />
                    </button>

                    <div className="flex items-center gap-1 bg-bg-surface rounded-lg p-0.5">
                        <select 
                            className="bg-transparent text-main text-sm px-2 py-1.5 border-none focus:ring-0 cursor-pointer hover:text-primary transition-colors outline-none"
                            value={sortCards}
                            onChange={(e) => dispatch({ type: 'SET_CARD_SORT', payload: e.target.value as CardSort })}
                        >
                            <option value="manual" className="bg-bg-panel text-main">✋ Manual</option>
                            <option value="type" className="bg-bg-panel text-main">⚔️ Tipo</option>
                            <option value="level" className="bg-bg-panel text-main">⭐ Tipo y nivel</option>
                            <option value="rarity" className="bg-bg-panel text-main">💎 Rareza</option>
                            <option value="name" className="bg-bg-panel text-main">Aa Nombre</option>
                            <option value="price" className="bg-bg-panel text-main">💰 Precio</option>
                            <option value="set" className="bg-bg-panel text-main"># Nº de set</option>
                        </select>
                        {sortCards !== 'manual' && (
                            <button 
                                onClick={() => dispatch({ type: 'SET_CARD_SORT_DIR', payload: sortCardsDir === 'asc' ? 'desc' : 'asc' })}
                                className="p-1 text-main/60 hover:text-primary hover:bg-main/10 rounded transition-colors"
                            >
                                {sortCardsDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                            </button>
                        )}
                    </div>
                    
                    <div className="hidden md:block">{botonPrincipal}</div>
                </div>
            )}
        </div>
      </div>
    </header>
  );
};