import { useEffect, useState } from 'react';

/*
 * Vista "mesa" (display): todas las cartas de la carpeta a la vez, enteras y lo
 * más grandes posible, como si se extendieran sobre la mesa. Se mide el hueco
 * que queda en la ventana (ancho del contenido y alto hasta abajo) y se prueban
 * todas las columnas posibles: gana la que deja la carta más grande sin que
 * nada se salga ni se recorte.
 */
const PROPORCION = 421 / 614; // ancho / alto de una carta
const HUECO = 6; // separación entre cartas, en px
const MARGEN_ABAJO = 16;

export interface Mesa {
  columnas: number;
  /** Ancho de cada carta, en px. */
  ancho: number;
}

export function calcularMesa(n: number, ancho: number, alto: number): Mesa | null {
  if (n <= 0 || ancho <= 0 || alto <= 0) return null;
  let mejor: Mesa | null = null;
  for (let columnas = 1; columnas <= n; columnas++) {
    const filas = Math.ceil(n / columnas);
    const porAncho = (ancho - HUECO * (columnas - 1)) / columnas;
    const porAlto = ((alto - HUECO * (filas - 1)) / filas) * PROPORCION;
    const w = Math.floor(Math.min(porAncho, porAlto));
    if (w > 0 && (!mejor || w > mejor.ancho)) mejor = { columnas, ancho: w };
  }
  return mejor;
}

/** La mejor disposición para `n` cartas en el hueco del elemento `el` (null si no está activa). */
export function useTableLayout(el: HTMLElement | null, n: number, activa: boolean): Mesa | null {
  const [mesa, setMesa] = useState<Mesa | null>(null);
  useEffect(() => {
    if (!activa || !el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      // El alto desde donde empieza la mesa (sin contar lo desplazado) hasta el borde de la ventana.
      const arriba = Math.max(0, r.top + window.scrollY);
      const alto = Math.max(240, window.innerHeight - arriba - MARGEN_ABAJO);
      setMesa(calcularMesa(n, el.clientWidth, alto));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener('resize', medir);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', medir);
    };
  }, [el, n, activa]);
  return activa ? mesa : null;
}
