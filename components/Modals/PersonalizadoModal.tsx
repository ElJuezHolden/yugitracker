import { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Trash2, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type { Card, CardCondition } from '../../types';
import { CARD_BACK_IMG, generateId, getConditionMeta, ID_ALL, onCardImageError } from '../../utils';
import { IDIOMAS, LanguageFlag } from '../LanguageFlag';

/*
 * Artículos personalizados: lo que no está en ninguna base de datos de cartas
 * (Field Center Cards, tapetes, promocionales raros…). Nombre, tipo, imagen por
 * URL, idioma, estado, un precio puesto a mano (cuenta en el valor de la carpeta
 * y de la colección) y, si se quiere, su enlace de Cardmarket para revisarlo.
 *
 * Para meter muchos seguidos (p. ej. varias Field Center), "Guardar y añadir
 * otro" guarda y deja el formulario con el mismo tipo, idioma, estado y precio,
 * listo para el siguiente nombre e imagen.
 */

/**
 * Número de los artículos personalizados: por encima de todos los de cartas
 * (las extra de Yugipedia empiezan en 2.000.000.000), así nada intenta buscarles
 * precio ni ficha. Cada uno el suyo, por si algo agrupa por número.
 */
const ID_PERSONALIZADO = 3_000_000_000;

const TIPOS = ['Field Center Card', 'Tapete', 'Fundas', 'Caja de mazo', 'Carta promocional', 'Moneda / dado', 'Otro'];
const ESTADOS: CardCondition[] = ['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'];

interface Props {
  onClose: () => void;
  /** El que se edita; sin él, uno nuevo en la carpeta abierta. */
  existente?: Card | null;
}

export function PersonalizadoModal({ onClose, existente }: Props) {
  const { state, dispatch, toast } = useStore();
  const carpetas = state.db.folders.filter((f) => f.id !== ID_ALL);
  const carpetaInicial =
    existente?.folderId ?? (state.ui.activeFolderId && state.ui.activeFolderId !== ID_ALL ? state.ui.activeFolderId : (carpetas[0]?.id ?? ''));

  const [nombre, setNombre] = useState(existente?.name ?? '');
  const [tipo, setTipo] = useState(existente?.type ?? 'Field Center Card');
  const [img, setImg] = useState(existente && existente.img !== CARD_BACK_IMG ? existente.img : '');
  const [lang, setLang] = useState(existente?.lang ?? 'EN');
  const [estado, setEstado] = useState<CardCondition>(existente?.condition ?? 'NM');
  const [precio, setPrecio] = useState(existente?.personalizado?.precio != null ? String(existente.personalizado.precio) : '');
  const [enlace, setEnlace] = useState(existente?.personalizado?.enlace ?? '');
  const [notas, setNotas] = useState(existente?.obs ?? '');
  const [carpeta, setCarpeta] = useState(carpetaInicial);
  const [anadidos, setAnadidos] = useState(0);

  const guardar = (otro: boolean) => {
    if (!nombre.trim()) return toast('Ponle un nombre', 'err');
    if (!carpeta) return toast('Elige una carpeta', 'err');
    const p = Number.parseFloat(precio.replace(',', '.'));
    const enlaceLimpio = enlace.trim();
    const datos: Card = {
      ...(existente ?? {}),
      uid: existente?.uid ?? generateId(),
      folderId: carpeta,
      apiId: existente?.apiId ?? ID_PERSONALIZADO + Math.floor(Math.random() * 900_000_000),
      name: nombre.trim(),
      img: img.trim() || CARD_BACK_IMG,
      type: tipo.trim() || 'Otro',
      // El tipo hace de "rareza": es lo que se ve en la ficha en lugar de la rareza.
      rarity: tipo.trim() || 'Otro',
      rarityCode: '',
      setCode: '---',
      paid: existente?.paid ?? 0,
      lang,
      condition: estado,
      obs: notas.trim(),
      tags: existente?.tags ?? [],
      is1st: false,
      isLimited: false,
      isWanted: false,
      personalizado: {
        precio: Number.isFinite(p) && p >= 0 ? Math.round(p * 100) / 100 : undefined,
        enlace: /^https?:\/\//i.test(enlaceLimpio) ? enlaceLimpio : undefined,
      },
    };
    dispatch({ type: existente ? 'UPDATE_CARD' : 'ADD_CARD', payload: datos });
    if (otro) {
      // Mismo tipo, idioma, estado, precio y carpeta: solo cambia lo de cada uno.
      setNombre('');
      setImg('');
      setEnlace('');
      setNotas('');
      setAnadidos((n) => n + 1);
      toast(`Añadido: ${datos.name}`);
      return;
    }
    toast(existente ? 'Artículo actualizado' : 'Artículo añadido');
    onClose();
  };

  const eliminar = () => {
    if (!existente) return;
    const index = state.db.cards.findIndex((c) => c.uid === existente.uid);
    dispatch({ type: 'DELETE_CARD', payload: existente.uid });
    toast('Artículo eliminado', 'ok', () => {
      dispatch({ type: 'RESTORE_CARD', payload: { card: existente, index } });
      toast('Artículo restaurado');
    });
    onClose();
  };

  const campo = 'w-full bg-bg-panel border border-border-base text-main rounded-lg p-2 text-sm focus:border-primary outline-none';
  const etiqueta = 'text-xs font-medium text-muted block mb-1';

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-personalizado"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-bg-surface border border-border-base rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
      >
        <div className="p-4 border-b border-border-base flex items-center justify-between shrink-0 bg-bg-panel rounded-t-2xl">
          <div>
            <h3 id="titulo-personalizado" className="font-bold text-lg text-main">
              {existente ? 'Artículo personalizado' : 'Nuevo artículo personalizado'}
            </h3>
            <p className="text-xs text-muted">Para lo que no está en la base de datos de cartas: Field Center Cards, tapetes, promocionales…</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 hover:bg-main/10 rounded text-main/70 hover:text-main">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-5">
            {/* Vista previa */}
            <div className="mx-auto w-[140px] sm:w-full">
              <div className="aspect-[421/614] rounded-[4%/3%] overflow-hidden bg-black/30 border border-border-base shadow-lg">
                <img src={img.trim() || CARD_BACK_IMG} onError={onCardImageError} alt="" className="w-full h-full object-cover" />
              </div>
              {enlace.trim() && /^https?:\/\//i.test(enlace.trim()) && (
                <a
                  href={enlace.trim()}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-sky-400 hover:underline"
                >
                  Abrir en Cardmarket <ExternalLink size={12} />
                </a>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className={etiqueta} htmlFor="p-nombre">Nombre</label>
                <input
                  id="p-nombre"
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="p. ej. Field Center Card — Empire of Endymion"
                  className={campo}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={etiqueta} htmlFor="p-tipo">Tipo</label>
                  <input id="p-tipo" list="p-tipos" value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo} />
                  <datalist id="p-tipos">
                    {TIPOS.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={etiqueta} htmlFor="p-carpeta">Carpeta</label>
                  <select id="p-carpeta" value={carpeta} onChange={(e) => setCarpeta(e.target.value)} className={campo}>
                    {carpetas.map((f) => (
                      <option key={f.id} value={f.id} className="bg-bg-panel">
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={etiqueta} htmlFor="p-img">Imagen (URL)</label>
                <input id="p-img" value={img} onChange={(e) => setImg(e.target.value)} placeholder="https://…" className={campo} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={etiqueta} htmlFor="p-precio">Valor (€)</label>
                  <input
                    id="p-precio"
                    inputMode="decimal"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    placeholder="Sin precio"
                    className={campo}
                    title="Cuenta en el valor de la carpeta y de la colección. Es manual: actualízalo cuando quieras."
                  />
                </div>
                <div>
                  <label className={etiqueta} htmlFor="p-enlace">Enlace de Cardmarket (opcional)</label>
                  <input id="p-enlace" value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://www.cardmarket.com/…" className={campo} />
                </div>
              </div>

              <div>
                <span className={etiqueta}>Idioma</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {IDIOMAS.map((idioma) => (
                    <button
                      key={idioma.id}
                      type="button"
                      onClick={() => setLang(idioma.id)}
                      title={idioma.nombre}
                      aria-pressed={lang === idioma.id}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold transition-all ${
                        lang === idioma.id ? 'bg-primary/15 border-primary text-main' : 'bg-bg-panel border-transparent text-muted hover:bg-main/5 hover:text-main'
                      }`}
                    >
                      <LanguageFlag lang={idioma.id} size={14} />
                      {idioma.id}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className={etiqueta}>Estado</span>
                <div className="flex flex-wrap gap-2">
                  {ESTADOS.map((e) => {
                    const meta = getConditionMeta(e);
                    const elegido = estado === e;
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEstado(e)}
                        aria-pressed={elegido}
                        className={`flex-1 min-w-[44px] py-2 rounded-lg text-sm font-bold border transition-all ${
                          elegido ? 'text-main shadow-lg' : 'bg-bg-panel border-transparent text-muted hover:bg-main/5 hover:text-main'
                        }`}
                        style={{ backgroundColor: elegido ? `${meta.color}20` : undefined, borderColor: elegido ? meta.color : 'transparent', color: elegido ? meta.color : undefined }}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className={etiqueta} htmlFor="p-notas">Notas (opcional)</label>
                <textarea id="p-notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={`${campo} resize-none`} />
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border-base bg-bg-panel rounded-b-2xl flex flex-wrap items-center gap-2 shrink-0">
          {existente ? (
            <button
              type="button"
              onClick={eliminar}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10"
            >
              <Trash2 size={15} /> Eliminar
            </button>
          ) : (
            anadidos > 0 && <span className="text-xs text-muted">{anadidos} añadido{anadidos === 1 ? '' : 's'}</span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-main bg-main/5 hover:bg-main/10">
              {anadidos > 0 ? 'Cerrar' : 'Cancelar'}
            </button>
            {!existente && (
              <button
                type="button"
                onClick={() => guardar(true)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-main border border-primary/50 hover:bg-primary/10"
                title="Guarda este y deja el formulario con el mismo tipo, idioma, estado y precio para el siguiente"
              >
                Guardar y añadir otro
              </button>
            )}
            <button type="button" onClick={() => guardar(false)} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-black hover:brightness-110">
              {existente ? 'Guardar' : 'Añadir'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
