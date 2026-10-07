import { Children, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTableLayout } from './useTableLayout';
import { MesaContexto } from './mesaContexto';

interface Props {
  /** Cuántas cartas hay que extender sobre la mesa. */
  count: number;
  /** Columnas aproximadas para el primer instante, antes de medir el hueco. */
  provisional?: CSSProperties;
  children: ReactNode;
}

const HUECO = 6;
/** Filas de más por arriba y por abajo de lo visible, para que al hacer scroll ya estén. */
const FILAS_EXTRA = 4;
/** Con menos cartas se pintan todas (no compensa). */
const CARTAS_VIRTUAL = 200;

/**
 * Vista mesa (display): las cartas de la carpeta enteras y lo más grandes posible
 * dentro de la ventana (ver useTableLayout). Cada celda tiene la proporción de
 * una carta, así que no se recorta ninguna.
 *
 * Con muchas cartas (la colección completa) la mesa sigue hacia abajo y solo se
 * pintan las filas que se ven y unas pocas más: pintar miles de cartas a la vez
 * bloqueaba la página varios segundos.
 */
export function DisplayTable({ count, provisional, children }: Props) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const mesa = useTableLayout(el, count, count > 0);
  const ancho = mesa?.ancho;
  const contexto = useMemo(() => (ancho ? { ancho, cantidad: count } : null), [ancho, count]);

  const columnas = mesa?.columnas ?? 1;
  const altoFila = ancho ? Math.floor((ancho * 614) / 421) : 0;
  const paso = altoFila + HUECO;
  const filas = Math.ceil(count / columnas);
  const virtual = !!mesa && count > CARTAS_VIRTUAL;
  const [rango, setRango] = useState<[number, number]>([0, 0]);

  useEffect(() => {
    if (!virtual || !el || !paso) return;
    let marco = 0;
    const calcular = () => {
      marco = 0;
      const arriba = el.getBoundingClientRect().top;
      const desde = Math.max(0, Math.floor(-arriba / paso) - FILAS_EXTRA);
      const hasta = Math.min(filas, Math.ceil((window.innerHeight - arriba) / paso) + FILAS_EXTRA);
      setRango((r) => (r[0] === desde && r[1] === hasta ? r : [desde, hasta]));
    };
    const pedir = () => {
      if (!marco) marco = requestAnimationFrame(calcular);
    };
    pedir();
    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir);
    return () => {
      if (marco) cancelAnimationFrame(marco);
      window.removeEventListener('scroll', pedir);
      window.removeEventListener('resize', pedir);
    };
  }, [virtual, el, paso, filas]);

  const rejilla = mesa ? { gridTemplateColumns: `repeat(${columnas}, ${mesa.ancho}px)`, gridAutoRows: `${altoFila}px`, gap: `${HUECO}px` } : null;
  const todas = Children.toArray(children);
  // Sin medir aún, nada: si no, se pintaban una vez todas a tamaño provisional, con todos sus brillos.
  const visibles = !mesa ? [] : virtual ? todas.slice(rango[0] * columnas, rango[1] * columnas) : todas;

  return (
    <motion.div
      ref={setEl}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={virtual ? 'relative w-full' : 'grid w-full justify-center content-start'}
      style={
        virtual
          ? { height: filas * paso - HUECO }
          : (rejilla ?? { gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '6px', ...provisional, gridTemplateRows: undefined })
      }
    >
      <MesaContexto.Provider value={contexto}>
        {virtual ? (
          <div className="absolute left-0 right-0 grid justify-center content-start" style={{ ...rejilla, top: rango[0] * paso }}>
            {visibles}
          </div>
        ) : (
          visibles
        )}
      </MesaContexto.Provider>
    </motion.div>
  );
}
