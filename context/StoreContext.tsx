import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import type { Database, Folder, Card, ViewMode, FolderSort, CardSort, ToastData, SortDirection, ThemeConfig, AlbumColumns } from '../types';
import { generateId } from '../utils';
import { createEmptyDatabase, normalizeDatabase } from '../services/database';

// --- State Definition ---
interface AppState {
  db: Database;
  ui: {
    view: ViewMode;
    lastHomeView: ViewMode; // Track preferred view for Home (Grid/List)
    activeFolderId: string | null;
    sortFolders: FolderSort;
    sortFoldersDir: SortDirection;
    sortCards: CardSort;
    sortCardsDir: SortDirection;
    gridSize: number;
    searchQuery: string;
    isTagsPanelOpen: boolean;
    toasts: ToastData[];
    theme: ThemeConfig;
    albumColumns: AlbumColumns;
    showFoils: boolean; 
    showConditionFlags: boolean;
    showEditionFlags: boolean;
    showWantedCards: boolean; // New State for Wanted cards toggle
  };
}

// --- Actions ---
type Action =
  | { type: 'INIT_DB'; payload: Database }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_ALBUM_COLUMNS'; payload: AlbumColumns }
  | { type: 'SET_ACTIVE_FOLDER'; payload: string | null }
  | { type: 'SET_GRID_SIZE'; payload: number }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'TOGGLE_TAGS_PANEL' }
  | { type: 'SET_FOLDER_SORT'; payload: FolderSort }
  | { type: 'SET_FOLDER_SORT_DIR'; payload: SortDirection }
  | { type: 'SET_CARD_SORT'; payload: CardSort }
  | { type: 'SET_CARD_SORT_DIR'; payload: SortDirection }
  | { type: 'ADD_TOAST'; payload: ToastData }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'SET_THEME'; payload: ThemeConfig }
  | { type: 'TOGGLE_FOILS' }
  | { type: 'TOGGLE_CONDITION_FLAGS' }
  | { type: 'TOGGLE_EDITION_FLAGS' }
  | { type: 'TOGGLE_WANTED_CARDS' } // New Action
  // DB Actions
  | { type: 'SAVE_FOLDER'; payload: Folder }
  | { type: 'DELETE_FOLDER'; payload: string }
  | { type: 'DELETE_FOLDERS'; payload: string[] }
  | { type: 'RESTORE_FOLDER'; payload: { folder: Folder; index: number } }
  | { type: 'RESTORE_FOLDERS'; payload: { folder: Folder; index: number }[] }
  | { type: 'REORDER_FOLDERS'; payload: Folder[] }
  | { type: 'ADD_CARD'; payload: Card }
  | { type: 'UPDATE_CARD'; payload: Card }
  | { type: 'DELETE_CARD'; payload: string }
  | { type: 'DELETE_CARDS'; payload: string[] }
  | { type: 'RESTORE_CARD'; payload: { card: Card; index: number } }
  | { type: 'RESTORE_CARDS'; payload: { card: Card; index: number }[] }
  | { type: 'REORDER_CARDS'; payload: Card[] }
  | { type: 'IMPORT_DB'; payload: Database }
  | { type: 'REGISTER_CUSTOM_ART'; payload: { apiId: number; url: string } };

// Default Theme: Platinum (Amber / Zinc)
const DEFAULT_THEME: ThemeConfig = {
    primary: '251 191 36',
    bgBody: '5 5 7',
    bgSurface: '24 24 27',
    bgPanel: '39 39 42',
    isDark: true
};

const DB_STORAGE_KEY = 'yugi-tracker-platinum-db';
const THEME_STORAGE_KEY = 'yugi-tracker-platinum-theme';

/**
 * Lee lo guardado en el navegador. Si el JSON está a medias o no tiene forma de
 * colección devuelve `null` y se empieza de cero.
 */
function parseDatabase(raw: string): Database | null {
  return normalizeDatabase(JSON.parse(raw));
}

