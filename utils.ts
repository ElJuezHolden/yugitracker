import type React from 'react';
import type { MainCardType, MonsterType, CardProperty } from './types';

export const ID_ALL = 'ALL_CARDS_SYSTEM';

/** Reverso de carta: portada por defecto y recambio si una imagen no carga. */
export const CARD_BACK_IMG = 'https://images.ygoprodeck.com/images/cards/back_high.jpg';

/**
 * Si la imagen de una carta falla (enlace roto, arte personalizado que ya no
 * existe, sin conexión) se pone el reverso en su lugar. Sin esto quedaba un
 * hueco vacío y la cuadrícula se descuadraba.
 */
export const onCardImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (img.src === CARD_BACK_IMG) return; // Evita un bucle si el reverso tampoco carga.
  img.src = CARD_BACK_IMG;
};

/**
 * Identificador único de carta o carpeta.
 *
 * Antes eran 9 caracteres de `Math.random()`, que con una colección grande
 * acaba repitiendo alguno: dos cartas con el mismo id se pisan al editar y se
 * borran juntas. `randomUUID` lo descarta y está disponible en cualquier
 * navegador actual sirviendo por HTTPS o en localhost; el resto cae al método
 * antiguo, pero con el doble de entropía.
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
};

export const formatMoney = (val: number): string => {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);
};

/**
 * Compara nombres en orden natural: "Number 2" antes que "Number 10", y sin
 * distinguir mayúsculas ni tildes. Ordenar como texto puro ponía el 10 tras el 1.
 */
export const compareNames = new Intl.Collator('es', { numeric: true, sensitivity: 'base' }).compare;

/**
 * Orden por número dentro del set: primero el set (LART, MP22…) y luego el
 * número final del código, sin mirar el idioma (LART-SP001 antes que
 * LART-EN029; LOB-E099 y LOB-EN099 empatan). Las que no tienen versión, al final.
 */
export function compareSetNumber(a: string, b: string): number {
  const partes = (code: string) => {
    if (!code || code === '---') return null;
    const [prefijo = '', resto = ''] = code.toUpperCase().split('-');
    const num = /(\d+)$/.exec(resto);
    // El número final, y lo que va delante sin el idioma (EN, SP, E…) por si hay letras de serie (ENS33, ENX43).
    const serie = resto.replace(/^(EN|SP|DE|FR|IT|PT|JP|KR|E|S|G|F|I|P)/, '').replace(/\d+$/, '');
    return { prefijo, serie, num: num ? Number(num[1]) : Number.POSITIVE_INFINITY };
  };
  const pa = partes(a);
  const pb = partes(b);
  if (!pa || !pb) return pa ? -1 : pb ? 1 : 0;
  return compareNames(pa.prefijo, pb.prefijo) || compareNames(pa.serie, pb.serie) || pa.num - pb.num;
}

export const normalizeStr = (str: string): string => {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// Converts HEX (#ffffff) to Space separated RGB (255 255 255) for Tailwind vars
export const hexToRgb = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "251 191 36"; // Fallback default
    return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
};

// Helper to parse Hex to object
const hexToRgbObj = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

// Calculate luminance to determine if text should be black or white
// Returns true if the color is "Dark" (needs white text)
export const isColorDark = (hex: string): boolean => {
    const { r, g, b } = hexToRgbObj(hex);
    // YIQ equation
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq < 128;
};

// Generate Surface/Panel colors based on a Body color
// Dark Mode: Lighten the color
// Light Mode: Darken the color (or tint it)
export const generateDerivedColors = (baseHex: string, isDark: boolean) => {
    const { r, g, b } = hexToRgbObj(baseHex);
    const amount = isDark ? 15 : -10; // Lighten by 15 or Darken by 10
    
    const adjust = (c: number, amt: number) => Math.min(255, Math.max(0, c + amt));
    
    const r2 = adjust(r, amount);
    const g2 = adjust(g, amount);
    const b2 = adjust(b, amount);
    
    const r3 = adjust(r, amount * 2);
    const g3 = adjust(g, amount * 2);
    const b3 = adjust(b, amount * 2);

    return {
        surface: `${r2} ${g2} ${b2}`,
        panel: `${r3} ${g3} ${b3}`
    };
};

