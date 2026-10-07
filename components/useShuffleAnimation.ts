import { useEffect, useRef } from 'react';
import { CARD_BACK_IMG } from '../utils';

/*
 * Animación de barajar al cambiar el orden de una carpeta. Las cartas que se ven
 * se dan la vuelta, se juntan en un mazo, se barajan (el mazo se parte en dos y
 * se intercala) y se reparten a sus nuevos sitios, boca arriba. Unos 0,9 s.
 *
 * Va en una capa aparte por encima de la cuadrícula, con copias de las cartas,
 * para no pelearse con la recolocación de framer-motion: mientras dura, las de
 * verdad se ocultan, y se reparten a donde han quedado ya ordenadas.
 */
const MAX_CARTAS = 36;
const P = 'perspective(900px)';

// El dorso se descarga ya, para que no salga un hueco en blanco la primera vez que se baraja.
if (typeof Image !== 'undefined') new Image().src = CARD_BACK_IMG;
const RECOGER_MS = 430;
const REPARTIR_MS = 480;

const visible = (r: DOMRect) => r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;

function cartasVisibles(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('main .card-container')]
    .filter((el) => visible(el.getBoundingClientRect()))
    .slice(0, MAX_CARTAS);
}

/** Una carta de la animación: cara (la carta) y dorso, con su giro en 3D. */
function crearCarta(capa: HTMLElement, rect: DOMRect, imagen: string): { el: HTMLElement; cara: HTMLImageElement } {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transformStyle: 'preserve-3d',
    willChange: 'transform',
  });
  const lado = (src: string, girada: boolean) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    Object.assign(img.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      borderRadius: '3% / 2%',
      backfaceVisibility: 'hidden',
      boxShadow: '0 6px 14px -6px rgba(0,0,0,.7)',
      transform: girada ? 'rotateY(180deg)' : 'none',
    });
    el.appendChild(img);
    return img;
  };
  const cara = lado(imagen, false);
  lado(CARD_BACK_IMG, true);
  capa.appendChild(el);
  return { el, cara };
}

async function barajar() {
  const origen = cartasVisibles();
  if (origen.length < 2) return;
  const main = document.querySelector('main');
  const capa = document.createElement('div');
  // Sin perspectiva común: cada carta lleva la suya (P) y gira sobre sí misma; con una
  // sola para toda la pantalla, las de los lados se deformaban como cuñas al girar.
  Object.assign(capa.style, { position: 'fixed', inset: '0', zIndex: '85', pointerEvents: 'none' });
  document.body.appendChild(capa);
  main?.classList.add('barajando');

  try {
    const rects = origen.map((el) => el.getBoundingClientRect());
    // El mazo: en el centro de las cartas que se ven.
    const cx = rects.reduce((s, r) => s + r.left + r.width / 2, 0) / rects.length;
    const cy = rects.reduce((s, r) => s + r.top + r.height / 2, 0) / rects.length;
    const giro = () => `${(Math.random() * 10 - 5).toFixed(1)}deg`;
    const separa = Math.min(60, rects[0]!.width * 0.35);

    const cartas = rects.map((r, i) => {
      const { el, cara } = crearCarta(capa, r, origen[i]!.querySelector('img')?.src ?? CARD_BACK_IMG);
      return { el, cara, giro: giro(), mitad: i % 2 === 0 ? -1 : 1 };
    });

    // 1. Boca abajo, al mazo, y el mazo se parte en dos.
    await Promise.all(
      cartas.map(({ el, giro: g, mitad }, i) => {
        const r = rects[i]!;
        const dx = cx - (r.left + r.width / 2);
        const dy = cy - (r.top + r.height / 2);
        return el.animate(
          [
            { transform: `${P} translate(0,0) rotateY(0deg)` },
            { transform: `${P} translate(0,0) rotateY(180deg)`, offset: 0.3 },
            { transform: `${P} translate(${dx}px,${dy}px) rotateY(180deg) rotateZ(${g}) scale(.8)`, offset: 0.75 },
            { transform: `${P} translate(${dx + mitad * separa}px,${dy - 6}px) rotateY(180deg) rotateZ(${g}) scale(.8)` },
          ],
          { duration: RECOGER_MS, delay: Math.min(i * 6, 120), easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
        ).finished;
      }),
    );

    // 2. Las cartas ya están en su nuevo orden: se reparten a donde han quedado.
    const destino = cartasVisibles();
    const rectsDestino = destino.map((el) => el.getBoundingClientRect());
    await Promise.all(
      cartas.map(({ el, cara, giro: g, mitad }, i) => {
        const r = rectsDestino[i];
        if (!r) {
          // Sobran cartas (ahora caben menos): se desvanecen en el mazo.
          return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }).finished;
        }
        cara.src = destino[i]!.querySelector('img')?.src ?? cara.src;
        Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        const dx = cx - (r.left + r.width / 2);
        const dy = cy - (r.top + r.height / 2);
        el.getAnimations().forEach((a) => a.cancel());
        return el.animate(
          [
            { transform: `${P} translate(${dx + mitad * separa}px,${dy - 6}px) rotateY(180deg) rotateZ(${g}) scale(.8)` },
            { transform: `${P} translate(${dx}px,${dy}px) rotateY(180deg) rotateZ(${g}) scale(.8)`, offset: 0.2 },
            { transform: `${P} translate(0,0) rotateY(180deg) rotateZ(0deg) scale(1)`, offset: 0.72 },
            { transform: `${P} translate(0,0) rotateY(360deg) rotateZ(0deg) scale(1)` },
          ],
          { duration: REPARTIR_MS, delay: Math.min(i * 14, 260), easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
        ).finished;
      }),
    );
  } catch {
    // Si algo falla (pestaña oculta, animación cancelada), se enseñan las cartas sin más.
  } finally {
    capa.remove();
    main?.classList.remove('barajando');
  }
}

/**
 * Baraja las cartas cuando cambia `orden` dentro de la misma carpeta (no al
 * entrar en otra ni en la portada).
 */
export function useShuffleAnimation(orden: string, carpeta: string | null, activa: boolean) {
  const anterior = useRef<{ orden: string; carpeta: string | null } | null>(null);
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = { orden, carpeta };
    if (!activa || !antes || antes.carpeta !== carpeta || antes.orden === orden) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    void barajar();
  }, [orden, carpeta, activa]);
}