const INITIAL_STATE: AppState = {
  db: { folders: [], cards: [], customArts: {} },
  ui: {
    view: 'grid',
    lastHomeView: 'grid',
    activeFolderId: null,
    sortFolders: 'name', 
    sortFoldersDir: 'asc',
    sortCards: 'type',   
    sortCardsDir: 'asc',
    gridSize: 180,
    searchQuery: '',
    isTagsPanelOpen: false,
    toasts: [],
    theme: DEFAULT_THEME,
    albumColumns: 3,
    showFoils: true, // Default enabled
    showConditionFlags: true, // Default enabled
    showEditionFlags: true, // Default enabled
    showWantedCards: true // Default enabled
  }
};

// --- Reducer ---
const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'INIT_DB':
      return { ...state, db: { ...action.payload, customArts: action.payload.customArts || {} } };
    case 'SET_VIEW_MODE': {
      const isHome = state.ui.activeFolderId === null;
      return { 
          ...state, 
          ui: { 
              ...state.ui, 
              view: action.payload,
              // Update home preference only if at home and not setting Album mode
              lastHomeView: (isHome && action.payload !== 'album') ? action.payload : state.ui.lastHomeView
          } 
      };
    }
    case 'SET_ALBUM_COLUMNS':
      return { ...state, ui: { ...state.ui, albumColumns: action.payload } };
    
    case 'SET_ACTIVE_FOLDER': {
      // Find the folder to load its specific sort preferences
      const targetFolder = state.db.folders.find(f => f.id === action.payload);
      
      // Default fallback if not set yet: 'type' / 'asc'
      const loadedSort = targetFolder?.cardSort || 'type';
      const loadedDir = targetFolder?.cardSortDir || 'asc';

      const isGoingHome = action.payload === null;
      let nextView = state.ui.view;

      if (isGoingHome) {
          // Restore the preferred Home View (Grid/List)
          // ensuring we never land on Home with 'album' view
          nextView = state.ui.lastHomeView;
      }

      return { 
        ...state, 
        ui: { 
          ...state.ui, 
          activeFolderId: action.payload,
          searchQuery: '', 
          isTagsPanelOpen: false,
          // Apply loaded sort prefs to UI state
          sortCards: loadedSort,
          sortCardsDir: loadedDir,
          view: nextView
        } 
      };
    }
    
    case 'SET_GRID_SIZE':
      return { ...state, ui: { ...state.ui, gridSize: action.payload } };
    case 'SET_SEARCH_QUERY':
      return { ...state, ui: { ...state.ui, searchQuery: action.payload } };
    case 'TOGGLE_TAGS_PANEL':
      return { ...state, ui: { ...state.ui, isTagsPanelOpen: !state.ui.isTagsPanelOpen } };
    case 'SET_FOLDER_SORT':
      return { 
          ...state, 
          ui: { 
              ...state.ui, 
              sortFolders: action.payload,
              sortFoldersDir: 'asc' 
          } 
      };
    case 'SET_FOLDER_SORT_DIR':
      return { ...state, ui: { ...state.ui, sortFoldersDir: action.payload } };
    
    case 'SET_CARD_SORT': {
      const newSort = action.payload;
      const newDir = 'asc'; // Reset direction on type change
      
      // Update DB if we are inside a folder
      let newFolders = state.db.folders;
      if (state.ui.activeFolderId) {
          newFolders = state.db.folders.map(f => 
             f.id === state.ui.activeFolderId 
             ? { ...f, cardSort: newSort, cardSortDir: newDir }
             : f
          );
      }

      return { 
          ...state, 
          db: { ...state.db, folders: newFolders },
          ui: { 
              ...state.ui, 
              sortCards: newSort,
              sortCardsDir: newDir 
          } 
      };
    }

    case 'SET_CARD_SORT_DIR': {
        const newDir = action.payload;
        
        // Update DB if we are inside a folder
        let newFolders = state.db.folders;
        if (state.ui.activeFolderId) {
            newFolders = state.db.folders.map(f => 
               f.id === state.ui.activeFolderId 
               ? { ...f, cardSortDir: newDir }
               : f
            );
        }

        return { 
            ...state, 
            db: { ...state.db, folders: newFolders },
            ui: { ...state.ui, sortCardsDir: newDir } 
        };
    }

    case 'ADD_TOAST':
      return { 
        ...state, 
        ui: { ...state.ui, toasts: [...state.ui.toasts, action.payload] } 
      };
    case 'REMOVE_TOAST':
      return { 
        ...state, 
        ui: { ...state.ui, toasts: state.ui.toasts.filter(t => t.id !== action.payload) } 
      };
    case 'SET_THEME':
      return { ...state, ui: { ...state.ui, theme: action.payload } };
    case 'TOGGLE_FOILS':
      return { ...state, ui: { ...state.ui, showFoils: !state.ui.showFoils } };
    case 'TOGGLE_CONDITION_FLAGS':
      return { ...state, ui: { ...state.ui, showConditionFlags: !state.ui.showConditionFlags } };
    case 'TOGGLE_EDITION_FLAGS':
      return { ...state, ui: { ...state.ui, showEditionFlags: !state.ui.showEditionFlags } };
    case 'TOGGLE_WANTED_CARDS':
      return { ...state, ui: { ...state.ui, showWantedCards: !state.ui.showWantedCards } };
    case 'SAVE_FOLDER': {
      const exists = state.db.folders.find(f => f.id === action.payload.id);
      let newFolders;
      if (exists) {
        // Preserve existing sort settings when editing other details
        newFolders = state.db.folders.map(f => f.id === action.payload.id ? {
            ...action.payload,
            cardSort: f.cardSort,
            cardSortDir: f.cardSortDir
        } : f);
      } else {
        // New Folder: Initialize with defaults
        newFolders = [...state.db.folders, { 
            ...action.payload, 
            cardSort: 'type' as const,
            cardSortDir: 'asc' as const,
        }];
      }
      return { ...state, db: { ...state.db, folders: newFolders } };
    }
    case 'DELETE_FOLDER': {
      return {
        ...state,
        db: {
          ...state.db,
          folders: state.db.folders.filter(f => f.id !== action.payload),
          cards: state.db.cards.filter(c => c.folderId !== action.payload)
        },
        ui: { ...state.ui, activeFolderId: null }
      };
    }
    case 'DELETE_FOLDERS': {
        const ids = new Set(action.payload);
        return {
            ...state,
            db: {
                ...state.db,
                folders: state.db.folders.filter(f => !ids.has(f.id)),
                cards: state.db.cards.filter(c => !ids.has(c.folderId))
            },
            ui: { ...state.ui, activeFolderId: null }
        };
    }
    case 'RESTORE_FOLDER': {
      const newFolders = [...state.db.folders];
      newFolders.splice(action.payload.index, 0, action.payload.folder);
      return { ...state, db: { ...state.db, folders: newFolders } };
    }
    case 'RESTORE_FOLDERS': {
        const newFolders = [...state.db.folders];
        const sorted = [...action.payload].sort((a,b) => a.index - b.index);
        sorted.forEach(item => {
            newFolders.splice(item.index, 0, item.folder);
        });
        return { ...state, db: { ...state.db, folders: newFolders } };
    }
    case 'REORDER_FOLDERS':
      return { ...state, db: { ...state.db, folders: action.payload } };
    case 'ADD_CARD':
      return { ...state, db: { ...state.db, cards: [...state.db.cards, action.payload] } };
    case 'UPDATE_CARD':
      return {
        ...state,
        db: { ...state.db, cards: state.db.cards.map(c => c.uid === action.payload.uid ? action.payload : c) }
      };
    case 'DELETE_CARD':
      return { ...state, db: { ...state.db, cards: state.db.cards.filter(c => c.uid !== action.payload) } };
    case 'DELETE_CARDS': {
        const ids = new Set(action.payload);
        return { ...state, db: { ...state.db, cards: state.db.cards.filter(c => !ids.has(c.uid)) } };
    }
    case 'RESTORE_CARD': {
      const newCards = [...state.db.cards];
      newCards.splice(action.payload.index, 0, action.payload.card);
      return { ...state, db: { ...state.db, cards: newCards } };
    }
    case 'RESTORE_CARDS': {
        const newCards = [...state.db.cards];
        const sorted = [...action.payload].sort((a,b) => a.index - b.index);
        sorted.forEach(item => {
            newCards.splice(item.index, 0, item.card);
        });
        return { ...state, db: { ...state.db, cards: newCards } };
    }
    case 'REORDER_CARDS':
      return { ...state, db: { ...state.db, cards: action.payload } };
    case 'IMPORT_DB':
      return { 
          ...state, 
          db: { ...action.payload, customArts: action.payload.customArts || {} },
          ui: { ...state.ui, activeFolderId: null, searchQuery: '', lastHomeView: 'grid' }
      };
    case 'REGISTER_CUSTOM_ART': {
        const { apiId, url } = action.payload;
        const currentList = state.db.customArts[apiId] || [];
        if (currentList.includes(url)) return state;
        
        const newList = [url, ...currentList].slice(0, 5);
        
        return {
            ...state,
            db: {
                ...state.db,
                customArts: {
                    ...state.db.customArts,
                    [apiId]: newList
                }
            }
        };
    }
    default:
      return state;
  }
};

