import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Database } from '../types';
import { useStore } from './StoreContext';
import { isEmptyDatabase } from '../services/database';
import {
  downloadBackup,
  forgetLinkedFile,
  getFilePermission,
  listSnapshots as listSnapshotsFromDb,
  loadLinkedFile,
  loadSnapshot,
  parseBackup,
  pickBackupFile,
  requestFilePermission,
  requestPersistentStorage,
  saveLinkedFile,
  saveSnapshot,
  supportsFileLink,
  writeBackupFile,
  type SnapshotMeta,
  type SnapshotReason,
} from '../services/backup';

/**
 * Estado de la copia en archivo:
 *   unsupported       el navegador no sabe escribir en archivos (Firefox, Safari)
 *   none              se puede, pero no hay ningún archivo vinculado
 *   active            cada cambio se está guardando en el archivo
 *   needs-permission  hay archivo, pero tras reiniciar el navegador hay que
 *                     volver a dar permiso con un clic
 *   error             el último intento de escribir falló
 */
export type FileState = 'unsupported' | 'none' | 'active' | 'needs-permission' | 'error';

interface BackupContextValue {
  fileState: FileState;
  fileName: string | null;
  lastFileSave: number | null;
  fileError: string | null;
  /** `null` si el navegador no permite pedirlo. */
  persisted: boolean | null;
  linkFile: () => Promise<void>;
  resumeFile: () => Promise<void>;
  unlinkFile: () => Promise<void>;
  saveVersionNow: () => Promise<void>;
  listSnapshots: () => Promise<SnapshotMeta[]>;
  restoreSnapshot: (id: number) => Promise<void>;
  importBackup: (file: File) => Promise<void>;
  exportBackup: () => void;
}

const BackupContext = createContext<BackupContextValue | undefined>(undefined);

/** Cada cuánto se guarda una versión mientras hay cambios. */
const SNAPSHOT_EVERY_MS = 2 * 60 * 1000;
/** Espera tras el último cambio antes de escribir el archivo, para no escribir en cada tecla. */
const FILE_DEBOUNCE_MS = 1200;

function describeError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError') return 'El navegador no dio permiso para escribir el archivo.';
    if (e.name === 'NotFoundError') return 'No se encuentra el archivo: puede que se haya movido o borrado.';
    if (e.name === 'QuotaExceededError') return 'No queda espacio en el disco.';
  }
  return e instanceof Error ? e.message : 'Error desconocido al escribir el archivo.';
}