export const getLangFlag = (langCode: string): string => {
  const map: Record<string, string> = {
    'ES': '🇪🇸',
    'EN': '🇬🇧', // or 🇺🇸 depending on preference
    'JP': '🇯🇵',
    'DE': '🇩🇪',
    'IT': '🇮🇹',
    'FR': '🇫🇷',
    'PT': '🇵🇹',
    'KO': '🇰🇷'
  };
  return map[langCode] || '🏳️';
};

export const getRarityColor = (rarityString: string): string => {
  const r = (rarityString || '').toLowerCase();
  if (r.includes('10000')) return '#ef4444'; 
  // El "25th" de la Quarter Century; no el de las reediciones "(25th Anniversary Edition)", que son otra rareza.
  if (r.includes('quarter') || /25th(?! anniversary edition)/.test(r)) return '#ef4444'; // Red/Gold hybrid usually, red for distinction
  if (r.includes('prismatic') || r.includes('starlight') || r.includes('pharaoh') || r.includes('millennium')) return '#22d3ee'; // Cyan
  if (r.includes('platinum')) return '#60a5fa'; // Blue-ish Silver
  if (r.includes('collector')) return '#c084fc'; // Violet
  if (r.includes('secret')) return '#e5e7eb'; // Silver/White (Secret text)
  if (r.includes('ultimate')) return '#f97316'; // Orange
  if (r.includes('ghost')) return '#f3f4f6'; // Ghost White
  if (r.includes('ultra') && r.includes('special')) return '#cbd5e1'; // Ultra con letras plateadas
  if (r.includes('gold') || r.includes('ultra')) return '#ffd700'; // Gold
  if (r.includes('super')) return '#10b981'; // Green
  if (r.includes('rare')) return '#3b82f6'; // Blue
  return '#a1a1aa'; // Gray/Common
};

export const getConditionMeta = (code: string) => {
  const map: Record<string, { color: string; label: string }> = {
    'MT': { color: '#22c55e', label: 'MT' },
    'NM': { color: '#4ade80', label: 'NM' },
    'EX': { color: '#38bdf8', label: 'EX' },
    'GD': { color: '#60a5fa', label: 'GD' },
    'LP': { color: '#facc15', label: 'LP' },
    'PL': { color: '#fb923c', label: 'PL' },
    'PO': { color: '#f87171', label: 'PO' }
  };
  return map[code] || map['NM'];
};

// Hierarchy STRICTLY based on user request (Lowest to Highest)
export const getRarityWeight = (r: string): number => {
  const rarity = (r || '').toLowerCase();

  // 17. 10000 Secret Rare
  if (rarity.includes('10000')) return 17;

  // 16. Quarter Century Secret Rare (QCR)
  if (rarity.includes('quarter') || /25th(?! anniversary edition)/.test(rarity)) return 16;

  // 15. Pharaoh's Rare
  if (rarity.includes('pharaoh')) return 15;

  // 14. Starlight Rare
  if (rarity.includes('starlight')) return 14;

  // 13. Collector's Rare
  if (rarity.includes('collector')) return 13;

  // 12. Ghost Rare
  if (rarity.includes('ghost')) return 12;

  // 11. Ultimate Rare
  if (rarity.includes('ultimate')) return 11;

  // 10. Premium Gold Rare / Gold Secret Rare
  // Check specifically for "Premium Gold" or "Gold Secret"
  if (rarity.includes('premium gold') || (rarity.includes('gold') && rarity.includes('secret'))) return 10;

  // 9. Gold Rare
  // Must check after Premium Gold/Gold Secret to avoid false positive
  if (rarity.includes('gold')) return 9;

  // 8. Prismatic Secret Rare
  if (rarity.includes('prismatic') || rarity.includes('millennium')) return 8;

  // 7. Platinum Secret Rare
  if (rarity.includes('platinum')) return 7;

  // 6. Secret Rare (Standard)
  // Check after 10000/QCR/Starlight/GoldSecret/Prismatic/Platinum
  if (rarity.includes('secret')) return 6;

  // 5. Ultra Rare
  if (rarity.includes('ultra')) return 5;

  // 4. Super Rare
  if (rarity.includes('super')) return 4;

  // 3. Rare
  if (rarity.includes('rare')) return 3;

  // 2.5 Battle Pack / Parallel Rares
  if (rarity.includes('starfoil') || rarity.includes('mosaic') || rarity.includes('shatterfoil') || rarity.includes('parallel')) return 2.5;

  // 2. Short Print
  if (rarity.includes('short print')) return 2;

  // 1. Common
  return 1;
};

