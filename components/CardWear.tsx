import { useMemo, type CSSProperties } from 'react';
import './CardWear.css';

/*
 * Desgaste de la carta según su estado (escala de Cardmarket).
 *
 *   ESTADO  BORDES (blanqueado)  ESQUINAS   ARAÑAZOS  PLIEGUES  COLOR
 *   MT/NM   —                    —          —         —         —
 *   EX      unas motas           leves      —         —         —
 *   GD      más motas            gastadas   2–3       —         —
 *   LP      todo el canto        blancas    5–6       —         —
 *   PL      canto ancho          muy gastadas 9       1         algo apagado
 *   PO      canto muy ancho      rotas      13        2         apagado y sucio
 *
 * Las marcas salen de una semilla (la id de la copia): cada carta tiene las suyas
 * y son siempre las mismas. Va dentro de .card-tilt, así se inclina con la carta.
 *
 * Rendimiento: una sola textura de ruido (generada una vez con canvas y
 * compartida por todas las cartas) y unas pocas líneas SVG por carta. Sin
 * filtros SVG por carta, que con cientos de cartas se notarían.
 */

const NIVEL: Record<string, number> = { MT: 0, NM: 0, EX: 1, GD: 2, LP: 3, PL: 4, PO: 5 };
const ARANAZOS = [0, 0, 3, 6, 9, 13];
const PLIEGUES = [0, 0, 0, 0, 1, 2];

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

/** Textura de motas blancas, una sola vez para toda la página. */
let ruido: string | null = null;
function texturaRuido(): string {
  if (ruido != null) return ruido;
  ruido = 'none';
  try {
    const lado = 160;
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d');
    if (!ctx) return ruido;
    const img = ctx.createImageData(lado, lado);
    const rnd = aleatorio('ruido-desgaste');
    for (let i = 0; i < lado * lado; i++) {
      const v = rnd();
      // Pocas motas, de opacidad variable: el blanqueado real es irregular.
      const alfa = v > 0.62 ? Math.round(((v - 0.62) / 0.38) * 255) : 0;
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 252;
      img.data[i * 4 + 2] = 245;
      img.data[i * 4 + 3] = alfa;
    }
    ctx.putImageData(img, 0, 0);
    ruido = `url("${canvas.toDataURL('image/png')}")`;
  } catch {
    // Sin canvas (p. ej. en pruebas): solo se pierden las motas.
  }
  return ruido;
}

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
    // Arañazos: rayas finas y rectas, sobre todo en el centro de la carta.
    const aranazos = Array.from({ length: ARANAZOS[nivel] ?? 0 }, () => {
      const x = 40 + rnd() * 340;
      const y = 40 + rnd() * 530;
      const largo = 40 + rnd() * (60 + nivel * 25);
      const angulo = rnd() * Math.PI;
      return {
        x1: x,
        y1: y,
        x2: x + Math.cos(angulo) * largo,
        y2: y + Math.sin(angulo) * largo,
        ancho: 0.5 + rnd() * 0.8,
        opacidad: 0.12 + rnd() * (0.08 + nivel * 0.05),
      };
    });
    // Pliegues: de un canto a otro, con una leve curva.
    const pliegues = Array.from({ length: PLIEGUES[nivel] ?? 0 }, () => {
      const horizontal = rnd() > 0.5;
      const a = 80 + rnd() * (horizontal ? 450 : 260);
      const b = 80 + rnd() * (horizontal ? 450 : 260);
      const curva = (rnd() - 0.5) * 40;
      return horizontal
        ? `M0 ${a} Q 210 ${(a + b) / 2 + curva} 421 ${b}`
        : `M${a} 0 Q ${(a + b) / 2 + curva} 307 ${b} 614`;
    });
    // Manchas (solo Poor).
    const manchas =
      nivel >= 5
        ? Array.from({ length: 4 }, () => ({ x: rnd() * 100, y: rnd() * 100, r: 8 + rnd() * 18 }))
        : [];
    return { aranazos, pliegues, manchas };
  }, [nivel, seed, condition]);

  if (!nivel || !marcas) return null;

  const estilo = {
    '--ruido': texturaRuido(),
    ...(marcas.manchas.length
      ? {
          '--manchas': marcas.manchas
            .map((m) => `radial-gradient(circle at ${m.x}% ${m.y}%, rgba(110, 80, 40, 0.55), transparent ${m.r}%)`)
            .join(', '),
        }
      : {}),
  } as CSSProperties;

  return (
    <div className={`desgaste desgaste--${nivel}`} style={estilo} aria-hidden="true">
      <div className="desgaste__canto" />
      <div className="desgaste__esquinas" />
      {nivel >= 4 && <div className="desgaste__apagado" />}
      {nivel >= 5 && <div className="desgaste__sucio" />}
      <svg className="desgaste__marcas" viewBox="0 0 421 614" preserveAspectRatio="none">
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
        {marcas.pliegues.map((d, i) => (
          <g key={i}>
            {/* Un pliegue es una arista: un lado coge luz y el otro sombra. */}
            <path d={d} fill="none" stroke="#000" strokeWidth={2.2} strokeOpacity={0.28} transform="translate(1.2 1.2)" />
            <path d={d} fill="none" stroke="#fff" strokeWidth={1.4} strokeOpacity={0.5} />
          </g>
        ))}
      </svg>
    </div>
  );
}
