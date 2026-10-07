import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { searchCards, MIN_QUERY_LENGTH } from '../../services/cardService';
import type { ApiCard, MainCardType, MonsterType, CardProperty } from '../../types';
import { analyzeCardType, getRarityWeight, CARD_BACK_IMG } from '../../utils';
import { Search, Loader2, X, Filter } from 'lucide-react';
import { CardFilter } from '../CardFilter';

/** Resultados que se enseñan al principio; el resto, con "Ver todos". */
const MOSTRAR_PRIMERO = 50;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (card: ApiCard) => void;
}

interface FilterState {
    cardTypes: MainCardType[];
    monsterTypes: MonsterType[];
    properties: CardProperty[];
    sets: string[];
    rarities: string[];
}

export const SearchModal: React.FC<Props> = ({ isOpen, onClose, onSelect }) => {
  const [results, setResults] = useState<ApiCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** "Ver todos" de una búsqueda concreta: con otra búsqueda vuelve a mostrar las primeras. */
  const [verTodosDe, setVerTodosDe] = useState<ApiCard[] | null>(null);
  const verTodos = verTodosDe === results;
  // Cambiar este número obliga a repetir la búsqueda con el mismo texto.
  const [retryToken, setRetryToken] = useState(0);
  
  // Filter State
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
      cardTypes: [],
      monsterTypes: [],
      properties: [],
      sets: [],
      rarities: []
  });

  /*
   * El retardo se creaba dentro del cuerpo del componente, así que se rehacía
   * en cada render y su `clearTimeout` no cancelaba el anterior: salía una
   * petición por cada tecla pulsada. Como YGOPRODeck bloquea una hora al pasar
   * de 20 peticiones por segundo, era un problema de verdad y no solo de
   * eficiencia.
   *
   * Ahora el temporizador y la petición en curso se cancelan al cambiar el
   * texto, de modo que solo sobrevive la última: de paso se evita que una
   * respuesta lenta pise a otra más reciente.
   */
  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      searchCards(trimmed, controller.signal)
        .then((data) => {
          setResults(data);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setError(e instanceof Error ? e.message : 'No se pudo completar la búsqueda.');
          setLoading(false);
        });
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, retryToken]);

  // Cerrar con Escape, como cualquier diálogo.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // 1. Derive Available Options from Search Results
  const { availableSets, availableRarities } = useMemo(() => {
      const sets = new Set<string>();
      const rarities = new Set<string>();

      results.forEach(card => {
          if (card.card_sets) {
              card.card_sets.forEach(s => {
                  const prefix = s.set_code.split('-')[0];
                  sets.add(prefix);
                  rarities.add(s.set_rarity);
              });
          }
      });

      return {
          availableSets: Array.from(sets).sort(),
          availableRarities: Array.from(rarities).sort((a, b) => {
              const wA = getRarityWeight(a);
              const wB = getRarityWeight(b);
              if (wA !== wB) return wB - wA;
              return a.localeCompare(b);
          })
      };
  }, [results]);

  // 2. Filter Results
  const filteredResults = useMemo(() => {
      if (filters.cardTypes.length === 0 && 
          filters.monsterTypes.length === 0 && 
          filters.properties.length === 0 && 
          filters.sets.length === 0 && 
          filters.rarities.length === 0) {
          return results;
      }

      return results.filter(card => {
          // Analyze Type on the fly for API cards
          const { cardType, monsterType, property } = analyzeCardType(card.type, card.race);

          // A. Type Filters
          if (filters.cardTypes.length > 0 && !filters.cardTypes.includes(cardType)) return false;
          
          if (cardType === 'Monster' && filters.monsterTypes.length > 0) {
              if (!monsterType || !filters.monsterTypes.includes(monsterType)) return false;
          }
          
          if ((cardType === 'Spell' || cardType === 'Trap') && filters.properties.length > 0) {
               if (!property || !filters.properties.includes(property)) return false;
          }

          // B. Set & Rarity Filters (Check if ANY of the card's sets match)
          if (filters.sets.length > 0 || filters.rarities.length > 0) {
              if (!card.card_sets) return false; // If no sets, cannot match set/rarity filters
              
              const matchesSet = filters.sets.length === 0 || card.card_sets.some(s => filters.sets.includes(s.set_code.split('-')[0]));
              const matchesRarity = filters.rarities.length === 0 || card.card_sets.some(s => filters.rarities.includes(s.set_rarity));
              
              if (!matchesSet || !matchesRarity) return false;
          }

          return true;
      });
  }, [results, filters]);

  const activeFilterCount = filters.cardTypes.length + filters.monsterTypes.length + filters.properties.length + filters.sets.length + filters.rarities.length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[115] flex items-start pt-10 sm:pt-20 justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.98 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-buscar-carta"
        // Sin esto, pinchar dentro del panel cerraría el modal por el clic del fondo.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-bg-surface border border-border-base rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="p-4 border-b border-border-base flex items-center justify-between shrink-0 bg-bg-panel rounded-t-2xl">
            <h3 id="titulo-buscar-carta" className="font-bold text-lg text-main">Añadir Carta</h3>
            <button onClick={onClose} aria-label="Cerrar" className="p-1 hover:bg-main/10 rounded text-main/70 hover:text-main"><X size={20} /></button>
        </div>

        <div className="p-4 shrink-0 space-y-1 bg-bg-surface z-50">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-main/50" size={20} />
                    <input 
                        autoFocus
                        type="text" 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`Nombre en español o inglés, o número de la carta (mín. ${MIN_QUERY_LENGTH} letras)...`}
                        aria-label="Buscar carta por nombre"
                        className="w-full bg-bg-panel border border-border-base text-main rounded-xl pl-10 pr-4 py-3 text-lg focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder-main/30"
                    />
                </div>
                <button
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={`px-3 sm:px-4 rounded-xl transition-colors flex items-center gap-2 border ${
                        isFilterOpen || activeFilterCount > 0 
                            ? 'bg-primary text-black border-primary hover:bg-primary/90' 
                            : 'bg-bg-panel text-main/60 border-border-base hover:text-main hover:bg-main/10'
                    }`}
                    title="Filtrar resultados"
                >
                    <Filter size={20} />
                    {activeFilterCount > 0 && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isFilterOpen ? 'bg-black text-primary' : 'bg-primary text-black border border-black/20'}`}>
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>

            <CardFilter 
                filters={filters}
                onChange={setFilters}
                isOpen={isFilterOpen}
                availableSets={availableSets}
                availableRarities={availableRarities}
            />
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-bg-surface/50 rounded-b-2xl">
            {error ? (
                <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                    <p className="text-red-400 text-sm">{error}</p>
                    <button
                        onClick={() => setRetryToken((t) => t + 1)}
                        className="text-xs font-bold text-primary hover:underline"
                    >
                        Reintentar
                    </button>
                </div>
            ) : loading ? (
                <div className="flex flex-col items-center justify-center py-10 text-main/50">
                    <Loader2 className="animate-spin mb-2" size={30} />
                    <p>Consultando base de datos...</p>
                </div>
            ) : filteredResults.length === 0 && query.trim().length >= MIN_QUERY_LENGTH ? (
                 <div className="text-center py-10 text-main/50">
                    {results.length > 0 ? (
                        'No hay cartas que coincidan con los filtros.'
                    ) : (
                        <>
                            <p>No se encontraron resultados.</p>
                            <p className="mt-2 text-xs text-main/40">
                                Prueba con el nombre en inglés o en español, o con el número de la carta (las 8 cifras de abajo a la
                                izquierda), que es igual en todos los idiomas.
                            </p>
                        </>
                    )}
                 </div>
            ) : filteredResults.length === 0 ? (
                <div className="text-center py-10 text-main/30 text-sm">
                    Escribe el nombre de la carta para empezar.
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {(verTodos ? filteredResults : filteredResults.slice(0, MOSTRAR_PRIMERO)).map(card => (
                        <div 
                            key={card.id}
                            onClick={() => onSelect(card)}
                            className="flex items-center gap-4 p-2.5 hover:bg-main/5 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-border-base"
                        >
                            {/* SAFE IMAGE ACCESS */}
                            <img 
                                src={card.card_images?.[0]?.image_url_small || CARD_BACK_IMG} 
                                loading="lazy"
                                className="w-10 h-14 object-cover rounded shadow-sm bg-black/20" 
                                alt="" 
                            />
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-main truncate">{card.name_es ?? card.name}</div>
                                {card.name_es && card.name_es !== card.name && (
                                    <div className="text-xs text-muted truncate">{card.name}</div>
                                )}
                                <div className="text-xs text-primary truncate opacity-80">
                                    {card.type}
                                    {/* Con una sola impresión (las fichas sin nombre propio), cuál es: si no, todas se verían iguales. */}
                                    {card.card_sets?.length === 1 && <span className="text-muted"> · {card.card_sets[0]!.set_code} · {card.card_sets[0]!.set_name}</span>}
                                </div>
                            </div>
                            {card.card_sets && (
                                <div className="text-[10px] text-muted font-mono hidden sm:block text-right">
                                    {card.card_sets.length} impresiones
                                </div>
                            )}
                        </div>
                    ))}
                    {!verTodos && filteredResults.length > MOSTRAR_PRIMERO && (
                        <button
                            type="button"
                            onClick={() => setVerTodosDe(results)}
                            className="mx-auto my-2 px-4 py-2 rounded-xl bg-main/5 hover:bg-main/10 text-sm font-semibold text-main transition-colors"
                        >
                            Ver los {filteredResults.length} resultados
                            <span className="block text-[11px] font-normal text-muted">Se ven {MOSTRAR_PRIMERO}; afina la búsqueda o usa los filtros para ir más rápido</span>
                        </button>
                    )}
                </div>
            )}
        </div>
      </motion.div>
    </div>
  );
};