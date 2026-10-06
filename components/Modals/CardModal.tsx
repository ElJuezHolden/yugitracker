import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../context/StoreContext';
import type { ApiCard, Card, CardSet, CardCondition } from '../../types';
import { formatMoney, normalizeStr, generateId, getCardMarketLink, getCardMarketProductLink, getRarityColor, ID_ALL, getConditionMeta, analyzeCardType, CARD_BACK_IMG } from '../../utils';
import { getCardDetails } from '../../services/cardService';
import { CardMarketValue } from '../CardMarketValue';
import { useCardmarketPrices, usePrices } from '../../context/PricesContext';
import { printingKey, versionPrice } from '../../services/prices';
import { ExternalLink, Check, Loader2, Star, ShieldAlert, Target, Info, Calendar, Database, Sparkles, Search } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialApiCard?: ApiCard | null;
  existingCard?: Card | null;
  onCreateFolder: () => void;
  newFolderId?: string | null;
}

// Expanded Manual Rarity Options for Global Override
const MANUAL_RARITIES = [
    'Common',
    'Rare',
    'Super Rare',
    'Ultra Rare',
    'Secret Rare',
    'Platinum Secret Rare',
    'Quarter Century Secret Rare',
    'Ultimate Rare',
    'Collector\'s Rare',
    'Starlight Rare',
    'Ghost Rare',
    'Prismatic Secret Rare',
    'Gold Rare',
    'Premium Gold Rare'
];