// --- Context ---
const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action>; toast: (msg: string, type?: 'ok'|'err', onUndo?: () => void) => void } | undefined>(undefined);

/**
 * Estado de arranque, ya con lo que hubiera guardado en el navegador.
 *
 * Se lee aquí y no en un `useEffect` a propósito: así el primer render ya sale
 * con la colección puesta (sin el parpadeo de una pantalla vacía) y no hace
 * falta una bandera que impida guardar antes de haber leído.
 */
function createInitialState(): AppState {
  let db = createEmptyDatabase();
  try {
    const saved = localStorage.getItem(DB_STORAGE_KEY);
    if (saved) db = parseDatabase(saved) ?? db;
  } catch (e) {
    console.error('No se pudo leer la colección guardada:', e);
  }

  let theme = DEFAULT_THEME;
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    // Se mezcla sobre el tema por defecto para que un tema viejo al que le
    // falte algún campo no deje colores sin definir.
    if (savedTheme) theme = { ...DEFAULT_THEME, ...(JSON.parse(savedTheme) as Partial<ThemeConfig>) };
  } catch (e) {
    console.error('No se pudo leer el tema guardado:', e);
  }

  return { db, ui: { ...INITIAL_STATE.ui, theme } };
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const toast = useCallback((msg: string, type: 'ok' | 'err' = 'ok', onUndo?: () => void) => {
    const id = generateId();
    dispatch({ type: 'ADD_TOAST', payload: { id, msg, type, onUndo } });
    // Los avisos con "Deshacer" duran más para dar tiempo a reaccionar.
    const ms = onUndo ? 5000 : 3000;
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), ms);
  }, []);

  // El aviso de almacenamiento lleno se da una sola vez por sesión; si no,
  // saldría en cada pulsación.
  const quotaWarned = useRef(false);

  /*
   * Guardado automático. Antes estaba condicionado a que hubiera al menos una
   * carpeta o una carta, así que al vaciar la colección no se llegaba a
   * escribir nada y lo borrado reaparecía al recargar.
   */
  useEffect(() => {
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state.db));
    } catch (e) {
      /*
       * Se llega aquí sobre todo al topar con el límite del navegador (unos
       * 5 MB), que se alcanza con muchas cartas y portadas personalizadas.
       * Antes el fallo pasaba desapercibido y se perdía lo último añadido.
       */
      console.error('No se pudo guardar la colección:', e);
      if (!quotaWarned.current) {
        quotaWarned.current = true;
        toast('No se pudo guardar: almacenamiento lleno. Exporta una copia.', 'err');
      }
    }
  }, [state.db, toast]);

  useEffect(() => {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state.ui.theme));
      } catch (e) {
        console.error('No se pudo guardar el tema:', e);
      }

      const root = document.documentElement;
      root.style.setProperty('--rgb-primary', state.ui.theme.primary);
      root.style.setProperty('--rgb-bg-body', state.ui.theme.bgBody);
      root.style.setProperty('--rgb-bg-surface', state.ui.theme.bgSurface);
      root.style.setProperty('--rgb-bg-panel', state.ui.theme.bgPanel);
      
      if (state.ui.theme.isDark) {
          root.style.setProperty('--rgb-text-main', '255 255 255');
          root.style.setProperty('--rgb-text-muted', '156 163 175');
          root.style.setProperty('--rgb-text-sub', '107 114 128');
          root.classList.add('dark');
      } else {
          root.style.setProperty('--rgb-text-main', '20 20 20');
          root.style.setProperty('--rgb-text-muted', '75 85 99');
          root.style.setProperty('--rgb-text-sub', '107 114 128');
          root.classList.remove('dark');
      }

  }, [state.ui.theme]);

  return (
    <StoreContext.Provider value={{ state, dispatch, toast }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
};