import { useState, useMemo, useCallback, useEffect } from 'react';
import { useStore } from './context/StoreContext';
import { Header } from './components/Header';
import { FolderItem } from './components/FolderItem';
import { CardItem } from './components/CardItem';
import { AlbumView } from './components/AlbumView'; // Import AlbumView
import { FolderModal } from './components/Modals/FolderModal';
import { SearchModal } from './components/Modals/SearchModal';
import { CardModal } from './components/Modals/CardModal';
import { PersonalizadoModal } from './components/Modals/PersonalizadoModal';
import { HojasBuscadasModal } from './components/Modals/HojasBuscadasModal';
import { ThemeModal } from './components/Modals/ThemeModal';
import { BackupModal } from './components/Modals/BackupModal';
import { PriceMovesModal } from './components/Modals/PriceMovesModal';
import { useBackup } from './context/BackupContext';
import { FoilFilters } from './components/FoilFilters';
import { CollectionValue } from './components/CollectionValue';
import { useRarityCheck } from './components/useRarityCheck';
import { useCardLevels } from './components/useCardLevels';
import { useProvisionalIds } from './components/useProvisionalIds';
import { useShuffleAnimation } from './components/useShuffleAnimation';
import { DisplayTable } from './components/DisplayTable';
import { usePrices } from './context/PricesContext';
import { displayName, useNameMode, useSpanishNames } from './components/useCardName';
import { compararCartas } from './components/ordenCartas';
import { CardFilter } from './components/CardFilter';
import { ToastContainer } from './components/Toast';
import { ID_ALL, getRarityWeight, normalizeStr, analyzeCardType, compareNames } from './utils';
import type { Card, ApiCard, Folder, MainCardType, MonsterType, CardProperty } from './types';
import { AnimatePresence, motion } from 'framer-motion';
import { Trash, X } from 'lucide-react';

// Helper to extract set prefix (e.g. "LOB-EN001" -> "LOB")
const getSetPrefix = (code: string) => {
    if (!code || code === '---') return 'N/A';
    return code.split('-')[0];
};

