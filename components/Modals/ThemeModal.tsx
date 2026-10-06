import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../context/StoreContext';
import { X, Check, Pipette, Sparkles, Save, PaintBucket, LayoutTemplate } from 'lucide-react';
import { hexToRgb, isColorDark, generateDerivedColors } from '../../utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface CustomColor {
    id: string;
    name: string;
    hex: string;
}

const CUSTOM_THEMES_KEY = 'yugi-tracker-custom-themes';

/** Colores guardados por el usuario. Ante cualquier problema, listas vacías. */
function readCustomColors(): { accents: CustomColor[]; bgs: CustomColor[] } {
    try {
        const stored = localStorage.getItem(CUSTOM_THEMES_KEY);
        if (!stored) return { accents: [], bgs: [] };
        const parsed = JSON.parse(stored) as { accents?: CustomColor[]; bgs?: CustomColor[] };
        return {
            accents: Array.isArray(parsed.accents) ? parsed.accents : [],
            bgs: Array.isArray(parsed.bgs) ? parsed.bgs : [],
        };
    } catch (e) {
        console.error('No se pudieron leer los colores personalizados:', e);
        return { accents: [], bgs: [] };
    }
}

// --- PALETTE DATA ---
const ACCENT_VIBRANT = [
    { name: 'Inferno', hex: '#ef4444' },        // Red-500
    { name: 'Solstice', hex: '#f97316' },       // Orange-500
    { name: 'Millennium', hex: '#fbbf24' },     // DEFAULT APP COLOR (Amber-400)
    { name: 'Viper', hex: '#22c55e' },          // Green-500
    { name: 'Emerald', hex: '#10b981' },        // Emerald-500
    { name: 'Cyber', hex: '#06b6d4' },          // Cyan-500
    { name: 'Royal', hex: '#3b82f6' },          // Blue-500
    { name: 'Void', hex: '#8b5cf6' },           // Violet-500
    { name: 'Galaxy', hex: '#d946ef' },         // Fuchsia-500
    { name: 'Neon', hex: '#ec4899' },           // Pink-500
];

const ACCENT_UNIQUE = [
    { name: 'Pharaoh', hex: '#ffd700' },        // Gold (Metallic)
    { name: 'Starlight', hex: '#94a3b8' },      // Silver/Slate (Metallic)
    { name: 'Crimson', hex: '#be123c' },        // Rose-700 (Deep Red)
    { name: 'Harvest', hex: '#ea580c' },        // Orange-600 (Dark Orange)
    { name: 'Toxic', hex: '#a3e635' },          // Lime-400 (Chartreuse)
    { name: 'Aurora', hex: '#2dd4bf' },         // Teal-400 (Turquoise)
    { name: 'Indigo', hex: '#4f46e5' },         // Indigo-600 (Deep Blue/Purple)
    { name: 'Lavender', hex: '#c084fc' },       // Purple-400 (Pastel)
    { name: 'Coral', hex: '#fb7185' },          // Rose-400 (Pinkish Orange)
    { name: 'Graphite', hex: '#475569' },       // Slate-600 (Dark Grey)
];

const BG_DARK = [
    { name: 'Shadow', hex: '#050507' },         // DEFAULT APP BG
    { name: 'Abyss', hex: '#000000' },          // Obsidian
    { name: 'Carbon', hex: '#09090b' },         // Zinc
    { name: 'Storm', hex: '#0f172a' },          // Slate
    { name: 'Deep', hex: '#020617' },           // Navy
    { name: 'Eclipse', hex: '#1e1b2e' },        // Dracula
    { name: 'Canyon', hex: '#1f1a17' },         // Mocha
    { name: 'Jungle', hex: '#022c22' },         // Forest
];

const BG_LIGHT = [
    { name: 'Holy', hex: '#ffffff' },           // Pure
    { name: 'Cloud', hex: '#f3f4f6' },          // Paper
    { name: 'Parchment', hex: '#fffbeb' },      // Cream
    { name: 'Temple', hex: '#f5f5f4' },         // Linen
    { name: 'Frost', hex: '#f0f9ff' },          // Polar
    { name: 'Haze', hex: '#f5f3ff' },           // Lavender
    { name: 'Meadow', hex: '#f0fdf4' },         // Minty
    { name: 'Petal', hex: '#fff1f2' },          // Blush
];

