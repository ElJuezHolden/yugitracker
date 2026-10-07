import { useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTableLayout } from './useTableLayout';

interface Props {
  /** Cuántas cartas hay que extender sobre la mesa. */
  count: number;
  /** Columnas aproximadas para el primer instante, antes de medir el hueco. */
  provisional?: CSSProperties;
  children: ReactNode;
}

/**
 * Vista mesa (display): las cartas de la carpeta enteras y lo más grandes posible
 * dentro de la ventana (ver useTableLayout). Cada celda tiene la proporción de
 * una carta, así que no se recorta ninguna.
 */
export function DisplayTable({ count, provisional, children }: Props) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const mesa = useTableLayout(el, count, count > 0);
  return (
    <motion.div
      ref={setEl}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="grid w-full justify-center content-start"
      style={
        mesa
          ? { gridTemplateColumns: `repeat(${mesa.columnas}, ${mesa.ancho}px)`, gridAutoRows: `${Math.floor((mesa.ancho * 614) / 421)}px`, gap: '6px' }
          : { gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '6px', ...provisional, gridTemplateRows: undefined }
      }
    >
      {children}
    </motion.div>
  );
}
