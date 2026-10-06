import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../context/StoreContext';
import type { Folder, FolderAlign } from '../../types';
import { generateId, ID_ALL, normalizeStr, CARD_BACK_IMG } from '../../utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editId?: string | null;
  onSave?: (newFolderId: string) => void;
}

export const FolderModal: React.FC<Props> = ({ isOpen, onClose, editId, onSave }) => {
  const { state, dispatch, toast } = useStore();
  const [formData, setFormData] = useState<Partial<Folder>>({
    name: '',
    subtext: '',
    img: '',
    align: 'center'
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && editId) {
      const f = state.db.folders.find(x => x.id === editId);
      if (f) setFormData({ ...f });
    } else {
      setFormData({ name: '', subtext: '', img: '', align: 'center' });
    }
    setShowDeleteConfirm(false);
  }, [isOpen, editId, state.db.folders]);

  const handleSave = () => {
    if (!formData.name) return toast("Falta nombre", "err");
    
    // Check for duplicate name
    const normalizedNewName = normalizeStr(formData.name.trim());
    const duplicate = state.db.folders.find(f => 
        normalizeStr(f.name) === normalizedNewName && f.id !== editId
    );

    if (duplicate) {
        return toast("Ya existe una carpeta con ese nombre", "err");
    }

    const id = editId || generateId();
    const newFolder: Folder = {
      id: id,
      name: formData.name.trim(),
      subtext: formData.subtext || '',
      img: formData.img || 'https://images.ygoprodeck.com/images/cards/back_high.jpg',
      align: (formData.align as FolderAlign) || 'center'
    };

    dispatch({ type: 'SAVE_FOLDER', payload: newFolder });
    toast("Carpeta guardada");
    
    if (onSave) onSave(id);
    onClose();
  };

  const handleDelete = () => {
    if (!editId) return;
    if (editId === ID_ALL) return toast("No se puede borrar el sistema", "err");
    
    // Backup data before deletion
    const folderToRestore = state.db.folders.find(f => f.id === editId);
    const currentIndex = state.db.folders.findIndex(f => f.id === editId);
    const cardsInFolder = state.db.cards.filter(c => c.folderId === editId);

    dispatch({ type: 'DELETE_FOLDER', payload: editId });
    
    toast("Carpeta eliminada", "ok", () => {
        if (folderToRestore) {
            dispatch({ type: 'RESTORE_FOLDER', payload: { folder: folderToRestore, index: currentIndex } });
            if (cardsInFolder.length > 0) {
                cardsInFolder.forEach(c => dispatch({ type: 'ADD_CARD', payload: c }));
            }
            toast("Carpeta restaurada");
        }
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-lg bg-bg-surface border border-border-base rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-5 border-b border-border-base">
          <h3 className="text-xl font-bold text-main">Carpeta</h3>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="text-center">
            <label className="block text-sm text-muted mb-2">Vista Previa</label>
            <div className="w-full aspect-video bg-bg-panel rounded-xl overflow-hidden relative border border-border-base">
              <img 
                src={formData.img || CARD_BACK_IMG} 
                className="w-full h-full object-cover transition-all duration-300"
                style={{ objectPosition: formData.align }}
                alt="Preview"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end items-start p-4">
                <div className="font-bold text-lg leading-tight text-white">{formData.name || 'Nueva Carpeta'}</div>
                {formData.subtext && <div className="text-sm text-gray-300">{formData.subtext}</div>}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Nombre</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-bg-panel border border-border-base text-main rounded-lg p-2.5 focus:border-primary focus:outline-none placeholder-main/30"
                placeholder="Ej: Deck Principal"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Subtexto (Opcional)</label>
              <input 
                type="text" 
                value={formData.subtext}
                onChange={e => setFormData({ ...formData, subtext: e.target.value })}
                className="w-full bg-bg-panel border border-border-base text-main rounded-lg p-2.5 focus:border-primary focus:outline-none placeholder-main/30"
                placeholder="Ej: 2024 Format"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">URL Portada</label>
              <input 
                type="text" 
                value={formData.img}
                onChange={e => setFormData({ ...formData, img: e.target.value })}
                className="w-full bg-bg-panel border border-border-base text-main rounded-lg p-2.5 focus:border-primary focus:outline-none placeholder-main/30"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Alineación</label>
              <select 
                value={formData.align}
                onChange={e => setFormData({ ...formData, align: e.target.value as FolderAlign })}
                className="w-full bg-bg-panel border border-border-base text-main rounded-lg p-2.5 focus:border-primary focus:outline-none"
              >
                <option value="center">Centro</option>
                <option value="top">Arriba</option>
                <option value="bottom">Abajo</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border-base bg-bg-panel flex justify-between gap-3">
            {editId && editId !== ID_ALL ? (
                 showDeleteConfirm ? (
                    <div className="flex items-center gap-2 animate-fadeIn">
                        <span className="text-xs text-red-400 font-bold hidden sm:block">¿Seguro?</span>
                        <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-2 rounded-lg bg-bg-surface text-main text-xs hover:bg-main/10 border border-border-base">Cancelar</button>
                        <button onClick={handleDelete} className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-500">Sí, eliminar</button>
                    </div>
                 ) : (
                    <button onClick={() => setShowDeleteConfirm(true)} className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 font-semibold text-sm transition-colors border border-red-500/20">Eliminar</button>
                 )
            ) : <div />}
         
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-bg-surface hover:bg-main/10 text-main text-sm font-semibold transition-colors border border-border-base">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-primary hover:brightness-110 text-black text-sm font-bold transition-transform active:scale-95 shadow-lg shadow-primary/20">Guardar</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};