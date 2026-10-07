import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MainCardType, MonsterType, CardProperty } from '../types';
import { X, Filter, ChevronDown, ChevronUp, Layers, Diamond, Tag, Languages, Target } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { IDIOMAS, LanguageFlag } from './LanguageFlag';

interface FilterState {
    cardTypes: MainCardType[];
    monsterTypes: MonsterType[];
    properties: CardProperty[];
    sets: string[];
    rarities: string[];
    /** Solo en la colección (el buscador de cartas nuevas no tiene idioma): sin él, no sale la sección. */
    langs?: string[];
}

interface Props {
    filters: FilterState;
    onChange: (newFilters: FilterState) => void;
    isOpen: boolean;
    availableSets: string[];
    availableRarities: string[];
}

const MONSTER_TYPES: MonsterType[] = ['Normal', 'Effect', 'Fusion', 'Ritual', 'Synchro', 'XYZ', 'Link', 'Pendulum'];
const SPELL_PROPS: CardProperty[] = ['Normal', 'Continuous', 'Field', 'Quick-Play', 'Equip', 'Ritual'];
const TRAP_PROPS: CardProperty[] = ['Normal', 'Continuous', 'Counter'];


export const CardFilter: React.FC<Props> = ({ filters, onChange, isOpen, availableSets, availableRarities }) => {
    const { state, dispatch } = useStore();
    const { theme, wantedMode } = state.ui;
    
    const getIsRgbDark = (rgbStr: string) => {
        const [r, g, b] = rgbStr.split(' ').map(Number);
        if (isNaN(r)) return true; // fallback
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return yiq < 128;
    };

    const isPrimaryDark = getIsRgbDark(theme.primary);
    const activeTextClass = isPrimaryDark ? 'text-static-white' : 'text-static-black';

    const [openSection, setOpenSection] = useState<'none' | 'sets' | 'rarities'>('none');
    const [allowOverflow, setAllowOverflow] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setAllowOverflow(false);
            setOpenSection('none');
        }
    }, [isOpen]);

    const toggle = <T extends string>(list: T[], item: T): T[] => {
        return list.includes(item) ? list.filter(i => i !== item) : [...list, item];
    };

    // --- Logic Handlers ---
    const handleMainTypeToggle = (type: MainCardType) => {
        const newTypes = toggle(filters.cardTypes, type);
        let newMonsterTypes = filters.monsterTypes;
        let newProperties = filters.properties;

        if (!newTypes.includes('Monster')) newMonsterTypes = [];
        const hasSpell = newTypes.includes('Spell');
        const hasTrap = newTypes.includes('Trap');
        
        if (!hasSpell) newProperties = newProperties.filter(p => !['Field', 'Quick-Play', 'Equip', 'Ritual'].includes(p));
        if (!hasTrap) newProperties = newProperties.filter(p => p !== 'Counter');
        if (!hasSpell && !hasTrap) newProperties = [];

        onChange({ ...filters, cardTypes: newTypes, monsterTypes: newMonsterTypes, properties: newProperties });
    };

    const handleMonsterTypeToggle = (type: MonsterType) => onChange({ ...filters, monsterTypes: toggle(filters.monsterTypes, type) });
    const handlePropertyToggle = (prop: CardProperty) => onChange({ ...filters, properties: toggle(filters.properties, prop) });
    const handleSetToggle = (setPrefix: string) => onChange({ ...filters, sets: toggle(filters.sets, setPrefix) });
    const handleRarityToggle = (rarity: string) => onChange({ ...filters, rarities: toggle(filters.rarities, rarity) });
    const handleLangToggle = (lang: string) => onChange({ ...filters, langs: toggle(filters.langs ?? [], lang) });
    
    const clearFilters = () => onChange({ cardTypes: [], monsterTypes: [], properties: [], sets: [], rarities: [], ...(filters.langs ? { langs: [] } : {}) });

    const toggleSection = (section: 'sets' | 'rarities') => {
        setOpenSection(prev => prev === section ? 'none' : section);
    };

    const activeCount = filters.cardTypes.length + filters.monsterTypes.length + filters.properties.length + filters.sets.length + filters.rarities.length + (filters.langs?.length ?? 0);
    const showMonsters = filters.cardTypes.includes('Monster');
    const showSpells = filters.cardTypes.includes('Spell');
    const showTraps = filters.cardTypes.includes('Trap');

    // --- Styles Helper ---
    const getItemClass = (isActive: boolean, isChip = false, specificType?: string) => {
        const base = "transition-all duration-200 font-bold flex items-center justify-center gap-1.5 cursor-pointer select-none";
        const shape = isChip ? "rounded-full px-3 py-1 text-xs" : "rounded-lg py-2.5 text-sm";
        
        if (isActive) {
            if (specificType) {
                if (specificType === 'Monster') return `${base} ${shape} bg-[#b07b46] text-static-white shadow-md hover:brightness-110`;
                if (specificType === 'Spell') return `${base} ${shape} bg-[#10b981] text-static-white shadow-md hover:brightness-110`;
                if (specificType === 'Trap') return `${base} ${shape} bg-[#db2777] text-static-white shadow-md hover:brightness-110`;
            }
            return `${base} ${shape} bg-primary ${activeTextClass} shadow-md hover:brightness-110`;
        }
        
        return `${base} ${shape} bg-main/5 text-main/70 hover:bg-main/10 hover:text-main`;
    };

    const getDropdownButtonClass = (isOpen: boolean) => {
        const base = "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-sm font-medium ";
        if (isOpen) {
            return `${base} bg-bg-panel text-primary shadow-lg ring-1 ring-primary/20`;
        } else {
            return `${base} bg-bg-panel text-main/70 hover:text-main hover:bg-main/5`;
        }
    };

    const getDropdownOptionClass = (isActive: boolean) => {
        const base = "w-full text-left text-xs font-mono px-3 py-2 rounded-lg transition-colors flex items-center justify-between ";
        if (isActive) {
            return `${base} bg-primary ${activeTextClass} font-bold`;
        }
        return `${base} text-main/70 hover:bg-main/5 hover:text-main`;
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                    animate={{ height: 'auto', opacity: 1, marginBottom: 16 }}
                    exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                    onAnimationComplete={() => setAllowOverflow(true)}
                    // Z-90 to stay below Header (Z-100) but above cards
                    // Sticky top-70px to float just under the header
                    className={`w-full sticky top-[70px] z-[90] ${allowOverflow ? 'overflow-visible' : 'overflow-hidden'}`}
                >
                    <div className="bg-bg-panel rounded-xl shadow-2xl mt-2 relative flex flex-col ring-1 ring-border-base">
                        
                        {/* 1. Header Bar */}
                        <div className="flex justify-between items-center px-5 py-3 bg-main/5 rounded-t-xl">
                            <div className="flex items-center gap-2 text-main">
                                <Filter size={16} className="text-primary" />
                                <span className="text-xs font-bold uppercase tracking-widest">Filtros</span>
                            </div>
                            {activeCount > 0 && (
                                <button 
                                    onClick={clearFilters} 
                                    className="text-[10px] text-red-500 hover:text-white hover:bg-red-500 bg-red-500/10 px-3 py-1.5 rounded-full transition-colors font-bold flex items-center gap-1"
                                >
                                    <X size={12} /> 
                                    Limpiar ({activeCount})
                                </button>
                            )}
                        </div>

                        {/* 2. Active Filters Summary (Chips) */}
                        {activeCount > 0 && (
                            <div className="px-5 py-3 flex flex-wrap gap-2 bg-bg-surface">
                                {filters.cardTypes.map(t => (
                                    <button key={t} onClick={() => handleMainTypeToggle(t)} className={getItemClass(true, true, t)}>
                                        {t === 'Monster' ? 'Monstruo' : t === 'Spell' ? 'Magia' : 'Trampa'} <X size={12}/>
                                    </button>
                                ))}
                                {filters.monsterTypes.map(t => (
                                    <button key={t} onClick={() => handleMonsterTypeToggle(t)} className={getItemClass(true, true)}>
                                        {t} <X size={12}/>
                                    </button>
                                ))}
                                {filters.properties.map(p => (
                                    <button key={p} onClick={() => handlePropertyToggle(p)} className={getItemClass(true, true)}>
                                        {p} <X size={12}/>
                                    </button>
                                ))}
                                {filters.sets.map(s => (
                                    <button key={s} onClick={() => handleSetToggle(s)} className={getItemClass(true, true)}>
                                        Set: {s} <X size={12}/>
                                    </button>
                                ))}
                                {filters.rarities.map(r => (
                                    <button key={r} onClick={() => handleRarityToggle(r)} className={getItemClass(true, true)}>
                                        {r} <X size={12}/>
                                    </button>
                                ))}
                                {(filters.langs ?? []).map(l => (
                                    <button key={l} onClick={() => handleLangToggle(l)} className={getItemClass(true, true)}>
                                        Idioma: {IDIOMAS.find(i => i.id === l)?.nombre ?? l} <X size={12}/>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="p-5 space-y-6 bg-bg-surface rounded-b-xl">
                            
                            {/* 3. Main Types Grid */}
                            <div>
                                <h4 className="text-[10px] font-bold text-muted mb-2 uppercase tracking-wider flex items-center gap-1">
                                    <Tag size={12} className="text-primary"/> Tipo de Carta
                                </h4>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['Monster', 'Spell', 'Trap'] as MainCardType[]).map(type => (
                                        <button 
                                            key={type}
                                            onClick={() => handleMainTypeToggle(type)}
                                            className={getItemClass(filters.cardTypes.includes(type), false, type)}
                                        >
                                            {type === 'Monster' ? 'Monstruo' : type === 'Spell' ? 'Magia' : 'Trampa'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Idioma de la copia */}
                            {filters.langs && (
                            <div>
                                <h4 className="text-[10px] font-bold text-muted mb-2 uppercase tracking-wider flex items-center gap-1">
                                    <Languages size={12} className="text-primary"/> Idioma
                                </h4>
                                <div className="grid grid-cols-3 gap-2">
                                    {IDIOMAS.map(idioma => (
                                        <button
                                            key={idioma.id}
                                            onClick={() => handleLangToggle(idioma.id)}
                                            className={getItemClass(filters.langs?.includes(idioma.id) ?? false, false)}
                                        >
                                            <LanguageFlag lang={idioma.id} size={13} />
                                            {idioma.nombre}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            )}

                            {/* Buscadas (WANTED): todas, solo esas o ninguna */}
                            {filters.langs && (
                            <div>
                                <h4 className="text-[10px] font-bold text-muted mb-2 uppercase tracking-wider flex items-center gap-1">
                                    <Target size={12} className="text-primary"/> Buscadas (WANTED)
                                </h4>
                                <div className="grid grid-cols-3 gap-2">
                                    {([['todas', 'Todas'], ['solo', 'Solo WANTED'], ['ocultar', 'Ocultarlas']] as const).map(([modo, texto]) => (
                                        <button
                                            key={modo}
                                            onClick={() => dispatch({ type: 'SET_WANTED_MODE', payload: modo })}
                                            aria-pressed={wantedMode === modo}
                                            className={getItemClass(wantedMode === modo, false)}
                                        >
                                            {texto}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            )}

                            {/* 4. Subtypes Area (Conditional) */}
                            <AnimatePresence>
                                {(showMonsters || showSpells || showTraps) && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-3 rounded-xl space-y-3 bg-bg-panel/50 ring-1 ring-border-base">
                                            {showMonsters && (
                                                <div>
                                                    <h5 className="text-[10px] text-muted font-bold mb-2 uppercase">Categoría</h5>
                                                    <div className="flex flex-wrap gap-2">
                                                        {MONSTER_TYPES.map(type => (
                                                            <button key={type} onClick={() => handleMonsterTypeToggle(type)} className={getItemClass(filters.monsterTypes.includes(type), true)}>
                                                                {type}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {(showSpells || showTraps) && (
                                                <div>
                                                    <h5 className="text-[10px] text-muted font-bold mb-2 uppercase">Propiedad</h5>
                                                    <div className="flex flex-wrap gap-2">
                                                        {showSpells && SPELL_PROPS.map(prop => (
                                                            <button key={prop} onClick={() => handlePropertyToggle(prop)} className={getItemClass(filters.properties.includes(prop), true)}>{prop}</button>
                                                        ))}
                                                        {showTraps && TRAP_PROPS.map(prop => (
                                                            <button key={prop} onClick={() => handlePropertyToggle(prop)} className={getItemClass(filters.properties.includes(prop), true)}>{prop}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* 5. Dropdowns for Sets & Rarities */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border-base/30">
                                
                                {/* SETS DROPDOWN */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted uppercase tracking-wider flex items-center gap-1">
                                        <Layers size={12} className="text-primary"/> Sets ({availableSets.length})
                                    </label>
                                    <div className="relative">
                                        <button 
                                            onClick={() => toggleSection('sets')}
                                            className={getDropdownButtonClass(openSection === 'sets')}
                                        >
                                            <span className="truncate">
                                                {filters.sets.length > 0 ? `${filters.sets.length} Seleccionados` : 'Seleccionar Set...'}
                                            </span>
                                            {openSection === 'sets' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                        </button>
                                        
                                        <AnimatePresence>
                                            {openSection === 'sets' && (
                                                <motion.div 
                                                    initial={{ opacity: 0, y: 10, scale: 0.98 }} 
                                                    animate={{ opacity: 1, y: 0, scale: 1 }} 
                                                    exit={{ opacity: 0, y: 10, scale: 0.98 }} 
                                                    className="absolute top-full left-0 right-0 mt-2 bg-bg-panel ring-1 ring-border-base rounded-xl shadow-xl z-[100] max-h-[300px] overflow-hidden flex flex-col"
                                                >
                                                    <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                                                        {availableSets.length === 0 ? (
                                                            <div className="text-xs text-muted italic p-3 text-center">No hay sets disponibles.</div>
                                                        ) : (
                                                            availableSets.map(set => {
                                                                const isActive = filters.sets.includes(set);
                                                                return (
                                                                    <button
                                                                        key={set}
                                                                        onClick={() => handleSetToggle(set)}
                                                                        className={getDropdownOptionClass(isActive)}
                                                                    >
                                                                        {set}
                                                                        {isActive && <Tag size={12} />}
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* RARITIES DROPDOWN */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted uppercase tracking-wider flex items-center gap-1">
                                        <Diamond size={12} className="text-primary"/> Rarezas ({availableRarities.length})
                                    </label>
                                    <div className="relative">
                                        <button 
                                            onClick={() => toggleSection('rarities')}
                                            className={getDropdownButtonClass(openSection === 'rarities')}
                                        >
                                            <span className="truncate">
                                                {filters.rarities.length > 0 ? `${filters.rarities.length} Seleccionadas` : 'Seleccionar Rareza...'}
                                            </span>
                                            {openSection === 'rarities' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                        </button>
                                        
                                        <AnimatePresence>
                                            {openSection === 'rarities' && (
                                                <motion.div 
                                                    initial={{ opacity: 0, y: 10, scale: 0.98 }} 
                                                    animate={{ opacity: 1, y: 0, scale: 1 }} 
                                                    exit={{ opacity: 0, y: 10, scale: 0.98 }} 
                                                    className="absolute top-full left-0 right-0 mt-2 bg-bg-panel ring-1 ring-border-base rounded-xl shadow-xl z-[100] max-h-[300px] overflow-hidden flex flex-col"
                                                >
                                                    <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                                                        {availableRarities.length === 0 ? (
                                                            <div className="text-xs text-muted italic p-3 text-center">No hay rarezas disponibles.</div>
                                                        ) : (
                                                            availableRarities.map(rarity => {
                                                                const isActive = filters.rarities.includes(rarity);
                                                                return (
                                                                    <button
                                                                        key={rarity}
                                                                        onClick={() => handleRarityToggle(rarity)}
                                                                        className={getDropdownOptionClass(isActive)}
                                                                    >
                                                                        {rarity}
                                                                        {isActive && <Tag size={12} />}
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};