import type { Database, Folder } from '../types';
import { CARD_BACK_IMG, ID_ALL } from '../utils';

/** La carpeta de sistema siempre existe y reúne todas las cartas. */
export const createSystemFolder = (): Folder => ({
  id: ID_ALL,
  name: 'Colección Completa',
  img: CARD_BACK_IMG,
  align: 'center',
  cardSort: 'type',
  cardSortDir: 'asc',
});

export const createEmptyDatabase = (): Database => ({
  folders: [createSystemFolder()],
  cards: [],
  customArts: {},
});

/**
 * Comprueba que algo tenga forma de colección antes de usarlo.
 *
 * Lo usan el arranque (lo guardado en el navegador), la importación de copias y
 * la restauración del historial. Si le faltan las listas se devuelve `null` en
 * vez de dejar que un `undefined.find(...)` tumbe la aplicación.
 */
export function normalizeDatabase(json: unknown): Database | null {
  if (!json || typeof json !== 'object') return null;

  const candidate = json as Partial<Database>;
  if (!Array.isArray(candidate.folders) || !Array.isArray(candidate.cards)) return null;

  const folders = [...candidate.folders];
  if (!folders.some((f) => f.id === ID_ALL)) folders.unshift(createSystemFolder());

  return { folders, cards: candidate.cards, customArts: candidate.customArts ?? {} };
}

/** Una colección recién creada: solo la carpeta de sistema y ninguna carta. */
export function isEmptyDatabase(db: Database): boolean {
  return db.cards.length === 0 && db.folders.every((f) => f.id === ID_ALL);
}

/** Cuántas carpetas ha creado el usuario (sin contar la de sistema). */
export function countUserFolders(db: Database): number {
  return db.folders.filter((f) => f.id !== ID_ALL).length;
}