// SORT ORDER REQUESTED: 
// 1. Normal/Effect (Main Deck)
// 2. Spells
// 3. Traps
// 4. Synchro
// 5. Ritual
// 6. Fusion
// 7. XYZ
// 8. Link
// 9. Token

export const getTypeWeight = (t: string): number => {
  const type = (t || '').toLowerCase();
  
  // Specific Order for Extra Deck / Special Types
  if (type.includes('synchro')) return 4;
  if (type.includes('ritual')) return 5;
  if (type.includes('fusion')) return 6;
  if (type.includes('xyz')) return 7;
  if (type.includes('link')) return 8;
  if (type.includes('token')) return 9;
  
  // 3. Traps
  if (type.includes('trap')) return 3;
  
  // 2. Spells
  if (type.includes('spell')) return 2;
  
  // 1. Normal / Effect Monsters
  return 1;
};

// --- DATA MAPPING FOR FILTERS ---

export const analyzeCardType = (rawType: string, rawRace: string): { 
    cardType: MainCardType; 
    monsterType?: MonsterType; 
    property?: CardProperty; 
} => {
    const t = rawType.toLowerCase();
    
    // 1. SPELL
    if (t.includes('spell')) {
        return {
            cardType: 'Spell',
            property: (rawRace || 'Normal') as CardProperty
        };
    }

    // 2. TRAP
    if (t.includes('trap')) {
        return {
            cardType: 'Trap',
            property: (rawRace || 'Normal') as CardProperty
        };
    }

    // 3. TOKEN
    if (t.includes('token')) {
        return {
            cardType: 'Monster',
            monsterType: 'Token'
        };
    }

    // 4. MONSTERS
    let mType: MonsterType = 'Effect'; // Default

    if (t.includes('link')) mType = 'Link';
    else if (t.includes('xyz')) mType = 'XYZ';
    else if (t.includes('synchro')) mType = 'Synchro';
    else if (t.includes('fusion')) mType = 'Fusion';
    else if (t.includes('ritual')) mType = 'Ritual';
    else if (t.includes('pendulum')) mType = 'Pendulum';
    else if (t.includes('normal')) mType = 'Normal';
    
    return {
        cardType: 'Monster',
        monsterType: mType
    };
};

/** Filtros de Cardmarket: vendedores de Europa y cartas en español. */
const CARDMARKET_FILTROS = 'sellerCountry=1,2,3,33,35,5,6,8,9,11,12,7,14,15,37,16,17,36,21,18,19,20,22,23,24,25,26,27,29,31,30,10,28,4,13&language=4';

/** Página de un producto concreto de Cardmarket (una versión: set y rareza). */
export const getCardMarketProductLink = (idProduct: number): string =>
  `https://www.cardmarket.com/es/YuGiOh/Products?idProduct=${idProduct}&${CARDMARKET_FILTROS}`;

export const getCardMarketLink = (name: string): string => {
  const clean = name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "-");
  return `https://www.cardmarket.com/es/YuGiOh/Cards/${clean}?${CARDMARKET_FILTROS}`;
};