export const CardModal: React.FC<Props> = ({ isOpen, onClose, initialApiCard, existingCard, onCreateFolder, newFolderId }) => {
  const { state, dispatch, toast } = useStore();
  const [apiData, setApiData] = useState<ApiCard | null>(null);
  const preciosCardmarket = useCardmarketPrices(apiData?.id);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Submission State to prevent dupes
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [selectedImg, setSelectedImg] = useState('');
  const [customImg, setCustomImg] = useState('');
  const [selectedSet, setSelectedSet] = useState<CardSet | null>(null);
  const [manualRarity, setManualRarity] = useState<string>(''); // For Manual Override
  /** Filtro del selector de versión: hay cartas con más de 70. */
  const [filtroVersion, setFiltroVersion] = useState('');
  const { rate, metric } = usePrices();

  const [formData, setFormData] = useState({
    paid: '',
    lang: 'ES',
    condition: 'NM',
    tags: '',
    obs: '',
    is1st: true,
    isLimited: false,
    isWanted: false,
    moveToFolder: ''
  });

  const conditions = ['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'];
  const MAX_OBS = 140;

  // Load Data
  useEffect(() => {
    const load = async () => {
      if (!isOpen) return;
      setLoading(true);
      setShowDeleteConfirm(false);
      setFiltroVersion('');
      setIsSubmitting(false);

      let data = initialApiCard;
      
      // If editing, fetch fresh details to get all arts/sets
      if (existingCard) {
        setFormData({
            paid: existingCard.paid ? existingCard.paid.toString() : '',
            lang: existingCard.lang,
            condition: existingCard.condition,
            tags: existingCard.tags.map(t => t.replace('#','')).join(' '),
            obs: existingCard.obs,
            is1st: existingCard.is1st,
            isLimited: existingCard.isLimited || false,
            isWanted: existingCard.isWanted || false,
            moveToFolder: existingCard.folderId
        });
        setSelectedImg(existingCard.img);
        
        const details = await getCardDetails(existingCard.name);
        if (details) {
            data = details;
             // Match set
            const foundSet = details.card_sets?.find(s => s.set_code === existingCard.setCode && s.set_rarity_code === existingCard.rarityCode);
            setSelectedSet(foundSet || null);
            
            // Check if existing card has a rarity that matches the override list but might not be in the default set info
            // If the saved rarity is different from the set's default, populate manualRarity
            if (foundSet && existingCard.rarity !== foundSet.set_rarity) {
                setManualRarity(existingCard.rarity);
            } else {
                setManualRarity('');
            }
            
            // If image is not in api list, check if it matches custom logic
            setCustomImg(''); 
            const isApiImg = details.card_images.some(i => i.image_url === existingCard.img);
            if (!isApiImg) {
                const history = state.db.customArts?.[details.id] || [];
                if (!history.includes(existingCard.img)) {
                    setCustomImg(existingCard.img);
                }
            }

        } else {
             // Fallback
             data = { 
                id: existingCard.apiId, 
                name: existingCard.name, 
                type: existingCard.type, 
                race: '', // fallback
                frameType: 'unknown',
                desc: '',
                card_images: [{ id: 0, image_url: existingCard.img, image_url_small: existingCard.img, image_url_cropped: existingCard.img }] 
             } as ApiCard;
        }
      } else if (initialApiCard) {
          // OPTIMIZATION: If search results already provided misc_info, do NOT re-fetch.
          // This fixes the "double check" lag when selecting a card.
          if (initialApiCard.misc_info && initialApiCard.misc_info.length > 0) {
              data = initialApiCard;
          } else {
              // Only fallback to fetch if the initial data is incomplete (should be rare with updated search service)
              const fullDetails = await getCardDetails(initialApiCard.name);
              data = fullDetails || initialApiCard;
          }

          const defaultFolder = (state.ui.activeFolderId && state.ui.activeFolderId !== ID_ALL) 
            ? state.ui.activeFolderId 
            : '';

          setFormData({
            paid: '',
            lang: 'ES',
            condition: 'NM',
            tags: '',
            obs: '',
            is1st: true,
            isLimited: false,
            isWanted: false,
            moveToFolder: defaultFolder
          });
          setSelectedImg(data.card_images[0].image_url);
          setCustomImg('');
          setManualRarity('');
          if (data.card_sets && data.card_sets.length > 0) {
              setSelectedSet(data.card_sets[0]);
          } else {
              setSelectedSet(null);
          }
      }

      setApiData(data || null);
      setLoading(false);
    };
    // Si la API falla, el modal se quedaba girando para siempre sin decir nada.
    load().catch((e: unknown) => {
      console.error('No se pudieron cargar los datos de la carta:', e);
      toast('No se pudieron cargar los datos de la carta.', 'err');
      setLoading(false);
    });
  }, [isOpen, initialApiCard, existingCard, toast]);

  // Listen for new folders created from the FolderModal
  useEffect(() => {
    if (newFolderId) {
        setFormData(prev => ({ ...prev, moveToFolder: newFolderId }));
    }
  }, [newFolderId]);

  const handleSave = () => {
    if (!apiData || isSubmitting) return;
    
    // Validate folder
    let targetFolder = formData.moveToFolder;
    if (!targetFolder || targetFolder === ID_ALL) {
        if (state.ui.activeFolderId && state.ui.activeFolderId !== ID_ALL) {
            targetFolder = state.ui.activeFolderId;
        } else {
            return toast("Selecciona una carpeta válida", "err");
        }
    }

    setIsSubmitting(true);

    const finalImg = customImg.length > 10 ? customImg : selectedImg;
    const tagsArr = formData.tags.split(' ').filter(t => t.trim().length > 0).map(t => t.startsWith('#') ? t : '#'+t);

    if (formData.isWanted) {
        if (!tagsArr.includes('#wanted')) tagsArr.push('#wanted');
    }

    if (customImg.length > 10) {
        dispatch({ type: 'REGISTER_CUSTOM_ART', payload: { apiId: apiData.id, url: customImg } });
    }

    const { cardType, monsterType, property } = analyzeCardType(apiData.type, apiData.race);

    // Rarity Logic: Use manual override if set, otherwise selectedSet defaults
    const finalRarity = manualRarity || (selectedSet?.set_rarity || 'Common');

    const cardData: Card = {
        uid: existingCard ? existingCard.uid : generateId(),
        folderId: targetFolder,
        apiId: apiData.id,
        name: apiData.name,
        name_en: existingCard?.name_en,
        type: apiData.type,
        img: finalImg,
        paid: formData.isWanted ? 0 : (parseFloat(formData.paid) || 0),
        lang: formData.lang,
        condition: formData.isWanted ? 'NM' : (formData.condition as CardCondition),
        obs: formData.obs.substring(0, MAX_OBS), 
        tags: tagsArr,
        is1st: formData.isWanted ? false : formData.is1st,
        isLimited: formData.isWanted ? false : formData.isLimited,
        isWanted: formData.isWanted,
        setCode: (formData.isWanted || !selectedSet) ? '---' : selectedSet.set_code,
        rarity: (formData.isWanted || !selectedSet) ? 'Common' : finalRarity,
        rarityCode: (formData.isWanted || !selectedSet) ? 'C' : selectedSet.set_rarity_code,
        cardType,
        monsterType,
        property
    };

    if (existingCard) {
        dispatch({ type: 'UPDATE_CARD', payload: cardData });
        toast("Carta actualizada");
    } else {
        dispatch({ type: 'ADD_CARD', payload: cardData });
        toast("Carta añadida");
    }

    onClose();
  };

  const handleDelete = () => {
    if (!existingCard) return;
    
    const cardToDelete = existingCard;
    const index = state.db.cards.findIndex(c => c.uid === cardToDelete.uid);

    dispatch({ type: 'DELETE_CARD', payload: cardToDelete.uid });
    
    toast("Carta eliminada", "ok", () => {
        dispatch({ type: 'RESTORE_CARD', payload: { card: cardToDelete, index } });
        toast("Carta restaurada");
    });
    onClose();
  };

  const setEdition = (mode: '1st' | 'limited' | 'none') => {
      if (mode === '1st') setFormData(prev => ({ ...prev, is1st: true, isLimited: false }));
      else if (mode === 'limited') setFormData(prev => ({ ...prev, is1st: false, isLimited: true }));
      else setFormData(prev => ({ ...prev, is1st: false, isLimited: false }));
  };

  
  // LOGIC TO DEDUPLICATE IMAGES
  // 1. Official API Images (Remove duplicates based on URL)
  const uniqueOfficialImages = useMemo(() => {
    if (!apiData?.card_images) return [];
    return apiData.card_images.filter((img, index, self) => 
        index === self.findIndex((t) => t.image_url === img.image_url)
    );
  }, [apiData]);

  // 2. Custom History Arts (Remove if it exists in Official Images)
  const uniqueHistoryArts = useMemo(() => {
    const rawHistory = apiData ? (state.db.customArts?.[apiData.id] || []) : [];
    return rawHistory.filter(url => 
        !uniqueOfficialImages.some(official => official.image_url === url)
    );
  }, [apiData, state.db.customArts, uniqueOfficialImages]);

  const isValidSelection = formData.moveToFolder && formData.moveToFolder !== ID_ALL && state.db.folders.some(f => f.id === formData.moveToFolder);
  const selectValue = isValidSelection ? formData.moveToFolder : '';
  
  // Versiones que casan con el filtro (la elegida no se esconde nunca).
  const versionesVisibles = useMemo(() => {
    const sets = apiData?.card_sets ?? [];
    const q = normalizeStr(filtroVersion.trim());
    if (!q) return sets;
    return sets.filter(s => s === selectedSet || normalizeStr(`${s.set_code} ${s.set_name} ${s.set_rarity}`).includes(q));
  }, [apiData, filtroVersion, selectedSet]);

  // Producto de Cardmarket de la versión elegida, para enlazar directamente a su página.
  const idProductoElegido = selectedSet
    ? preciosCardmarket.productos[printingKey(selectedSet.set_code, selectedSet.set_rarity)] ?? null
    : null;

  // Extract Misc Info for Beta/Dates
  const misc = apiData?.misc_info?.[0];
  const isBeta = misc?.beta_id != null;
  const releaseDate = misc?.tcg_date || misc?.ocg_date;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-4xl xl:max-w-[1360px] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] bg-bg-surface border border-border-base rounded-2xl shadow-2xl flex flex-col my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border-base flex justify-between items-center bg-bg-panel rounded-t-2xl">
            <div className="flex flex-col min-w-0">
                <h3 className="font-bold text-lg text-main truncate pr-4">{apiData?.name || 'Carta'}</h3>
                {isBeta && <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider flex items-center gap-1"><Info size={10}/> BETA / UNSTABLE DATA</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {misc?.konami_id && (
                    <span className="hidden sm:flex items-center gap-1 text-[10px] bg-bg-surface px-2 py-1 rounded text-muted border border-border-base font-mono">
                        <Database size={10} /> ID: {misc.konami_id}
                    </span>
                )}
                {/* Cardmarket: todas las versiones de la carta, o solo la elegida */}
                <div className="flex items-stretch rounded overflow-hidden text-xs font-bold text-white bg-[#00b4e2]">
                    <span className="px-2.5 py-1.5 bg-[#0098c0] hidden sm:flex items-center">Cardmarket</span>
                    <a
                        href={apiData ? getCardMarketLink(apiData.name) : '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-[#009ac0] transition-colors"
                        title="Todas las versiones de la carta en Cardmarket"
                    >
                        Todas <ExternalLink size={11} />
                    </a>
                    {idProductoElegido != null && (
                        <a
                            href={getCardMarketProductLink(idProductoElegido)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 border-l border-white/25 hover:bg-[#009ac0] transition-colors"
                            title={`Solo ${selectedSet?.set_code} · ${selectedSet?.set_rarity} en Cardmarket`}
                        >
                            Esta versión <ExternalLink size={11} />
                        </a>
                    )}
                </div>
            </div>
        </div>

        {/* Body: en pantallas anchas, tres columnas (carta | datos de tu copia | valor de mercado) */}
        <div className="p-4 sm:p-6 xl:py-4 overflow-y-auto flex-1 min-h-0">
            {loading ? <div className="p-10 text-center text-main">Cargando datos v7...</div> : (
                <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_minmax(0,390px)] gap-6 items-start">

                    {/* Columna 1: la carta y sus artes (en el móvil, los artes van al final) */}
                    <div className="contents md:flex md:flex-col md:gap-4">
                        <img 
                            src={customImg || selectedImg || CARD_BACK_IMG} 
                            className={`w-full max-w-[170px] mx-auto md:max-w-none rounded-xl shadow-2xl aspect-[421/614] object-cover ${formData.isWanted ? 'grayscale brightness-90' : ''}`}
                            alt="Preview"
                        />
                         {releaseDate && (
                            <div className="order-2 md:order-none flex items-center justify-center gap-1.5 text-xs text-muted bg-bg-panel p-2 rounded-lg border border-border-base">
                                <Calendar size={12} /> Lanzamiento: <span className="text-main font-bold">{releaseDate}</span>
                            </div>
                        )}

                        <div className="order-2 md:order-none bg-bg-panel p-3 rounded-lg border border-border-base">
                            <label className="text-xs text-muted block mb-2">Variaciones de Arte ({uniqueOfficialImages.length + uniqueHistoryArts.length})</label>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mask-fade-r">
                                {uniqueOfficialImages.map(img => (
                                    <img 
                                        key={img.id}
                                        src={img.image_url_small}
                                        onClick={() => { setSelectedImg(img.image_url); setCustomImg(''); }}
                                        className={`w-12 h-16 object-cover rounded cursor-pointer transition-all border-2 ${selectedImg === img.image_url && !customImg ? 'border-primary opacity-100' : 'border-transparent opacity-50 hover:opacity-80'}`}
                                        alt="Official Art"
                                        title={`ID: ${img.id}`}
                                    />
                                ))}
                                {uniqueHistoryArts.length > 0 && <div className="w-[1px] bg-border-base mx-1 shrink-0" />}
                                {uniqueHistoryArts.map((url, idx) => (
                                    <img 
                                        key={`hist-${idx}`}
                                        src={url}
                                        onClick={() => { setSelectedImg(url); setCustomImg(''); }}
                                        className={`w-12 h-16 object-cover rounded cursor-pointer transition-all border-2 border-purple-500/50 ${selectedImg === url && !customImg ? 'ring-2 ring-purple-500 opacity-100' : 'opacity-50 hover:opacity-80'}`}
                                        alt="Custom"
                                        title="Arte Custom"
                                    />
                                ))}
                            </div>
                            <input 
                                type="text" 
                                value={customImg}
                                onChange={e => setCustomImg(e.target.value)}
                                placeholder="URL Imagen Custom..."
                                className="w-full bg-bg-surface text-main text-xs border border-border-base rounded p-2 mt-2 focus:border-primary focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Columna 2: los datos de tu copia, empezando por la versión */}
                    <div className="order-1 space-y-4 min-w-0">

                        {/* Carpeta y "buscada", en una sola fila */}
                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
                            <div>
                                <div className="text-xs text-primary mb-1">
                                    {existingCard ? '📍 Mover a otra carpeta' : '📍 Carpeta destino'}
                                </div>
                                <select 
                                    value={selectValue}
                                    onChange={e => {
                                        if (e.target.value === '__NEW__') {
                                            onCreateFolder();
                                        } else {
                                            setFormData({...formData, moveToFolder: e.target.value});
                                        }
                                    }}
                                    className="w-full bg-bg-surface border border-border-base rounded p-2 text-sm text-main focus:border-primary outline-none"
                                >
                                    <option value="" disabled>Seleccionar carpeta</option>
                                    <option value="__NEW__" className="font-bold text-primary bg-bg-surface">+ Crear Nueva Carpeta...</option>
                                    <option disabled>────────────────</option>
                                    {state.db.folders.filter(f => f.id !== ID_ALL).map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={() => setFormData(prev => ({ ...prev, isWanted: !prev.isWanted }))}
                                className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-bold border transition-all flex items-center justify-center gap-1.5 ${
                                    formData.isWanted
                                        ? 'bg-red-500/20 border-red-500 text-red-500 shadow-lg shadow-red-900/20' 
                                        : 'bg-bg-surface border-border-base text-muted hover:bg-main/5 hover:text-main'
                                }`}
                            >
                                <Target size={16} className={formData.isWanted ? "fill-red-500" : ""} /> 
                                {formData.isWanted ? 'WANTED (Buscada)' : 'Marcar como WANTED'}
                            </button>
                        </div>

                        <AnimatePresence>
                            {!formData.isWanted && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-4 overflow-hidden"
                                >
                                    {/* Tu versión: set y rareza, con su precio */}
                                    <div>
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                            <label className="text-primary font-bold text-sm">
                                                Tu versión
                                                {apiData?.card_sets && <span className="text-muted font-normal text-xs"> · {apiData.card_sets.length} en total</span>}
                                            </label>
                                            {(apiData?.card_sets?.length ?? 0) > 8 && (
                                                <div className="relative w-full sm:w-64">
                                                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                                                    <input
                                                        type="text"
                                                        value={filtroVersion}
                                                        onChange={e => setFiltroVersion(e.target.value)}
                                                        placeholder="Busca código, set o rareza…"
                                                        className="w-full bg-bg-panel border border-border-base text-main rounded-md pl-8 pr-2 py-1.5 text-xs focus:border-primary outline-none"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 max-h-60 overflow-y-auto bg-bg-panel p-2 rounded-lg border border-border-base">
                                            {apiData?.card_sets ? versionesVisibles.map((set, idx) => (
                                                <div 
                                                    key={`${set.set_code}-${idx}`}
                                                    onClick={() => {
                                                        setSelectedSet(set);
                                                        // Reset manual rarity to ensure clean state on switch
                                                        setManualRarity('');
                                                    }}
                                                    title={set.set_name}
                                                    className={`p-2 rounded cursor-pointer text-center border transition-all flex flex-col justify-center min-h-[50px] ${
                                                        selectedSet === set 
                                                            ? 'bg-primary/10 border-primary' 
                                                            : 'bg-bg-surface border-transparent hover:bg-main/5'
                                                    }`}
                                                >
                                                    <div className="font-bold text-xs text-main">{set.set_code}</div>
                                                    <div className="text-[10px]" style={{ color: getRarityColor(set.set_rarity) }}>
                                                        {set.set_rarity}
                                                    </div>
                                                    <div className="text-[10px] text-muted font-semibold mt-0.5">
                                                        {(() => { const v = versionPrice(preciosCardmarket.precios, set, rate, metric); return v ? `≈ ${formatMoney(v.eur)}${v.deTcgplayer ? '*' : ''}` : '—'; })()}
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="col-span-full text-center text-muted text-xs py-4">Sin Sets (OCG/Promo/Beta)</div>
                                            )}
                                            {apiData?.card_sets && versionesVisibles.length === 0 && (
                                                <div className="col-span-full text-center text-muted text-xs py-4">Ninguna versión coincide con «{filtroVersion}»</div>
                                            )}
                                        </div>

                                        {/* Rareza a mano, por si la de tu carta no es la oficial */}
                                        {selectedSet && (
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <span className="text-xs text-muted flex items-center gap-1.5">
                                                    <Sparkles size={13} className="text-primary" /> ¿Otra rareza?
                                                </span>
                                                <select
                                                    value={manualRarity}
                                                    onChange={(e) => setManualRarity(e.target.value)}
                                                    title="Úsalo si la rareza de tu carta no coincide con la lista oficial"
                                                    className="flex-1 min-w-[180px] bg-bg-panel border border-border-base text-main rounded p-1.5 text-xs focus:border-primary outline-none"
                                                >
                                                    <option value="">{selectedSet.set_rarity} (Oficial)</option>
                                                    <option disabled>──────────</option>
                                                    {MANUAL_RARITIES.map(r => (
                                                        <option key={r} value={r}>{r}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    {/* Idioma y lo pagado */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-muted block mb-1">Idioma</label>
                                            <select 
                                                value={formData.lang}
                                                onChange={e => setFormData({...formData, lang: e.target.value})}
                                                className="w-full bg-bg-panel border border-border-base text-main rounded p-2 text-sm focus:border-primary outline-none"
                                            >
                                                <option value="ES">Español</option>
                                                <option value="EN">Inglés</option>
                                                <option value="JP">Japonés</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-muted block mb-1">Lo que pagaste (opcional)</label>
                                            <input 
                                                type="number" 
                                                step="0.01"
                                                min="0"
                                                value={formData.paid}
                                                onChange={e => setFormData({...formData, paid: e.target.value})}
                                                className="w-full bg-bg-panel border border-border-base text-main rounded p-2 text-sm focus:border-primary outline-none"
                                                placeholder="Sin apuntar"
                                                title="Solo se usa en esta ficha, para compararlo con su valor actual"
                                            />
                                        </div>
                                    </div>

                                    {/* Condition Selector */}
                                    <div>
                                         <label className="text-xs font-medium text-muted block mb-2">Estado</label>
                                         <div className="flex flex-wrap gap-2">
                                            {conditions.map(cond => {
                                                const meta = getConditionMeta(cond);
                                                const isSelected = formData.condition === cond;
                                                return (
                                                    <button
                                                        key={cond}
                                                        onClick={() => setFormData({...formData, condition: cond as CardCondition})}
                                                        className={`flex-1 min-w-[50px] py-2 rounded-lg text-sm font-bold border transition-all ${
                                                            isSelected 
                                                                ? 'bg-opacity-20 text-main shadow-lg' 
                                                                : 'bg-bg-panel border-transparent text-muted hover:bg-main/5 hover:text-main'
                                                        }`}
                                                        style={{ 
                                                            backgroundColor: isSelected ? `${meta.color}20` : undefined, 
                                                            borderColor: isSelected ? meta.color : 'transparent',
                                                            color: isSelected ? meta.color : undefined
                                                        }}
                                                    >
                                                        {meta.label}
                                                    </button>
                                                );
                                            })}
                                         </div>
                                    </div>

                                    {/* Edition Selector */}
                                    <div>
                                        <label className="text-xs font-medium text-muted block mb-2">Edición</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => setEdition('1st')}
                                                className={`py-2 rounded-lg text-sm font-bold border transition-all flex items-center justify-center gap-1 ${
                                                    formData.is1st 
                                                        ? 'bg-primary/20 border-primary text-primary' 
                                                        : 'bg-bg-panel border-transparent text-muted hover:bg-main/5 hover:text-main'
                                                }`}
                                            >
                                                <Star size={14} className={formData.is1st ? "fill-primary" : ""} /> 1st Edition
                                            </button>
                                            
                                            <button
                                                onClick={() => setEdition('limited')}
                                                className={`py-2 rounded-lg text-sm font-bold border transition-all flex items-center justify-center gap-1 ${
                                                    formData.isLimited 
                                                        ? 'bg-blue-400/20 border-blue-400 text-blue-400' 
                                                        : 'bg-bg-panel border-transparent text-muted hover:bg-main/5 hover:text-main'
                                                }`}
                                            >
                                                <ShieldAlert size={14} className={formData.isLimited ? "fill-blue-400" : ""} /> Limited
                                            </button>

                                            <button
                                                onClick={() => setEdition('none')}
                                                className={`py-2 rounded-lg text-sm font-bold border transition-all ${
                                                    !formData.is1st && !formData.isLimited
                                                        ? 'bg-main/10 border-main/50 text-main' 
                                                        : 'bg-bg-panel border-transparent text-muted hover:bg-main/5 hover:text-main'
                                                }`}
                                            >
                                                Unlimited
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Etiquetas y notas */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-medium text-muted block mb-1">Etiquetas</label>
                            <input 
                                type="text"
                                value={formData.tags}
                                onChange={e => setFormData({...formData, tags: e.target.value})}
                                placeholder="dupe vendible staple..."
                                className="w-full bg-bg-panel border border-border-base text-main rounded p-2 text-sm focus:border-primary outline-none"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-medium text-muted">Notas</label>
                                <span className={`text-[10px] font-mono transition-colors ${
                                    (MAX_OBS - formData.obs.length) <= 20 ? 'text-red-500 font-bold' : 'text-muted'
                                }`}>
                                    {MAX_OBS - formData.obs.length}
                                </span>
                            </div>
                            <textarea 
                                value={formData.obs}
                                onChange={e => setFormData({...formData, obs: e.target.value})}
                                maxLength={MAX_OBS}
                                className={`w-full bg-bg-panel border rounded p-2 text-sm text-main focus:border-primary outline-none h-[38px] focus:h-24 resize-none transition-colors ${
                                    (MAX_OBS - formData.obs.length) <= 0 ? 'border-red-500/50' : 'border-border-base'
                                }`}
                                placeholder="Ej: Daño leve en esquinas..."
                            />
                        </div>

                        </div>
                    </div>

                    {/* Columna 3: valor de mercado (debajo del formulario si no hay sitio) */}
                    {apiData && (
                        <div className="order-3 min-w-0 md:col-start-2 xl:col-start-auto xl:sticky xl:top-0">
                            <CardMarketValue
                                cardId={apiData.id}
                                sets={apiData.card_sets}
                                selected={selectedSet}
                                paid={formData.isWanted ? 0 : parseFloat(formData.paid) || 0}
                                condition={formData.isWanted ? undefined : formData.condition}
                                onSelect={(set) => { setSelectedSet(set); setManualRarity(''); }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-border-base bg-bg-panel flex justify-between gap-2 sm:gap-3 rounded-b-2xl">
             {existingCard ? (
                 showDeleteConfirm ? (
                    <div className="flex items-center gap-2 animate-fadeIn">
                        <span className="text-xs text-red-400 font-bold hidden sm:block">¿Seguro?</span>
                        <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-2 rounded-lg bg-bg-surface text-main text-xs hover:bg-main/10">Cancelar</button>
                        <button onClick={handleDelete} className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-500">
                             Sí, eliminar
                        </button>
                    </div>
                 ) : (
                    <button onClick={() => setShowDeleteConfirm(true)} className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 font-semibold text-sm transition-colors border border-red-500/20">
                        Eliminar
                    </button>
                 )
            ) : <div />}
            <div className="flex gap-2 sm:gap-3">
                <button onClick={onClose} className="px-4 py-2 rounded-lg bg-bg-surface hover:bg-main/10 text-main text-sm font-semibold transition-colors border border-border-base">Cancelar</button>
                <button 
                    onClick={handleSave} 
                    disabled={isSubmitting}
                    className="px-4 sm:px-6 py-2 rounded-lg bg-primary hover:brightness-110 disabled:brightness-75 disabled:cursor-not-allowed text-black text-sm font-bold transition-transform active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-2"
                >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} 
                    Confirmar
                </button>
            </div>
        </div>

      </motion.div>
    </div>
  );
};