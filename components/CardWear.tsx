import { useMemo, type CSSProperties } from 'react';
import './CardWear.css';

/*
 * Desgaste de la carta según su estado, imitando cómo se gasta una carta real
 * (guías de estado de tiendas y de gradeo): el daño es LOCAL, no un cambio de
 * color de toda la carta.
 *
 *   - Canto: puntos y desconchones blancos sueltos, donde la tinta se ha ido y
 *     asoma el cartón. En los bordes oscuros de Yu-Gi-Oh! se ven mucho.
 *   - Esquinas: blanqueadas y algo romas; sobre todo arriba a la izquierda y
 *     abajo a la derecha, que son las que más se gastan.
 *   - Arañazos: rayas finas que casi no se ven de frente y brillan cuando les
 *     da la luz (al inclinar la carta).
 *   - Pliegues (PL y PO): la tinta se agrieta y deja una línea blanca, con
 *     sombra a un lado.
 *   - Suciedad (desde LP): motitas oscuras y alguna mancha.
 *
 *   ESTADO  DESCONCHONES  ESQUINAS   ARAÑAZOS  PLIEGUES  SUCIEDAD
 *   EX      unos pocos    apenas     1         —         —
 *   GD      bastantes     leves      3         —         —
 *   LP      muchos        blancas    6         —         pocas motas
 *   PL      muchísimos    gastadas   10        1         motas
 *   PO      todo el canto romas      15        2         motas y mancha
 *
 * Las marcas salen de una semilla (la id de la copia): cada carta tiene las
 * suyas y son siempre las mismas. Va dentro de .card-tilt: se inclina con la
 * carta. Todo es SVG simple y una textura de ruido compartida.
 */

const NIVEL: Record<string, number> = { MT: 0, NM: 0, EX: 1, GD: 2, LP: 3, PL: 4, PO: 5 };
const DESCONCHONES = [0, 10, 26, 50, 85, 140];
const ARANAZOS = [0, 1, 3, 6, 10, 15];
const PLIEGUES = [0, 0, 0, 0, 1, 2];
const MOTAS = [0, 0, 0, 6, 14, 30];
/** Tamaño de cada esquina gastada (unidades del SVG, la carta mide 421 × 614). */
const ESQUINA = [0, 9, 14, 20, 28, 38];

const ANCHO = 421;
const ALTO = 614;