export const BackupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, dispatch, toast } = useStore();
  const db = state.db;

  /*
   * La colección actual, accesible desde temporizadores sin tener que recrearlos.
   * Se actualiza en un efecto de layout y no durante el render: React puede
   * repetir o descartar renders, y uno descartado dejaría aquí datos que nunca
   * llegaron a pantalla.
   */
  const dbRef = useRef<Database>(db);
  useLayoutEffect(() => {
    dbRef.current = db;
  }, [db]);

  const [fileState, setFileState] = useState<FileState>(supportsFileLink() ? 'none' : 'unsupported');
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [lastFileSave, setLastFileSave] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  // --- Arranque: almacenamiento persistente y archivo vinculado de otra sesión ---
  useEffect(() => {
    let cancelado = false;

    requestPersistentStorage().then((ok) => {
      if (!cancelado) setPersisted(ok);
    });

    if (supportsFileLink()) {
      loadLinkedFile().then(async (handle) => {
        if (cancelado || !handle) return;
        const permiso = await getFilePermission(handle).catch(() => 'prompt' as PermissionState);
        if (cancelado) return;
        setFileHandle(handle);
        // Tras reiniciar el navegador lo normal es 'prompt': hace falta un clic para reanudar.
        setFileState(permiso === 'granted' ? 'active' : 'needs-permission');
      });
    }

    return () => {
      cancelado = true;
    };
  }, []);

  // --- Historial automático ---
  /*
   * No se guarda una versión por cada cambio: se marca que hay cambios y cada
   * pocos minutos se guarda la última. También al ocultar o cerrar la pestaña,
   * que es cuando se pierde lo que no se haya guardado.
   */
  const pendiente = useRef(true); // La primera versión es la colección tal como se abre.

  useEffect(() => {
    pendiente.current = true;
  }, [db]);

  useEffect(() => {
    const guardarSiHayCambios = () => {
      if (!pendiente.current) return;
      pendiente.current = false;
      void saveSnapshot(dbRef.current, 'auto');
    };
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') guardarSiHayCambios();
    };

    guardarSiHayCambios();
    const intervalo = window.setInterval(guardarSiHayCambios, SNAPSHOT_EVERY_MS);
    document.addEventListener('visibilitychange', alOcultar);
    window.addEventListener('pagehide', guardarSiHayCambios);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alOcultar);
      window.removeEventListener('pagehide', guardarSiHayCambios);
    };
  }, []);

  // --- Escritura en el archivo ---
  const escribirArchivo = useCallback(async (handle: FileSystemFileHandle, contenido: Database) => {
    try {
      await writeBackupFile(handle, contenido);
      setLastFileSave(Date.now());
      setFileError(null);
      setFileState('active');
    } catch (e) {
      console.error('No se pudo escribir la copia en el archivo:', e);
      setFileError(describeError(e));
      setFileState(e instanceof DOMException && e.name === 'NotAllowedError' ? 'needs-permission' : 'error');
    }
  }, []);

  useEffect(() => {
    if (fileState !== 'active' || !fileHandle) return;
    /*
     * Una colección vacía no se escribe nunca de forma automática. Si por lo que
     * sea el navegador arrancase sin datos, no queremos que eso machaque el
     * archivo, que es justo la copia que serviría para recuperarlos.
     */
    if (isEmptyDatabase(db)) return;
    const t = window.setTimeout(() => void escribirArchivo(fileHandle, db), FILE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [db, fileState, fileHandle, escribirArchivo]);

  // --- Acciones ---

  const linkFile = useCallback(async () => {
    try {
      const handle = await pickBackupFile();
      if (!handle) return; // Cancelado.
      await saveLinkedFile(handle);
      setFileHandle(handle);
      await escribirArchivo(handle, dbRef.current);
      toast(`Copia vinculada a ${handle.name}`);
    } catch (e) {
      setFileError(describeError(e));
      toast('No se pudo vincular el archivo', 'err');
    }
  }, [escribirArchivo, toast]);

  const resumeFile = useCallback(async () => {
    if (!fileHandle) return;
    try {
      const permiso = await requestFilePermission(fileHandle);
      if (permiso !== 'granted') {
        setFileState('needs-permission');
        return;
      }
      await escribirArchivo(fileHandle, dbRef.current);
      toast('Copia en archivo reanudada');
    } catch (e) {
      setFileError(describeError(e));
      setFileState('error');
    }
  }, [fileHandle, escribirArchivo, toast]);

  const unlinkFile = useCallback(async () => {
    await forgetLinkedFile().catch(() => {});
    setFileHandle(null);
    setLastFileSave(null);
    setFileError(null);
    setFileState(supportsFileLink() ? 'none' : 'unsupported');
    toast('El archivo ya no se actualiza');
  }, [toast]);

  const saveVersionNow = useCallback(async () => {
    const guardada = await saveSnapshot(dbRef.current, 'manual');
    toast(guardada ? 'Versión guardada en el historial' : 'No se pudo guardar la versión', guardada ? 'ok' : 'err');
  }, [toast]);

  /**
   * Sustituye la colección por otra, dejando antes una versión de la actual en
   * el historial y un "Deshacer" a mano. Es la única operación que lo cambia
   * todo de golpe, así que es la que más protección necesita.
   */
  const reemplazarColeccion = useCallback(
    async (nueva: Database, motivo: SnapshotReason, mensaje: string) => {
      const anterior = dbRef.current;
      await saveSnapshot(anterior, motivo);
      dispatch({ type: 'IMPORT_DB', payload: nueva });
      toast(mensaje, 'ok', () => {
        dispatch({ type: 'IMPORT_DB', payload: anterior });
        toast('Colección anterior recuperada');
      });
    },
    [dispatch, toast],
  );

  const restoreSnapshot = useCallback(
    async (id: number) => {
      const version = await loadSnapshot(id);
      if (!version) {
        toast('No se pudo leer esa versión', 'err');
        return;
      }
      await reemplazarColeccion(version, 'antes-de-restaurar', `Restaurada: ${version.cards.length} cartas`);
    },
    [reemplazarColeccion, toast],
  );

  const importBackup = useCallback(
    async (file: File) => {
      const nueva = parseBackup(await file.text());
      if (!nueva) {
        toast('Ese archivo no es una copia de Yugi-Tracker', 'err');
        return;
      }
      await reemplazarColeccion(nueva, 'antes-de-importar', `Importada: ${nueva.cards.length} cartas`);
    },
    [reemplazarColeccion, toast],
  );

  const exportBackup = useCallback(() => downloadBackup(dbRef.current), []);

  const value = useMemo<BackupContextValue>(
    () => ({
      fileState,
      fileName: fileHandle?.name ?? null,
      lastFileSave,
      fileError,
      persisted,
      linkFile,
      resumeFile,
      unlinkFile,
      saveVersionNow,
      listSnapshots: listSnapshotsFromDb,
      restoreSnapshot,
      importBackup,
      exportBackup,
    }),
    [fileState, fileHandle, lastFileSave, fileError, persisted, linkFile, resumeFile, unlinkFile,
      saveVersionNow, restoreSnapshot, importBackup, exportBackup],
  );

  return <BackupContext.Provider value={value}>{children}</BackupContext.Provider>;
};

export const useBackup = () => {
  const ctx = useContext(BackupContext);
  if (!ctx) throw new Error('useBackup debe usarse dentro de BackupProvider');
  return ctx;
};
