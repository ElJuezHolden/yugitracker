import { useEffect, useRef } from 'react';

/**
 * Hace que una carta reaccione al puntero como una carta física bajo la luz.
 *
 * Devuelve un `ref` que hay que poner en el contenedor de la carta. Mientras el
 * cursor está encima escribe estas variables CSS sobre ese elemento:
 *
 *   --pointer-x / --pointer-y      posición del cursor dentro de la carta (%)
 *   --background-x / --background-y  lo mismo, pero lo usa el foil para
 *                                    desplazar su degradado en sentido contrario
 *   --pointer-from-center          0 en el centro, 1 en los bordes
 *   --rotate-x / --rotate-y        inclinación en 3D, en grados
 *   --card-active                  0 en reposo, 1 con el cursor encima
 *
 * Dos decisiones que importan:
 *
 * 1. Se escribe directamente en el nodo, sin pasar por el estado de React. Un
 *    `setState` por cada píxel de movimiento repintaría toda la cuadrícula.
 * 2. Las actualizaciones se agrupan en un `requestAnimationFrame`. `pointermove`
 *    dispara muchas más veces de las que el navegador pinta, y escribir estilos
 *    en cada evento provoca recálculos de más.
 *
 * `pointermove` solo se escucha mientras el cursor está encima, así que con
 * cientos de cartas en pantalla no hay cientos de escuchas activas.
 */
export function useCardPointer(enabled = true) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let frame = 0;
    let ultimo: { x: number; y: number } | null = null;

    const aplicar = () => {
      frame = 0;
      if (!ultimo) return;
      const { x, y } = ultimo;

      // De 0..1 a -1..1, que es lo que necesita la inclinación.
      const dx = x * 2 - 1;
      const dy = y * 2 - 1;
      // Se limita a 1 para que las esquinas no disparen el brillo de más.
      const distancia = Math.min(1, Math.hypot(dx, dy));

      el.style.setProperty('--pointer-x', `${x * 100}%`);
      el.style.setProperty('--pointer-y', `${y * 100}%`);
      el.style.setProperty('--background-x', `${x * 100}%`);
      el.style.setProperty('--background-y', `${y * 100}%`);
      el.style.setProperty('--pointer-from-center', distancia.toFixed(3));
      // Signo invertido: al llevar el cursor arriba, la carta se inclina hacia atrás.
      el.style.setProperty('--rotate-x', `${(-dx * 13).toFixed(2)}deg`);
      el.style.setProperty('--rotate-y', `${(dy * 13).toFixed(2)}deg`);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      ultimo = {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      };
      if (!frame) frame = requestAnimationFrame(aplicar);
    };

    const onEnter = () => {
      el.style.setProperty('--card-active', '1');
      el.addEventListener('pointermove', onMove);
    };

    const onLeave = () => {
      el.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      ultimo = null;
      // Se limpian: la transición del CSS devuelve la carta a su sitio sola.
      el.style.setProperty('--card-active', '0');
      for (const v of ['--pointer-x', '--pointer-y', '--background-x', '--background-y',
        '--pointer-from-center', '--rotate-x', '--rotate-y']) {
        el.style.removeProperty(v);
      }
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return ref;
}