/** Generador pseudoaleatorio con semilla (mulberry32): mismas marcas para la misma copia. */
function aleatorio(semilla: string) {
  let h = 1779033703;
  for (let i = 0; i < semilla.length; i++) h = Math.imul(h ^ semilla.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Textura de motas, una sola vez para toda la página: rompe el borde de las esquinas. */
let ruido: string | null = null;
function texturaRuido(): string {
  if (ruido != null) return ruido;
  ruido = 'none';
  try {
    const lado = 128;
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d');
    if (!ctx) return ruido;
    const img = ctx.createImageData(lado, lado);
    const rnd = aleatorio('ruido-desgaste');
    for (let i = 0; i < lado * lado; i++) {
      const v = rnd();
      img.data[i * 4 + 3] = v > 0.35 ? Math.round(Math.min(1, (v - 0.35) / 0.45) * 255) : 0;
    }
    ctx.putImageData(img, 0, 0);
    ruido = `url("${canvas.toDataURL('image/png')}")`;
  } catch {
    // Sin canvas: las esquinas salen lisas, nada más.
  }
  return ruido;
}

/** Un punto del perímetro (t de 0 a 1, una vuelta) y la dirección hacia el interior. */
function puntoDelCanto(t: number) {
  const p = (((t % 1) + 1) % 1) * 2 * (ANCHO + ALTO);
  if (p < ANCHO) return { x: p, y: 0, nx: 0, ny: 1 };
  if (p < ANCHO + ALTO) return { x: ANCHO, y: p - ANCHO, nx: -1, ny: 0 };
  if (p < 2 * ANCHO + ALTO) return { x: ANCHO - (p - ANCHO - ALTO), y: ALTO, nx: 0, ny: -1 };
  return { x: 0, y: ALTO - (p - 2 * ANCHO - ALTO), nx: 1, ny: 0 };
}

const fmt = (p: number[][]) => p.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ');

interface Props {
  condition: string;
  /** Algo único y estable de la copia (su uid). */
  seed: string;
}

export default function CardWear({ condition, seed }: Props) {
  const nivel = NIVEL[condition] ?? 0;

  const marcas = useMemo(() => {
    if (!nivel) return null;
    const rnd = aleatorio(`${seed}-${condition}`);
    const perimetro = 2 * (ANCHO + ALTO);
    const esquinasT = [0, ANCHO, ANCHO + ALTO, 2 * ANCHO + ALTO].map((v) => v / perimetro);

    // Desconchones del canto: pequeños polígonos blancos pegados al borde, más
    // abundantes cerca de las esquinas (es donde más se roza la carta).
    const desconchones = Array.from({ length: DESCONCHONES[nivel] ?? 0 }, () => {
      let t = rnd();
      if (rnd() < 0.45) {
        const cerca = esquinasT.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
        t = cerca + (t - cerca) * 0.25;
      }
      const { x, y, nx, ny } = puntoDelCanto(t);
      const largo = 2 + rnd() * (2 + nivel * 2.2);
      const hondo = 1 + rnd() * (1 + nivel * 1.2);
      const tx = -ny; // Tangente al canto.
      const ty = nx;
      const a = 0.5 + rnd() * 0.6;
      const b = 0.4 + rnd() * 0.5;
      const puntos = [
        [x - tx * largo, y - ty * largo],
        [x + nx * hondo * a - tx * largo * 0.3, y + ny * hondo * a - ty * largo * 0.3],
        [x + nx * hondo, y + ny * hondo],
        [x + nx * hondo * b + tx * largo * 0.5, y + ny * hondo * b + ty * largo * 0.5],
        [x + tx * largo, y + ty * largo],
      ];
      return { d: fmt(puntos), opacidad: 0.7 + rnd() * 0.3 };
    });

    // Esquinas: arriba-izquierda y abajo-derecha, las que más se gastan.
    const base = ESQUINA[nivel] ?? 0;
    const esquinas = [1, 0.55 + rnd() * 0.35, 0.55 + rnd() * 0.35, 1].map((f) => base * f * (0.85 + rnd() * 0.3));

    // Arañazos: rayas finas, más en la zona central de la carta.
    const aranazos = Array.from({ length: ARANAZOS[nivel] ?? 0 }, () => {
      const x = 50 + rnd() * 320;
      const y = 60 + rnd() * 500;
      const largo = 30 + rnd() * (50 + nivel * 22);
      const angulo = rnd() * Math.PI;
      return {
        x1: x,
        y1: y,
        x2: x + Math.cos(angulo) * largo,
        y2: y + Math.sin(angulo) * largo,
        ancho: 0.6 + rnd() * (0.4 + nivel * 0.15),
        opacidad: 0.5 + rnd() * 0.5,
      };
    });

    // Pliegues: de canto a canto, con una grieta blanca quebrada a lo largo.
    const pliegues = Array.from({ length: PLIEGUES[nivel] ?? 0 }, () => {
      const horizontal = rnd() > 0.5;
      const a = 90 + rnd() * (horizontal ? 430 : 240);
      const b = 90 + rnd() * (horizontal ? 430 : 240);
      const pasos = 14;
      const puntos: number[][] = [];
      for (let i = 0; i <= pasos; i++) {
        const f = i / pasos;
        const sacudida = (rnd() - 0.5) * 2.2;
        puntos.push(horizontal ? [f * ANCHO, a + (b - a) * f + sacudida] : [a + (b - a) * f + sacudida, f * ALTO]);
      }
      return fmt(puntos);
    });

    // Suciedad: motitas oscuras y, en Poor, una mancha.
    const motas = Array.from({ length: MOTAS[nivel] ?? 0 }, () => ({
      x: 15 + rnd() * 391,
      y: 15 + rnd() * 584,
      r: 0.5 + rnd() * (0.6 + nivel * 0.25),
      opacidad: 0.25 + rnd() * 0.35,
    }));
    const mancha = nivel >= 5 ? { x: 20 + rnd() * 60, y: 20 + rnd() * 60, w: 12 + rnd() * 14, h: 8 + rnd() * 10 } : null;

    return { desconchones, esquinas, aranazos, pliegues, motas, mancha };
  }, [nivel, seed, condition]);

  if (!nivel || !marcas) return null;

  const [ai, ad, bi, bd] = marcas.esquinas.map((e) => `${((e / ANCHO) * 100).toFixed(2)}%`);
  const estilo = {
    '--ruido': texturaRuido(),
    '--esq-ai': ai,
    '--esq-ad': ad,
    '--esq-bi': bi,
    '--esq-bd': bd,
    ...(marcas.mancha
      ? {
          '--mancha': `radial-gradient(${marcas.mancha.w}% ${marcas.mancha.h}% at ${marcas.mancha.x}% ${marcas.mancha.y}%, rgba(95, 70, 35, 0.35), transparent)`,
        }
      : {}),
  } as CSSProperties;

  return (
    <div className={`desgaste desgaste--${nivel}`} style={estilo} aria-hidden="true">
      <div className="desgaste__esquinas" />
      {marcas.mancha && <div className="desgaste__mancha" />}
      <svg className="desgaste__marcas" viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none">
        {marcas.motas.map((m, i) => (
          <circle key={`m${i}`} cx={m.x} cy={m.y} r={m.r} fill="#2a2116" fillOpacity={m.opacidad} />
        ))}
        {/* Pliegues: sombra a un lado y la grieta blanca de la tinta encima. */}
        {marcas.pliegues.map((p, i) => (
          <g key={`p${i}`}>
            <polyline points={p} fill="none" stroke="#000" strokeWidth={4} strokeOpacity={0.22} transform="translate(2 2)" />
            <polyline points={p} fill="none" stroke="#fffaf0" strokeWidth={1.3} strokeOpacity={0.9} strokeLinejoin="round" />
          </g>
        ))}
        {marcas.desconchones.map((d, i) => (
          <polygon key={`d${i}`} points={d.d} fill="#f7f3ea" fillOpacity={d.opacidad} />
        ))}
      </svg>
      {/* Arañazos aparte: brillan cuando les da la luz (ver el CSS). */}
      <svg className="desgaste__marcas desgaste__aranazos" viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none">
        {marcas.aranazos.map((r, i) => (
          <line
            key={i}
            x1={r.x1}
            y1={r.y1}
            x2={r.x2}
            y2={r.y2}
            stroke="#fff"
            strokeWidth={r.ancho}
            strokeOpacity={r.opacidad}
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}
