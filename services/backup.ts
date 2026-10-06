import type { Database } from '../types';
import { countUserFolders, normalizeDatabase } from './database';

/*
 * Copias de seguridad de la colección.
 *
 * La colección vive en `localStorage`, en una sola copia. Eso puede perderse de
 * cuatro maneras, y cada pieza de este archivo cubre una:
 *
 *   1. El navegador desaloja el almacenamiento cuando le falta espacio.
 *      → `requestPersistentStorage` le pide que no lo haga.
 *   2. Un borrado por error, una importación equivocada o un fallo del código
 *      escriben algo malo encima de la única copia.
 *      → Historial automático de versiones en IndexedDB (`saveSnapshot`).
 *   3. Se borran los datos de navegación, y con ellos todo lo anterior.
 *      → Copia continua en un archivo del disco (`writeBackupFile`), fuera del
 *        navegador. Si ese archivo está en OneDrive o Dropbox, además queda en
 *        la nube.
 *   4. Se cambia de navegador o de equipo.
 *      → Ese mismo archivo se restaura en el otro lado.
 *
 * Nada de esto debe poder tumbar la aplicación: si IndexedDB no está disponible
 * (algunas ventanas privadas), las funciones fallan en silencio y la colección
 * sigue funcionando como antes.
 */

// ---------------------------------------------------------------------------
// Formato de las copias
// ---------------------------------------------------------------------------

const BACKUP_APP = 'yugitracker';
const BACKUP_VERSION = 1;

interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  savedAt: string;
  cards: number;
  db: Database;
}

/**
 * Las copias van envueltas con la aplicación, la versión y la fecha, para poder
 * reconocerlas y migrarlas el día que cambie el formato. Las de antes eran la
 * colección a pelo: `parseBackup` acepta las dos.
 */
export function serializeBackup(db: Database): string {
  const file: BackupFile = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    savedAt: new Date().toISOString(),
    cards: db.cards.length,
    db,
  };
  return JSON.stringify(file);
}

export function parseBackup(text: string): Database | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (json && typeof json === 'object' && 'db' in json) {
    return normalizeDatabase((json as { db: unknown }).db);
  }
  return normalizeDatabase(json); // Copias antiguas: la colección sin envolver.
}

