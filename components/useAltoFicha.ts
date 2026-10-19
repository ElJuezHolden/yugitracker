import { useEffect } from 'react';

/*
 * Alto de una ficha de la cuadrícula, en --alto-ficha sobre la rejilla. Las
 * fichas que aún no se han pintado (content-visibility, ver index.css) ocupan
 * ese alto: así la barra de scroll mide lo que medirá, sin saltos. Todas las
 * fichas de la rejilla miden lo mismo; basta con mirar la primera.
 */
export function useAltoFicha(el: HTMLElement | null, activo: boolean) {
  useEffect(() => {
    if (!activo || !el || typeof ResizeObserver === 'undefined') return;
    let observada: Element | null = null;
    const medir = new ResizeObserver(([e]) => {
      const alto = e?.borderBoxSize?.[0]?.blockSize ?? e?.contentRect.height;
      if (alto) el.style.setProperty('--alto-ficha', `${Math.round(alto)}px`);
    });
    // La primera ficha cambia al ordenar o filtrar: se vuelve a elegir.
    const elegir = () => {
      const primera = el.querySelector('.ficha-carta');
      if (primera === observada) return;
      if (observada) medir.unobserve(observada);
      observada = primera;
      if (primera) medir.observe(primera);
    };
    elegir();
    const cambios = new MutationObserver(elegir);
    cambios.observe(el, { childList: true });
    return () => {
      medir.disconnect();
      cambios.disconnect();
    };
  }, [el, activo]);
}
