import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Download,
  FileCheck2,
  FolderOpen,
  History,
  Loader2,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { useBackup } from '../../context/BackupContext';
import { useStore } from '../../context/StoreContext';
import type { SnapshotMeta } from '../../services/backup';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "hace 3 minutos", "hace 2 horas"; más allá de un día, fecha y hora. */
function cuando(ts: number): string {
  const seg = Math.round((ts - Date.now()) / 1000);
  if (Math.abs(seg) < 45) return 'ahora mismo';
  const min = Math.round(seg / 60);
  if (Math.abs(min) < 60) return relativo.format(min, 'minute');
  const horas = Math.round(min / 60);
  if (Math.abs(horas) < 24) return relativo.format(horas, 'hour');
  return fechaCorta.format(ts);
}

const MOTIVO: Record<SnapshotMeta['reason'], string> = {
  auto: '',
  manual: 'Guardada a mano',
  'antes-de-importar': 'Antes de importar',
  'antes-de-restaurar': 'Antes de restaurar',
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const BackupModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { state } = useStore();
  const backup = useBackup();
  const [versiones, setVersiones] = useState<SnapshotMeta[] | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);

  const recargar = useCallback(() => {
    backup.listSnapshots().then(setVersiones);
  }, [backup]);

  useEffect(() => {
    if (!isOpen) return;
    recargar();
    // El texto "hace X minutos" envejece: se refresca mientras el panel está abierto.
    const t = window.setInterval(recargar, 30_000);
    return () => window.clearInterval(t);
  }, [isOpen, recargar]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const enArchivo = backup.fileState === 'active';
  const atencion = backup.fileState === 'needs-permission' || backup.fileState === 'error';
  const totalCartas = state.db.cards.length;

  const conCarga = async (accion: () => Promise<void>) => {
    setOcupado(true);
    try {
      await accion();
    } finally {
      setOcupado(false);
      recargar();
    }
  };

  const onElegirImportacion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (archivo) await conCarga(() => backup.importBackup(archivo));
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-copias"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-bg-surface border border-border-base rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Cabecera con el veredicto: lo primero que hay que saber es si está a salvo. */}
        <div className="p-5 border-b border-border-base flex items-start gap-4">
          <div
            className={`shrink-0 rounded-xl p-2.5 ${
              enArchivo ? 'bg-emerald-500/15 text-emerald-400' : atencion ? 'bg-amber-500/15 text-amber-400' : 'bg-main/10 text-muted'
            }`}
          >
            {enArchivo ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="titulo-copias" className="text-xl font-bold text-main">Copias de seguridad</h3>
            <p className="text-sm text-muted mt-0.5">
              {enArchivo
                ? 'Tu colección se guarda en este navegador y, además, en un archivo de tu ordenador.'
                : atencion
                  ? 'La copia en tu archivo está en pausa. Tu colección sigue guardada en el navegador.'
                  : 'Tu colección se guarda en este navegador. Vincula un archivo para tenerla también fuera.'}
            </p>
            <p className="text-xs text-sub mt-1.5">
              {plural(totalCartas, 'carta', 'cartas')} ·{' '}
              {backup.persisted === true
                ? 'el navegador no la borrará por falta de espacio'
                : backup.persisted === false
                  ? 'el navegador podría liberar espacio si le hace falta: por eso conviene el archivo'
                  : 'no se pudo comprobar si el almacenamiento es persistente'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 hover:bg-main/10 rounded text-main/70 hover:text-main">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* --- Archivo en el ordenador --- */}
          <section>
            <h4 className="text-sm font-bold text-main flex items-center gap-2 mb-2">
              <FileCheck2 size={16} className="text-primary" /> Archivo en tu ordenador
            </h4>

            {backup.fileState === 'unsupported' && (
              <p className="text-sm text-muted leading-relaxed">
                Este navegador no permite guardar solo en un archivo. Con <strong className="text-main">Chrome</strong> o{' '}
                <strong className="text-main">Edge</strong> se guarda automáticamente; aquí, descarga una copia de vez en cuando.
              </p>
            )}

            {backup.fileState === 'none' && (
              <div className="space-y-3">
                <p className="text-sm text-muted leading-relaxed">
                  Elige dónde guardarla y cada cambio se escribirá ahí solo. Ese archivo sobrevive aunque borres los datos del
                  navegador, y si lo pones en <strong className="text-main">OneDrive</strong> o{' '}
                  <strong className="text-main">Dropbox</strong> tendrás también copia en la nube.
                </p>
                <button
                  onClick={() => conCarga(backup.linkFile)}
                  disabled={ocupado}
                  className="bg-primary text-black font-bold text-sm px-4 py-2 rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <FolderOpen size={16} /> Elegir dónde guardar
                </button>
              </div>
            )}

            {backup.fileState === 'active' && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-main truncate">{backup.fileName}</div>
                  <div className="text-xs text-muted">
                    {backup.lastFileSave ? `Guardado ${cuando(backup.lastFileSave)}` : 'Se guardará con el próximo cambio'}
                  </div>
                </div>
                <button
                  onClick={() => conCarga(backup.unlinkFile)}
                  className="text-xs font-semibold text-muted hover:text-main px-2 py-1 rounded hover:bg-main/10"
                >
                  Desvincular
                </button>
              </div>
            )}

            {atencion && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 space-y-2">
                <div className="flex items-start gap-2 text-sm text-main">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {backup.fileState === 'needs-permission'
                      ? <>Al reiniciar el navegador hay que volver a darle permiso para escribir en <strong>{backup.fileName}</strong>. Es un clic.</>
                      : backup.fileError ?? 'No se pudo escribir el archivo.'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => conCarga(backup.resumeFile)}
                    disabled={ocupado}
                    className="bg-amber-400 text-black font-bold text-xs px-3 py-1.5 rounded-lg hover:brightness-110 disabled:opacity-50"
                  >
                    Reanudar copia
                  </button>
                  <button
                    onClick={() => conCarga(backup.linkFile)}
                    disabled={ocupado}
                    className="text-xs font-semibold text-muted hover:text-main px-3 py-1.5 rounded-lg hover:bg-main/10"
                  >
                    Elegir otro archivo
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* --- Copias a mano --- */}
          <section>
            <h4 className="text-sm font-bold text-main mb-2">Copias a mano</h4>
            <p className="text-sm text-muted mb-3">
              Para llevar la colección a otro navegador u ordenador. Al restaurar, lo que hubiera se guarda antes en el historial.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={backup.exportBackup}
                className="bg-bg-panel border border-border-base text-main text-sm font-semibold px-3 py-2 rounded-lg hover:bg-main/10 flex items-center gap-2"
              >
                <Download size={16} /> Descargar copia
              </button>
              <button
                onClick={() => inputArchivo.current?.click()}
                disabled={ocupado}
                className="bg-bg-panel border border-border-base text-main text-sm font-semibold px-3 py-2 rounded-lg hover:bg-main/10 flex items-center gap-2 disabled:opacity-50"
              >
                <Upload size={16} /> Restaurar desde archivo
              </button>
              <input
                ref={inputArchivo}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={onElegirImportacion}
              />
            </div>
          </section>

          {/* --- Historial --- */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-main flex items-center gap-2">
                <History size={16} className="text-primary" /> Historial automático
              </h4>
              <button
                onClick={() => conCarga(backup.saveVersionNow)}
                disabled={ocupado}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              >
                Guardar versión ahora
              </button>
            </div>
            <p className="text-sm text-muted mb-3">
              Se guarda una versión cada pocos minutos mientras haces cambios: todas las recientes y una por día durante dos meses.
            </p>

            <div className="rounded-xl border border-border-base divide-y divide-border-base max-h-72 overflow-y-auto">
              {versiones === null && (
                <div className="p-4 flex items-center justify-center text-muted text-sm gap-2">
                  <Loader2 size={16} className="animate-spin" /> Cargando historial…
                </div>
              )}
              {versiones?.length === 0 && (
                <div className="p-4 text-center text-sm text-muted">Todavía no hay versiones guardadas.</div>
              )}
              {versiones?.map((v) => (
                <div key={v.id} className="px-3 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    {/*
                      Sin etiqueta de "última": la versión más reciente del
                      historial no tiene por qué ser la colección actual (justo
                      después de importar, es la de ANTES), y llamarla así confundía.
                    */}
                    <div className="text-sm text-main font-medium">{cuando(v.savedAt)}</div>
                    <div className="text-xs text-muted">
                      {plural(v.cards, 'carta', 'cartas')} · {plural(v.folders, 'carpeta', 'carpetas')}
                      {MOTIVO[v.reason] && <span className="text-sub"> · {MOTIVO[v.reason]}</span>}
                    </div>
                  </div>
                  {confirmando === v.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setConfirmando(null)}
                        className="text-xs font-semibold text-muted hover:text-main px-2 py-1 rounded hover:bg-main/10"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => {
                          setConfirmando(null);
                          void conCarga(() => backup.restoreSnapshot(v.id));
                        }}
                        className="text-xs font-bold bg-primary text-black px-2.5 py-1 rounded hover:brightness-110"
                      >
                        Sí, restaurar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmando(v.id)}
                      disabled={ocupado}
                      className="text-xs font-semibold text-muted hover:text-main px-2 py-1 rounded hover:bg-main/10 flex items-center gap-1 disabled:opacity-50"
                    >
                      <RotateCcw size={13} /> Restaurar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
};