/** Descarga una copia. Va por Blob: una URL `data:` grande la cortan algunos navegadores. */
export function downloadBackup(db: Database) {
  const blob = new Blob([serializeBackup(db)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `yugitracker-copia-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

const IDB_NAME = 'yugitracker-copias';
const IDB_VERSION = 1;
/** Datos de cada versión: lo pequeño, para listar sin cargar colecciones enteras. */
const STORE_META = 'snapshots';
/** La colección de cada versión, guardada aparte y leída solo al restaurar. */
const STORE_DATA = 'snapshotData';
/** Valores sueltos, como el archivo vinculado. */
const STORE_KV = 'kv';

let idbPromise: Promise<IDBDatabase> | null = null;

function openIdb(): Promise<IDBDatabase> {
  if (!idbPromise) {
    idbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no está disponible'));
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORE_DATA)) {
          db.createObjectStore(STORE_DATA, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // Si falla, que el siguiente intento vuelva a probar en vez de heredar el error.
    idbPromise.catch(() => {
      idbPromise = null;
    });
  }
  return idbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
  });
}

// ---------------------------------------------------------------------------
// Historial de versiones
// ---------------------------------------------------------------------------

export type SnapshotReason = 'auto' | 'manual' | 'antes-de-importar' | 'antes-de-restaurar';

export interface SnapshotMeta {
  id: number;
  savedAt: number;
  reason: SnapshotReason;
  cards: number;
  folders: number;
  /** Huella del contenido, para no guardar dos veces lo mismo. */
  hash: string;
  size: number;
}

/** Huella rápida (FNV-1a de 32 bits). No es criptográfica: solo detecta cambios. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

async function readAllMeta(db: IDBDatabase): Promise<SnapshotMeta[]> {
  const tx = db.transaction(STORE_META, 'readonly');
  const all = await requestToPromise(tx.objectStore(STORE_META).getAll() as IDBRequest<SnapshotMeta[]>);
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

const DAY = 24 * 60 * 60 * 1000;
/** Las más recientes se guardan siempre, una a una. */
const KEEP_RECENT = 25;
/** Las anteriores a una importación o restauración se guardan este tiempo. */
const KEEP_SPECIAL_DAYS = 30;
/** Del resto se conserva una por día durante este tiempo. */
const KEEP_DAILY_DAYS = 60;

/**
 * Decide qué versiones sobran. La idea es la de cualquier copia de seguridad
 * seria: mucho detalle reciente y cada vez menos hacia atrás. Así el historial
 * cubre dos meses sin crecer sin límite.
 */
function pickSnapshotsToDelete(metas: SnapshotMeta[], now: number): number[] {
  const keep = new Set<number>();
  const diasVistos = new Set<string>();

  metas.forEach((m, index) => {
    const age = now - m.savedAt;
    if (index < KEEP_RECENT) {
      keep.add(m.id);
    } else if (m.reason !== 'auto' && age < KEEP_SPECIAL_DAYS * DAY) {
      keep.add(m.id);
    } else if (age < KEEP_DAILY_DAYS * DAY) {
      const dia = new Date(m.savedAt).toDateString();
      // `metas` va de más nueva a más vieja: la primera de cada día es la última de ese día.
      if (!diasVistos.has(dia)) keep.add(m.id);
    }
    diasVistos.add(new Date(m.savedAt).toDateString());
  });

  return metas.filter((m) => !keep.has(m.id)).map((m) => m.id);
}

/**
 * Guarda una versión de la colección.
 *
 * Las automáticas no se repiten si el contenido no ha cambiado desde la última.
 * Las demás (antes de importar o de restaurar) se guardan siempre, porque son
 * justo las que permiten volver atrás de una operación que lo sustituye todo.
 *
 * Devuelve la versión guardada, o `null` si no hacía falta o no se pudo.
 */
export function saveSnapshot(dbToSave: Database, reason: SnapshotReason): Promise<SnapshotMeta | null> {
  /*
   * Los guardados van EN FILA. Si dos coinciden (el periódico y el de cerrar la
   * pestaña, o el doble montaje de React en desarrollo), los dos leían el
   * historial antes de que ninguno escribiera, los dos pasaban el control de
   * duplicados y quedaban dos versiones idénticas. Encadenándolos, cada uno ve
   * lo que guardó el anterior.
   */
  const turno = colaDeGuardado.then(() => guardarVersion(dbToSave, reason));
  colaDeGuardado = turno.catch(() => null);
  return turno;
}

let colaDeGuardado: Promise<unknown> = Promise.resolve();

async function guardarVersion(dbToSave: Database, reason: SnapshotReason): Promise<SnapshotMeta | null> {
  try {
    const idb = await openIdb();
    const data = JSON.stringify(dbToSave);
    const hash = fingerprint(data);
    const metas = await readAllMeta(idb);
    const latest = metas[0];

    if (reason === 'auto' && latest && latest.hash === hash && latest.size === data.length) {
      return null;
    }

    const meta: Omit<SnapshotMeta, 'id'> = {
      savedAt: Date.now(),
      reason,
      cards: dbToSave.cards.length,
      folders: countUserFolders(dbToSave),
      hash,
      size: data.length,
    };

    const tx = idb.transaction([STORE_META, STORE_DATA], 'readwrite');
    const id = await requestToPromise(tx.objectStore(STORE_META).add(meta)) as number;
    tx.objectStore(STORE_DATA).put({ id, data });
    await transactionDone(tx);

    await pruneSnapshots(idb);
    return { ...meta, id };
  } catch (e) {
    console.error('No se pudo guardar la versión en el historial:', e);
    return null;
  }
}

async function pruneSnapshots(idb: IDBDatabase) {
  const metas = await readAllMeta(idb);
  const sobran = pickSnapshotsToDelete(metas, Date.now());
  if (sobran.length === 0) return;

  const tx = idb.transaction([STORE_META, STORE_DATA], 'readwrite');
  for (const id of sobran) {
    tx.objectStore(STORE_META).delete(id);
    tx.objectStore(STORE_DATA).delete(id);
  }
  await transactionDone(tx);
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  try {
    return await readAllMeta(await openIdb());
  } catch (e) {
    console.error('No se pudo leer el historial:', e);
    return [];
  }
}

export async function loadSnapshot(id: number): Promise<Database | null> {
  try {
    const idb = await openIdb();
    const tx = idb.transaction(STORE_DATA, 'readonly');
    const record = await requestToPromise(tx.objectStore(STORE_DATA).get(id) as IDBRequest<{ data: string } | undefined>);
    return record ? normalizeDatabase(JSON.parse(record.data)) : null;
  } catch (e) {
    console.error('No se pudo leer la versión:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Copia continua en un archivo del disco
// ---------------------------------------------------------------------------

/*
 * Usa la File System Access API: el usuario elige una vez dónde guardar y a
 * partir de ahí cada cambio se escribe en ese archivo. Solo existe en Chrome,
 * Edge y derivados; en el resto queda la descarga manual de copias.
 *
 * Dos detalles del navegador que condicionan cómo se usa:
 *   - El permiso de escritura se concede por sesión. Tras cerrar el navegador
 *     hay que volver a pulsar un botón para reanudar (`requestFilePermission`
 *     exige un gesto del usuario). La aplicación lo avisa.
 *   - `createWritable` escribe en un temporal y lo sustituye al cerrar, así
 *     que un corte a mitad no deja el archivo corrupto.
 */

type PermissionMode = { mode: 'readwrite' };

interface PermissionedFileHandle extends FileSystemFileHandle {
  queryPermission?(descriptor: PermissionMode): Promise<PermissionState>;
  requestPermission?(descriptor: PermissionMode): Promise<PermissionState>;
}

type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

const KV_FILE_HANDLE = 'archivo-vinculado';

function getSaveFilePicker(): SaveFilePicker | undefined {
  return (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
}

export function supportsFileLink(): boolean {
  return typeof window !== 'undefined' && typeof getSaveFilePicker() === 'function';
}

/** Abre el diálogo de guardar. Devuelve `null` si el usuario lo cancela. */
export async function pickBackupFile(): Promise<FileSystemFileHandle | null> {
  const picker = getSaveFilePicker();
  if (!picker) return null;
  try {
    return await picker({
      suggestedName: 'yugitracker-coleccion.json',
      types: [{ description: 'Colección de Yugi-Tracker', accept: { 'application/json': ['.json'] } }],
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

export async function saveLinkedFile(handle: FileSystemFileHandle) {
  const idb = await openIdb();
  const tx = idb.transaction(STORE_KV, 'readwrite');
  tx.objectStore(STORE_KV).put(handle, KV_FILE_HANDLE);
  await transactionDone(tx);
}

export async function loadLinkedFile(): Promise<FileSystemFileHandle | null> {
  try {
    const idb = await openIdb();
    const tx = idb.transaction(STORE_KV, 'readonly');
    const handle = await requestToPromise(tx.objectStore(STORE_KV).get(KV_FILE_HANDLE));
    return (handle as FileSystemFileHandle | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function forgetLinkedFile() {
  const idb = await openIdb();
  const tx = idb.transaction(STORE_KV, 'readwrite');
  tx.objectStore(STORE_KV).delete(KV_FILE_HANDLE);
  await transactionDone(tx);
}

export async function getFilePermission(handle: FileSystemFileHandle): Promise<PermissionState> {
  const h = handle as PermissionedFileHandle;
  // Sin la API de permisos (o en el sistema de archivos privado del origen) se puede escribir directamente.
  if (typeof h.queryPermission !== 'function') return 'granted';
  return h.queryPermission({ mode: 'readwrite' });
}

/** Tiene que llamarse desde un clic: el navegador no concede el permiso sin un gesto. */
export async function requestFilePermission(handle: FileSystemFileHandle): Promise<PermissionState> {
  const h = handle as PermissionedFileHandle;
  if (typeof h.requestPermission !== 'function') return 'granted';
  return h.requestPermission({ mode: 'readwrite' });
}

export async function writeBackupFile(handle: FileSystemFileHandle, db: Database) {
  const writable = await handle.createWritable();
  try {
    await writable.write(serializeBackup(db));
    await writable.close();
  } catch (e) {
    await writable.abort().catch(() => {});
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Almacenamiento persistente
// ---------------------------------------------------------------------------

/**
 * Pide al navegador que no desaloje los datos de esta web por falta de espacio.
 *
 * Chrome y Edge lo conceden o lo niegan por su cuenta, según lo mucho que se
 * use la web (instalarla o añadirla a marcadores ayuda); Firefox pregunta. No
 * hay forma de forzarlo, así que el resultado solo se informa.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