function App() {
  const { state, dispatch, toast } = useStore();
  const backup = useBackup();
  const { valueOf } = usePrices();
  // Nombres en español: la búsqueda y el orden por nombre usan el nombre que se ve.
  const nombresEs = useSpanishNames();
  // Corrige las rarezas guardadas que no existen (YGOPRODeck tiene algunas de más).
  useRarityCheck();
  // Completa el nivel de los monstruos guardados antes de que se apuntara.
  useCardLevels();
  useProvisionalIds();
  const modoNombres = useNameMode();
  const { activeFolderId, view, gridSize, searchQuery, sortFolders, sortFoldersDir, sortCards, sortCardsDir, wantedMode } = state.ui;

  // Modals State
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  /** Artículo personalizado abierto: `null` para uno nuevo, `undefined` cerrado. */
  const [personalizado, setPersonalizado] = useState<Card | null | undefined>(undefined);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isPriceMovesOpen, setIsPriceMovesOpen] = useState(false);
  const [hojasBuscadas, setHojasBuscadas] = useState(false);
  
  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Filter State
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<{
      cardTypes: MainCardType[];
      monsterTypes: MonsterType[];
      properties: CardProperty[];
      sets: string[];
      rarities: string[];
      langs: string[];
  }>({
      cardTypes: [],
      monsterTypes: [],
      properties: [],
      sets: [],
      rarities: [],
      langs: []
  });

  const activeFilterCount = filters.cardTypes.length + filters.monsterTypes.length + filters.properties.length + filters.sets.length + filters.rarities.length + filters.langs.length + (wantedMode !== 'todas' ? 1 : 0);

  // Card Modal Data
  const [selectedApiCard, setSelectedApiCard] = useState<ApiCard | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  
  // Track new folder creation from CardModal
  const [lastCreatedFolderId, setLastCreatedFolderId] = useState<string | null>(null);

  // Reset selection and filters when folder changes
  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedCardIds(new Set());
    setSelectedFolderIds(new Set());
    setShowBulkDeleteConfirm(false);
    
    // Reset Filters and Close Panel on Navigation
    setFilters({
        cardTypes: [],
        monsterTypes: [],
        properties: [],
        sets: [],
        rarities: [],
        langs: []
    });
    setIsFilterOpen(false);
  }, [activeFolderId]);

  // --- Callbacks for Optimized Children ---
  const handleFolderEdit = useCallback((id: string) => {
    setEditingFolderId(id);
    setIsFolderModalOpen(true);
  }, []);

  const handleCardPress = useCallback((card: Card) => {
      // Logic moved to CardItem: if selection mode is on, it calls onToggleSelect instead
      // Los artículos personalizados no tienen ficha de carta: su propio formulario.
      if (card.personalizado) {
          setPersonalizado(card);
          return;
      }
      setSelectedApiCard(null);
      setEditingCard(card);
      setIsCardModalOpen(true);
  }, []);

  const handleToggleSelectCard = useCallback((cardId: string) => {
      setSelectedCardIds(prev => {
          const next = new Set(prev);
          if (next.has(cardId)) {
              next.delete(cardId);
          } else {
              next.add(cardId);
          }
          return next;
      });
  }, []);

  const handleToggleSelectFolder = useCallback((folderId: string) => {
      if (folderId === ID_ALL) return; // Prevent Selecting System Folder
      setSelectedFolderIds(prev => {
          const next = new Set(prev);
          if (next.has(folderId)) {
              next.delete(folderId);
          } else {
              next.add(folderId);
          }
          return next;
      });
  }, []);

  const handleConfirmDelete = () => {
      const isHome = activeFolderId === null;
      
      if (isHome) {
          // --- FOLDER DELETION LOGIC ---
          const ids = Array.from(selectedFolderIds);
          if (ids.length === 0) return;

          // 1. Snapshot Folders + Indices
          const foldersToRestore = state.db.folders
            .map((f, i) => ({ folder: f, index: i }))
            .filter(item => ids.includes(item.folder.id));

          // 2. Snapshot Cards within these folders + Indices
          const cardsToRestore = state.db.cards
            .map((c, i) => ({ card: c, index: i }))
            .filter(item => ids.includes(item.card.folderId));

          dispatch({ type: 'DELETE_FOLDERS', payload: ids });

          toast(`${ids.length} carpetas eliminadas`, 'ok', () => {
              dispatch({ type: 'RESTORE_FOLDERS', payload: foldersToRestore });
              // Also restore the cards that were in those folders
              if (cardsToRestore.length > 0) {
                  dispatch({ type: 'RESTORE_CARDS', payload: cardsToRestore });
              }
              toast("Carpetas restauradas");
          });

          setIsSelectionMode(false);
          setSelectedFolderIds(new Set());
          setShowBulkDeleteConfirm(false);

      } else {
          // --- CARD DELETION LOGIC ---
          const ids = Array.from(selectedCardIds);
          if (ids.length === 0) return;
          
          // Capture both the card AND its original index for precise restoration
          const cardsToRestore = state.db.cards
            .map((c, i) => ({ card: c, index: i }))
            .filter(item => ids.includes(item.card.uid));
          
          dispatch({ type: 'DELETE_CARDS', payload: ids });
          
          toast(`${ids.length} cartas eliminadas`, 'ok', () => {
              dispatch({ type: 'RESTORE_CARDS', payload: cardsToRestore });
              toast("Cartas restauradas");
          });

          setIsSelectionMode(false);
          setSelectedCardIds(new Set());
          setShowBulkDeleteConfirm(false);
      }
  };

  const handleSelectAll = () => {
      const isHome = activeFolderId === null;

      if (isHome) {
          // Select all folders EXCEPT ID_ALL
          const selectableFolders = (finalData as Folder[]).filter(f => f.id !== ID_ALL);
          const ids = selectableFolders.map(f => f.id);
          
          if (selectedFolderIds.size === ids.length) {
              setSelectedFolderIds(new Set());
          } else {
              setSelectedFolderIds(new Set(ids));
          }

      } else {
          // Select all visible cards
          const ids = (finalData as Card[]).map(c => c.uid);
          if (selectedCardIds.size === ids.length) {
              setSelectedCardIds(new Set());
          } else {
              setSelectedCardIds(new Set(ids));
          }
      }
  };

  const handleSelectApiCard = (card: ApiCard) => {
      setSelectedApiCard(card);
      setEditingCard(null);
      setIsSearchModalOpen(false);
      setIsCardModalOpen(true);
  };

  // --- Filtering & Sorting Pipeline ---
  const isHome = activeFolderId === null;
  const carpetaActiva = state.db.folders.find((f) => f.id === activeFolderId);

  // 1. BASE DATA: Initial List based on Location (Home/Folder) + Search Query
  // This list is used to generate "Available Filters" (Sets/Rarities) so they match the current search context.
  const baseData = useMemo(() => {
     let list: (Folder | Card)[] = [];

     if (isHome) {
         // Folders
         list = [...state.db.folders];
         if (searchQuery) {
            const q = normalizeStr(searchQuery);
            list = (list as Folder[]).filter(f => normalizeStr(f.name).includes(q));
         }
         // System Folder Pinned Logic happens later during Sort
     } else {
         // Cards
         list = activeFolderId === ID_ALL 
            ? [...state.db.cards] 
            : state.db.cards.filter(c => c.folderId === activeFolderId);
        
         if (searchQuery) {
            const q = normalizeStr(searchQuery);
            if (q.startsWith('#')) {
                const searchTags = q.split(' ').map(t => t.trim()).filter(t => t.length > 0);
                list = (list as Card[]).filter(c => {
                    return searchTags.every(st => {
                        const matchesCardTag = c.tags.some(ct => normalizeStr(ct).includes(st));
                        const cleanSearchTag = st.replace('#', '');
                        const folder = state.db.folders.find(f => f.id === c.folderId);
                        const folderNameNormalized = folder ? normalizeStr(folder.name).replace(/\s+/g, '') : '';
                        const matchesFolderTag = folderNameNormalized.includes(cleanSearchTag);
                        return matchesCardTag || matchesFolderTag;
                    });
                });
            } else {
                list = (list as Card[]).filter(c => {
                    const n = normalizeStr(c.name);
                    const nEn = normalizeStr(c.name_en || '');
                    const nEs = normalizeStr(nombresEs?.get(c.apiId) ?? '');
                    return n.includes(q) || nEn.includes(q) || nEs.includes(q);
                });
            }
         }
     }
     return list;
  }, [state.db, isHome, activeFolderId, searchQuery, nombresEs]);

  // 2. DERIVED OPTIONS: Extract Sets/Rarities from Base Data (only for Cards)
  const { availableSets, availableRarities } = useMemo(() => {
      if (isHome) return { availableSets: [], availableRarities: [] };
      
      const cards = baseData as Card[];
      const sets = new Set<string>();
      const rarities = new Set<string>();

      cards.forEach(c => {
          const prefix = getSetPrefix(c.setCode);
          if (prefix) sets.add(prefix);
          if (c.rarity) rarities.add(c.rarity);
      });

      return {
          availableSets: Array.from(sets).sort(compareNames),
          // CHANGE: Sort by Weight Descending instead of Alphabetical
          availableRarities: Array.from(rarities).sort((a, b) => {
              const wA = getRarityWeight(a);
              const wB = getRarityWeight(b);
              if (wA !== wB) return wB - wA; // Highest weight (rarest) first
              return a.localeCompare(b);
          })
      };
  }, [baseData, isHome]);

  // 3. FINAL DATA: Apply Advanced Filters & Sorting
  const finalData = useMemo(() => {

    if (isHome) {
        // --- FOLDERS PROCESSING ---
        const list = baseData as Folder[];
        
        const systemFolder = list.find(f => f.id === ID_ALL);
        const userFolders = list.filter(f => f.id !== ID_ALL);

        if (sortFolders !== 'manual') {
            const dir = sortFoldersDir === 'asc' ? 1 : -1;

            /*
             * El valor de cada carpeta se calcula una sola vez. Antes se hacía
             * dentro del comparador, que recorre la colección entera en cada
             * comparación: con muchas carpetas y cartas el orden se notaba.
             */
            const valuePerFolder = new Map<string, number>();
            if (sortFolders === 'value') {
                // Valor de mercado (las buscadas no cuentan: no se tienen).
                for (const card of state.db.cards) {
                    if (card.isWanted) continue;
                    valuePerFolder.set(card.folderId, (valuePerFolder.get(card.folderId) ?? 0) + (valueOf(card) ?? 0));
                }
            }

            userFolders.sort((a, b) => {
                if (sortFolders === 'name') return compareNames(a.name, b.name) * dir;
                if (sortFolders === 'value') {
                    const valA = valuePerFolder.get(a.id) ?? 0;
                    const valB = valuePerFolder.get(b.id) ?? 0;
                    return (valB - valA) * dir;
                }
                return 0;
            });
        }
        return systemFolder ? [systemFolder, ...userFolders] : userFolders;

    } else {
        // --- CARDS PROCESSING ---
        // Copia propia: más abajo se ordena en el sitio, y `baseData` es un
        // valor memoizado que no debe mutarse.
        let list = [...(baseData as Card[])];

        // 0. FILTER: Buscadas (WANTED): ocultarlas o ver solo esas
        if (wantedMode === 'ocultar') list = list.filter(c => !c.isWanted);
        else if (wantedMode === 'solo') list = list.filter(c => c.isWanted);

        // A. FILTER: Types
        if (filters.cardTypes.length > 0 || filters.monsterTypes.length > 0 || filters.properties.length > 0) {
            list = list.filter(c => {
                let { cardType, monsterType, property } = c;
                if (!cardType) {
                    const derived = analyzeCardType(c.type, '');
                    cardType = derived.cardType;
                    monsterType = derived.monsterType;
                    property = derived.property;
                }
                // Main Type
                if (filters.cardTypes.length > 0 && cardType) {
                    if (!filters.cardTypes.includes(cardType)) return false;
                }
                // Monster Type
                if (cardType === 'Monster' && filters.monsterTypes.length > 0) {
                    if (!monsterType || !filters.monsterTypes.includes(monsterType)) return false;
                }
                // Property
                if ((cardType === 'Spell' || cardType === 'Trap') && filters.properties.length > 0) {
                     if (!property || !filters.properties.includes(property)) return false;
                }
                return true;
            });
        }

        // B. FILTER: Sets
        if (filters.sets.length > 0) {
            list = list.filter(c => {
                const prefix = getSetPrefix(c.setCode);
                return filters.sets.includes(prefix);
            });
        }

        // C. FILTER: Rarities
        if (filters.rarities.length > 0) {
            list = list.filter(c => filters.rarities.includes(c.rarity));
        }

        // C2. FILTER: Idioma de la copia (p. ej. ver las que tengo en inglés para comprarlas en español)
        if (filters.langs.length > 0) {
            list = list.filter(c => filters.langs.includes(c.lang));
        }

        // D. SORTING (el mismo orden que el álbum: ver ordenCartas)
        const comparar = compararCartas(sortCards, sortCardsDir, (c) => displayName(c, nombresEs, modoNombres), valueOf);
        if (comparar) list.sort(comparar);
        return list;
    }
  }, [baseData, isHome, sortFolders, sortFoldersDir, sortCards, sortCardsDir, filters, state.db.cards, wantedMode, valueOf, nombresEs, modoNombres]);

  // Derived Values for Selection UI
  const totalSelectable = isHome 
      ? (finalData as Folder[]).filter(f => f.id !== ID_ALL).length 
      : (finalData as Card[]).length;
  
  const currentSelectedCount = isHome ? selectedFolderIds.size : selectedCardIds.size;
  // Vista mesa: disposición provisional hasta que DisplayTable mide el hueco de la ventana.
  const displayGridStyle = useMemo(() => {
      if (view !== 'display') return {};
      const count = finalData.length;
      if (count === 0) return {};

      // Standard YGO ratio approx 0.68
      // Screen ratio approx 1.77 (16:9)
      // To fill screen, optimal cols ~= sqrt(count * (screenRatio / cardRatio))
      // screenRatio/cardRatio ~= 2.6
      
      const optimalCols = Math.sqrt(count * 2.6);
      const cols = Math.max(1, Math.round(optimalCols));
      const rows = Math.max(1, Math.ceil(count / cols));

      return { 
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
      };
  }, [view, finalData.length]);

  // Al cambiar el orden de la carpeta, las cartas se barajan.
  useShuffleAnimation(`${sortCards}|${sortCardsDir}`, activeFolderId, !isHome && view !== 'list');


  return (
    <div className="min-h-screen pt-[calc(var(--alto-cabecera)+10px)] pb-24 transition-colors duration-500">
      <Header 
        onOpenFolderModal={() => { setEditingFolderId(null); setIsFolderModalOpen(true); }}
        onOpenSearchModal={() => setIsSearchModalOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onOpenPriceMoves={() => setIsPriceMovesOpen(true)}
        onOpenHojasBuscadas={() => setHojasBuscadas(true)}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        isSelectionMode={isSelectionMode}
        onToggleSelectionMode={() => setIsSelectionMode(prev => !prev)}
        onToggleFilter={() => setIsFilterOpen(prev => !prev)}
        isFilterOpen={isFilterOpen}
        activeFilterCount={activeFilterCount}
      />

      {/* Filtros SVG que recortan las letras del nombre para los brillos (una vez por página). */}
      <FoilFilters />
      <ToastContainer />

      {/*
        Si la copia en archivo se queda en pausa (lo normal tras reiniciar el
        navegador), se avisa aquí y no solo dentro del panel: si no se ve, se
        puede pasar semanas sin copia sin darse cuenta.
      */}
      {(backup.fileState === 'needs-permission' || backup.fileState === 'error') && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mb-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 text-sm">
            <span className="text-main flex-1 min-w-[200px]">
              {backup.fileState === 'needs-permission'
                ? <>La copia en <strong>{backup.fileName}</strong> está en pausa hasta que le des permiso.</>
                : <>No se pudo guardar la copia en <strong>{backup.fileName}</strong>.</>}
            </span>
            <button
              onClick={() => void backup.resumeFile()}
              className="bg-amber-400 text-black font-bold text-xs px-3 py-1.5 rounded-lg hover:brightness-110"
            >
              Reanudar copia
            </button>
            <button
              onClick={() => setIsBackupModalOpen(true)}
              className="text-xs font-semibold text-muted hover:text-main"
            >
              Ver detalles
            </button>
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6">
        {/* Valor de mercado: de toda la colección en la portada, de la carpeta dentro de ella. */}
        <CollectionValue
          titulo={isHome || activeFolderId === ID_ALL ? 'Tu colección' : 'Esta carpeta'}
          cards={isHome || activeFolderId === ID_ALL ? state.db.cards : state.db.cards.filter(c => c.folderId === activeFolderId)}
        />

        {/* FILTERS (Only visible in Card View) */}
        {!isHome && (
            <CardFilter 
                filters={filters}
                onChange={(f) => setFilters({ ...f, langs: f.langs ?? [] })}
                isOpen={isFilterOpen}
                availableSets={availableSets}
                availableRarities={availableRarities}
            />
        )}

         <AnimatePresence mode="wait" initial={false}>
            {finalData.length === 0 ? (
                <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="w-full text-center py-20 text-main/50 font-medium"
                >
                    {searchQuery || activeFilterCount > 0 ? 'No se encontraron resultados' : 'Carpeta vacía'}
                </motion.div>
            ) : view === 'grid' ? (
                <motion.div
                    key={`grid-${activeFolderId ?? 'home'}`} 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="grid gap-3 sm:gap-5 w-full transition-[gap] duration-300 ease-out"
                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(var(--grid-size, ${gridSize}px), calc(50% - 10px)), 1fr))` }}
                >
                    {isHome ? (
                        (finalData as Folder[]).map((folder) => (
                            <FolderItem 
                                key={folder.id} 
                                folder={folder} 
                                onEdit={handleFolderEdit}
                                viewMode="grid"
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedFolderIds.has(folder.id)}
                                onToggleSelect={() => handleToggleSelectFolder(folder.id)}
                            />
                        ))
                    ) : (
                        (finalData as Card[]).map((card) => (
                            <CardItem 
                                key={card.uid} 
                                card={card} 
                                onPress={handleCardPress}
                                viewMode="grid"
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedCardIds.has(card.uid)}
                                onToggleSelect={() => handleToggleSelectCard(card.uid)}
                            />
                        ))
                    )}
                </motion.div>
            ) : view === 'list' ? (
                <motion.div
                    key={`list-${activeFolderId ?? 'home'}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="flex flex-col gap-3 w-full"
                >
                    {isHome ? (
                        (finalData as Folder[]).map((folder) => (
                            <FolderItem 
                                key={folder.id} 
                                folder={folder} 
                                onEdit={handleFolderEdit}
                                viewMode="list"
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedFolderIds.has(folder.id)}
                                onToggleSelect={() => handleToggleSelectFolder(folder.id)}
                            />
                        ))
                    ) : (
                        (finalData as Card[]).map((card) => (
                            <CardItem 
                                key={card.uid} 
                                card={card} 
                                onPress={handleCardPress}
                                viewMode="list"
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedCardIds.has(card.uid)}
                                onToggleSelect={() => handleToggleSelectCard(card.uid)}
                            />
                        ))
                    )}
                </motion.div>
            ) : view === 'display' ? (
                 // Vista mesa: todas las cartas enteras y lo más grandes posible en la ventana.
                 <DisplayTable key={`display-${activeFolderId ?? 'home'}`} count={finalData.length} provisional={displayGridStyle}>
                    {isHome ? (
                        // Fallback to Grid for Folders in Display Mode (or could render cleaner folders)
                        (finalData as Folder[]).map((folder) => (
                            <FolderItem 
                                key={folder.id} 
                                folder={folder} 
                                onEdit={handleFolderEdit}
                                viewMode="grid" // Keep standard grid for folders even in display mode
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedFolderIds.has(folder.id)}
                                onToggleSelect={() => handleToggleSelectFolder(folder.id)}
                            />
                        ))
                    ) : (
                        (finalData as Card[]).map((card) => (
                            <CardItem 
                                key={card.uid} 
                                card={card} 
                                onPress={handleCardPress}
                                viewMode="display" // Use new display mode
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedCardIds.has(card.uid)}
                                onToggleSelect={() => handleToggleSelectCard(card.uid)}
                            />
                        ))
                    )}
                </DisplayTable>
            ) : (
                <motion.div
                    key={`album-${activeFolderId ?? 'home'}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                    {isHome ? (
                         // Fallback for Home View (Shouldn't really happen if UI logic is sound, but good safety)
                         // Render Grid for folders even in Album mode
                        <div 
                            className="grid gap-3 sm:gap-5 w-full transition-[gap] duration-300 ease-out"
                            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(var(--grid-size, ${gridSize}px), calc(50% - 10px)), 1fr))` }}
                        >
                             {(finalData as Folder[]).map((folder) => (
                                <FolderItem 
                                    key={folder.id} 
                                    folder={folder} 
                                    onEdit={handleFolderEdit}
                                    viewMode="grid"
                                    isSelectionMode={isSelectionMode}
                                    isSelected={selectedFolderIds.has(folder.id)}
                                    onToggleSelect={() => handleToggleSelectFolder(folder.id)}
                                />
                            ))}
                        </div>
                    ) : (
                        <AlbumView 
                            cards={finalData as Card[]}
                            onCardPress={handleCardPress}
                            isSelectionMode={isSelectionMode}
                            selectedIds={selectedCardIds}
                            onToggleSelect={handleToggleSelectCard}
                            titulo={activeFolderId === ID_ALL ? 'Toda la colección' : carpetaActiva?.name}
                            portada={carpetaActiva?.img}
                            estilo={carpetaActiva?.album}
                            onEstilo={carpetaActiva ? (album) => dispatch({ type: 'SET_FOLDER_ALBUM', payload: { id: carpetaActiva.id, album } }) : undefined}
                            teclado={personalizado === undefined && !hojasBuscadas && !isCardModalOpen && !isSearchModalOpen && !isFolderModalOpen && !isThemeModalOpen && !isBackupModalOpen && !isPriceMovesOpen}
                        />
                    )}
                </motion.div>
            )}
        </AnimatePresence>
      </main>

      {/* FLOATING ACTION BAR FOR SELECTION */}
      <AnimatePresence>
        {isSelectionMode && (
            <motion.div 
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                exit={{ y: 100 }}
                // Por encima de la carta levantada al pasar el ratón (z-80), que la tapaba.
                className="fixed bottom-6 left-0 right-0 flex justify-center z-[95] pointer-events-none"
            >
                <div className="bg-bg-panel border-none shadow-2xl rounded-2xl flex items-center gap-4 p-2 pointer-events-auto overflow-hidden ring-1 ring-white/5">
                    {showBulkDeleteConfirm ? (
                        <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 px-2"
                        >
                            <span className="text-sm font-bold text-main">
                                ¿Eliminar {currentSelectedCount} {isHome ? 'carpetas' : 'cartas'}?
                            </span>
                            <button 
                                onClick={() => setShowBulkDeleteConfirm(false)}
                                className="px-3 py-1.5 rounded-lg bg-bg-surface hover:bg-main/10 text-main text-xs font-bold transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleConfirmDelete}
                                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors shadow-lg shadow-red-900/20"
                            >
                                Sí, eliminar
                            </button>
                        </motion.div>
                    ) : (
                        <>
                            <div className="px-4 text-sm font-bold text-main">
                                {currentSelectedCount} seleccionadas
                            </div>
                            
                            <button 
                                onClick={handleSelectAll}
                                className="px-4 py-2 hover:bg-primary/20 hover:text-primary rounded-lg text-sm font-medium transition-colors text-main/80"
                            >
                                {currentSelectedCount === totalSelectable ? 'Deseleccionar' : 'Todas'}
                            </button>

                            <div className="w-[1px] h-6 bg-main/10" />

                            <button 
                                onClick={() => { 
                                    setIsSelectionMode(false); 
                                    setSelectedCardIds(new Set()); 
                                    setSelectedFolderIds(new Set());
                                    setShowBulkDeleteConfirm(false); 
                                }}
                                className="p-2 hover:bg-main/10 rounded-lg text-main/60 hover:text-main transition-colors"
                                title="Cancelar"
                            >
                                <X size={20} />
                            </button>
                            
                            <button 
                                onClick={() => setShowBulkDeleteConfirm(true)}
                                disabled={currentSelectedCount === 0}
                                className="p-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors shadow-lg shadow-red-900/20"
                                title="Eliminar"
                            >
                                <Trash size={20} />
                            </button>
                        </>
                    )}
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isBackupModalOpen && (
            <BackupModal isOpen={isBackupModalOpen} onClose={() => setIsBackupModalOpen(false)} />
        )}
        {isPriceMovesOpen && (
            <PriceMovesModal onClose={() => setIsPriceMovesOpen(false)} onOpenCard={handleCardPress} />
        )}
        {isThemeModalOpen && (
            <ThemeModal isOpen={isThemeModalOpen} onClose={() => setIsThemeModalOpen(false)} />
        )}
        {isFolderModalOpen && (
            <FolderModal 
                isOpen={isFolderModalOpen} 
                onClose={() => setIsFolderModalOpen(false)} 
                editId={editingFolderId} 
                onSave={(newId) => setLastCreatedFolderId(newId)}
            />
        )}
        {isSearchModalOpen && (
            <SearchModal 
                isOpen={isSearchModalOpen}
                onClose={() => setIsSearchModalOpen(false)}
                onSelect={handleSelectApiCard}
                onPersonalizado={() => {
                    setIsSearchModalOpen(false);
                    setPersonalizado(null);
                }}
            />
        )}
        {hojasBuscadas && <HojasBuscadasModal onClose={() => setHojasBuscadas(false)} />}
        {personalizado !== undefined && (
            <PersonalizadoModal existente={personalizado} onClose={() => setPersonalizado(undefined)} />
        )}
        {isCardModalOpen && (
            <CardModal 
                isOpen={isCardModalOpen}
                onClose={() => {
                    setIsCardModalOpen(false);
                    setLastCreatedFolderId(null); // Clear persistent new folder ID to respect active folder on next open
                }}
                initialApiCard={selectedApiCard}
                existingCard={editingCard}
                onCreateFolder={() => {
                    setEditingFolderId(null);
                    setIsFolderModalOpen(true);
                }}
                newFolderId={lastCreatedFolderId}
            />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;