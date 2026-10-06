/** Encuadre de la imagen de portada de una carpeta. */
export type FolderAlign = 'top' | 'center' | 'bottom';

/** Estado de conservación, de Mint a Poor. */
export type CardCondition = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';

export interface Folder {
  id: string;
  name: string;
  subtext?: string;
  img: string;
  align: FolderAlign;
  // Sorting preferences per folder
  cardSort?: CardSort;
  cardSortDir?: SortDirection;
}

export type MainCardType = 'Monster' | 'Spell' | 'Trap';
export type MonsterType = 'Normal' | 'Effect' | 'Fusion' | 'Ritual' | 'Synchro' | 'XYZ' | 'Link' | 'Pendulum' | 'Token';
export type CardProperty = 'Normal' | 'Continuous' | 'Field' | 'Quick-Play' | 'Counter' | 'Equip' | 'Ritual';

export interface Card {
  uid: string;
  folderId: string;
  apiId: number;
  name: string;
  name_en?: string;
  img: string;
  type: string; // Legacy API type string (e.g. "Effect Monster")
  paid: number;
  lang: string;
  condition: CardCondition;
  obs: string;
  tags: string[];
  is1st: boolean;
  isLimited?: boolean; // New property
  isWanted?: boolean; // New property for Wanted cards
  setCode: string;
  rarity: string;
  rarityCode: string;
  
  // New Filter Fields
  cardType?: MainCardType;
  monsterType?: MonsterType;
  property?: CardProperty;
}

export interface CardSet {
  set_name: string;
  set_code: string;
  set_rarity: string;
  set_rarity_code: string;
  set_price: string;
}

export interface CardImage {
  id: number;
  image_url: string;
  image_url_small: string;
  image_url_cropped: string;
}

// NEW: Extended Metadata for v7 Compliance (Beta/Unstable support)
export interface MiscInfo {
    beta_id?: number;
    beta_name?: string;
    views?: number;
    views_week?: number;
    up_votes?: number;
    down_votes?: number;
    format?: string[];
    tcg_date?: string;
    ocg_date?: string;
    konami_id?: number;
    has_effect?: number;
}

// UPDATED: Full V7 API Schema
export interface ApiCard {
  id: number;
  name: string;
  /** Nombre en español (de Yugipedia), si se conoce. No lo da la API. */
  name_es?: string;
  type: string;
  frameType: string; // 'effect', 'spell', 'trap', 'link', etc.
  desc: string;
  race: string;
  
  // V7 Stats Fields
  atk?: number;
  def?: number;
  level?: number;
  attribute?: string;
  archetype?: string;
  scale?: number;
  linkval?: number;
  linkmarkers?: string[];
  
  // V7 Banlist Info
  banlist_info?: {
      ban_tcg?: string;
      ban_ocg?: string;
      ban_goat?: string;
  };
  
  // V7 Misc Info (Beta, Dates, IDs)
  misc_info?: MiscInfo[];

  card_sets?: CardSet[];
  card_images: CardImage[];
}

export type ViewMode = 'grid' | 'list' | 'album' | 'display';
export type AlbumColumns = 2 | 3 | 4;

export type FolderSort = 'manual' | 'name' | 'value';
export type CardSort = 'manual' | 'type' | 'rarity' | 'name' | 'price';
export type SortDirection = 'asc' | 'desc';

export interface ThemeConfig {
  primary: string; // RGB string like "255 100 50"
  bgBody: string; // RGB string
  bgSurface: string; // RGB string
  bgPanel: string; // RGB string
  isDark: boolean; // Flag for Text Inversion
}

export interface Database {
  folders: Folder[];
  cards: Card[];
  // Key: ApiID (number), Value: Array of custom URL strings
  customArts: Record<number, string[]>;
}

export interface ToastData {
  id: string;
  msg: string;
  type: 'ok' | 'err';
  onUndo?: () => void;
}