export const ThemeModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useStore();
  const { theme } = state.ui;
  
  const [customPrimary, setCustomPrimary] = useState('#fbbf24');
  const [primaryName, setPrimaryName] = useState('');
  
  const [customBg, setCustomBg] = useState('#050507');
  const [bgName, setBgName] = useState('');

  /*
   * Colores guardados por el usuario. Se leen en el inicializador de `useState`
   * en vez de en un efecto: así ya salen en el primer render y no provoca un
   * render extra. Un JSON corrupto devuelve listas vacías en lugar de romper.
   */
  const [savedAccents, setSavedAccents] = useState<CustomColor[]>(() => readCustomColors().accents);
  const [savedBgs, setSavedBgs] = useState<CustomColor[]>(() => readCustomColors().bgs);

  const saveToStorage = (accents: CustomColor[], bgs: CustomColor[]) => {
      try {
          localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify({ accents, bgs }));
      } catch (e) {
          console.error('No se pudieron guardar los colores personalizados:', e);
      }
  };

  const handleAddCustom = (type: 'accent' | 'bg') => {
      const id = Date.now().toString();
      if (type === 'accent') {
          if (!primaryName.trim()) return;
          const newList = [...savedAccents, { id, name: primaryName, hex: customPrimary }];
          setSavedAccents(newList);
          saveToStorage(newList, savedBgs);
          setPrimaryName(''); // Reset input
      } else {
          if (!bgName.trim()) return;
          const newList = [...savedBgs, { id, name: bgName, hex: customBg }];
          setSavedBgs(newList);
          saveToStorage(savedAccents, newList);
          setBgName(''); // Reset input
      }
  };

  const handleDeleteCustom = (type: 'accent' | 'bg', id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (type === 'accent') {
          const newList = savedAccents.filter(c => c.id !== id);
          setSavedAccents(newList);
          saveToStorage(newList, savedBgs);
      } else {
          const newList = savedBgs.filter(c => c.id !== id);
          setSavedBgs(newList);
          saveToStorage(savedAccents, newList);
      }
  };

  // Logic to determine the current theme name
  const getThemeIdentity = () => {
      const accents = [...ACCENT_VIBRANT, ...ACCENT_UNIQUE, ...savedAccents];
      const bgs = [...BG_DARK, ...BG_LIGHT, ...savedBgs];

      const accent = accents.find(c => hexToRgb(c.hex) === theme.primary);
      const bg = bgs.find(c => hexToRgb(c.hex) === theme.bgBody);

      const accentName = accent ? accent.name : 'Custom';
      const bgName = bg ? bg.name : 'Custom';

      return { accent: accentName, bg: bgName };
  };

  const identity = getThemeIdentity();

  const handleAccentChange = (hex: string) => {
      setCustomPrimary(hex);
      const rgb = hexToRgb(hex);
      dispatch({ 
          type: 'SET_THEME', 
          payload: { ...theme, primary: rgb } 
      });
  };

  const handleBgChange = (hex: string) => {
      setCustomBg(hex);
      const isDark = isColorDark(hex);
      const bodyRgb = hexToRgb(hex);
      const derived = generateDerivedColors(hex, isDark);

      dispatch({
          type: 'SET_THEME',
          payload: {
              ...theme,
              isDark: isDark,
              bgBody: bodyRgb,
              bgSurface: derived.surface,
              bgPanel: derived.panel
          }
      });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-5xl bg-bg-surface shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 flex justify-between items-center bg-bg-panel shrink-0 shadow-sm">
            <h3 className="text-lg font-bold text-main flex items-center gap-2">
                <LayoutTemplate size={18} className="text-primary" /> 
                Diseño de UI
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-main/60 hover:text-main"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            
            {/* --- IDENTITY BANNER --- */}
            <div className="mb-6 flex flex-col items-center justify-center p-4 rounded-xl bg-gradient-to-br from-bg-panel to-bg-body relative overflow-hidden group shadow-inner">
                <div className="absolute inset-0 bg-primary/5 opacity-50 group-hover:opacity-100 transition-opacity" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-main/50 font-bold mb-1 z-10">Arquetipo Actual</span>
                <AnimatePresence mode='wait'>
                    <motion.h2 
                        key={`${identity.accent}-${identity.bg}`}
                        initial={{ y: 5, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -5, opacity: 0 }}
                        className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-main via-primary to-main tracking-tight z-10 flex items-center gap-2"
                        style={{ textShadow: '0 4px 20px rgba(var(--rgb-primary), 0.3)' }}
                    >
                        {identity.accent} <span className="text-primary"> // </span> {identity.bg}
                    </motion.h2>
                </AnimatePresence>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* --- LEFT COL: ACCENT COLOR --- */}
                <div className="space-y-4">
                    <label className="text-sm font-bold text-main flex items-center gap-2">
                        <PaintBucket size={16} className="text-primary"/>
                        Esencia (Acento)
                    </label>
                    
                    {/* Custom Editor */}
                    <div className="bg-bg-panel p-3 rounded-xl flex gap-3 items-center shadow-sm">
                        <div className="relative group w-10 h-10 rounded-lg overflow-hidden border border-main/20 shadow-lg cursor-pointer transition-transform active:scale-95 shrink-0">
                            <div className="absolute inset-0" style={{ backgroundColor: customPrimary }}></div>
                            <input 
                                type="color" 
                                value={customPrimary}
                                onChange={(e) => handleAccentChange(e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                                <Pipette size={14} className="text-white drop-shadow-md" />
                            </div>
                        </div>
                        <input 
                            type="text" 
                            value={primaryName}
                            onChange={(e) => setPrimaryName(e.target.value)}
                            placeholder="Nombre..."
                            className="flex-1 bg-main/5 rounded-lg px-3 py-1.5 text-sm text-main focus:ring-2 focus:ring-primary focus:outline-none placeholder-main/30"
                        />
                        <button 
                            onClick={() => handleAddCustom('accent')}
                            disabled={!primaryName.trim()}
                            className="px-3 py-1.5 bg-bg-surface hover:bg-main/5 text-main font-bold rounded-lg text-xs flex items-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-transparent"
                            style={{ borderColor: primaryName.trim() ? customPrimary : 'transparent' }}
                        >
                            <Save size={14} style={{ color: primaryName.trim() ? customPrimary : 'currentColor' }} />
                        </button>
                    </div>
                    
                    {/* Palettes */}
                    <div className="space-y-3">
                         {savedAccents.length > 0 && (
                            <div className="bg-bg-panel/30 p-3 rounded-xl">
                                <div className="text-[10px] text-main/50 font-bold mb-2 uppercase tracking-wide flex items-center gap-1">
                                    <Sparkles size={10} className="text-primary"/> Mis Creaciones
                                </div>
                                <div className="grid grid-cols-8 gap-2">
                                    {savedAccents.map(acc => (
                                        <ThemeBtn key={acc.id} color={acc} isActive={hexToRgb(acc.hex) === theme.primary} onClick={() => handleAccentChange(acc.hex)} onDelete={(e) => handleDeleteCustom('accent', acc.id, e)} />
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        <div className="bg-bg-panel/30 p-3 rounded-xl">
                            <div className="text-[10px] text-main/50 font-bold mb-2 uppercase tracking-wide">Vibrante</div>
                            <div className="grid grid-cols-8 gap-2">
                                {ACCENT_VIBRANT.map(acc => (
                                    <ThemeBtn key={acc.name} color={acc} isActive={hexToRgb(acc.hex) === theme.primary} onClick={() => handleAccentChange(acc.hex)} />
                                ))}
                            </div>
                        </div>

                        <div className="bg-bg-panel/30 p-3 rounded-xl">
                            <div className="text-[10px] text-main/50 font-bold mb-2 uppercase tracking-wide">Místico</div>
                            <div className="grid grid-cols-8 gap-2">
                                {ACCENT_UNIQUE.map(acc => (
                                    <ThemeBtn key={acc.name} color={acc} isActive={hexToRgb(acc.hex) === theme.primary} onClick={() => handleAccentChange(acc.hex)} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- RIGHT COL: BACKGROUND --- */}
                <div className="space-y-4">
                    <label className="text-sm font-bold text-main flex items-center gap-2">
                        <PaintBucket size={16} className="text-primary"/>
                        Atmósfera (Fondo)
                    </label>

                    {/* Custom Editor */}
                    <div className="bg-bg-panel p-3 rounded-xl flex gap-3 items-center shadow-sm">
                        <div className="relative group w-10 h-10 rounded-lg overflow-hidden border border-main/20 shadow-lg cursor-pointer transition-transform active:scale-95 shrink-0">
                            <div className="absolute inset-0" style={{ backgroundColor: customBg }}></div>
                            <input 
                                type="color" 
                                value={customBg}
                                onChange={(e) => handleBgChange(e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                                <Pipette size={14} className="text-white drop-shadow-md" />
                            </div>
                        </div>
                        <input 
                            type="text" 
                            value={bgName}
                            onChange={(e) => setBgName(e.target.value)}
                            placeholder="Nombre..."
                            className="flex-1 bg-main/5 rounded-lg px-3 py-1.5 text-sm text-main focus:ring-2 focus:ring-primary focus:outline-none placeholder-main/30"
                        />
                         <button 
                            onClick={() => handleAddCustom('bg')}
                            disabled={!bgName.trim()}
                            className="px-3 py-1.5 bg-bg-surface hover:bg-main/5 text-main font-bold rounded-lg text-xs flex items-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-transparent"
                            style={{ borderColor: bgName.trim() ? customBg : 'transparent' }}
                        >
                            <Save size={14} style={{ color: bgName.trim() ? customBg : 'currentColor' }} />
                        </button>
                    </div>

                    <div className="space-y-3">
                        {savedBgs.length > 0 && (
                            <div className="bg-bg-panel/30 p-3 rounded-xl animate-fadeIn">
                                <div className="text-[10px] text-main/50 font-bold mb-2 uppercase tracking-wide flex items-center gap-1">
                                    <Sparkles size={10} className="text-primary"/> Mis Atmósferas
                                </div>
                                <div className="grid grid-cols-8 gap-2">
                                    {savedBgs.map(bg => (
                                        <ThemeBtn key={bg.id} color={bg} isActive={hexToRgb(bg.hex) === theme.bgBody} onClick={() => handleBgChange(bg.hex)} onDelete={(e) => handleDeleteCustom('bg', bg.id, e)} isRound />
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="bg-bg-panel/30 p-3 rounded-xl">
                            <div className="text-[10px] text-main/50 font-bold mb-2 uppercase tracking-wide">Oscuro</div>
                            <div className="grid grid-cols-8 gap-2">
                                {BG_DARK.map(bg => (
                                    <ThemeBtn key={bg.name} color={bg} isActive={hexToRgb(bg.hex) === theme.bgBody} onClick={() => handleBgChange(bg.hex)} isRound />
                                ))}
                            </div>
                        </div>

                        <div className="bg-bg-panel/30 p-3 rounded-xl">
                            <div className="text-[10px] text-main/50 font-bold mb-2 uppercase tracking-wide">Claro</div>
                            <div className="grid grid-cols-8 gap-2">
                                {BG_LIGHT.map(bg => (
                                    <ThemeBtn key={bg.name} color={bg} isActive={hexToRgb(bg.hex) === theme.bgBody} onClick={() => handleBgChange(bg.hex)} isRound />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
      </motion.div>
    </div>
  );
};

// Subcomponent for cleaner grid rendering
interface ThemeBtnProps {
    color: { name: string; hex: string; id?: string };
    isActive: boolean;
    onClick: () => void;
    onDelete?: (e: React.MouseEvent) => void;
    isRound?: boolean;
}

const ThemeBtn: React.FC<ThemeBtnProps> = ({ color, isActive, onClick, onDelete, isRound = false }) => (
    <button
        onClick={onClick}
        className={`group relative w-full aspect-square ${isRound ? 'rounded-full' : 'rounded-lg'} flex items-center justify-center transition-all hover:scale-105 hover:z-50 shadow-sm ${isActive ? 'ring-2 ring-primary scale-110 z-10 shadow-lg shadow-primary/20' : 'hover:ring-1 hover:ring-main/20'}`}
        style={{ backgroundColor: color.hex }}
        title={color.name}
    >
        {isActive && <Check size={12} className={isColorDark(color.hex) ? "text-white" : "text-black"} />}
        
        {onDelete && (
            <div 
                onClick={onDelete}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-30 shadow-sm"
                title="Eliminar"
            >
                <X size={8} />
            </div>
        )}
        
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-20 border border-white/10">
            {color.name}
        </div>
    </button>
);