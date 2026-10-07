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
    /*
     * Varias semillas, para que cada copia sea única:
     *   - el "carácter" de la copia (solo su id, igual en cualquier estado): qué
     *     esquinas y qué cantos se gastan más (como si siempre se cogiera por el
     *     mismo lado), si los arañazos van sueltos o en tandas paralelas (de una
     *     funda), dónde se acumula la suciedad y cuántas marcas tiene respecto a
     *     lo que toca a su estado;
     *   - una por cada tipo de marca y estado, independientes entre sí.
     */
    const perfil = aleatorio(`${seed}-perfil`);
    const semilla = (tipo: string) => aleatorio(`${seed}-${condition}-${tipo}`);
    const cuanto = (n: number, min: number, max: number) => Math.round(n * (min + perfil() * (max - min)));

    const pesoEsquinas = [0, 1, 2, 3].map(() => 0.35 + perfil() * 0.65);
    const dominante = Math.floor(perfil() * 4);
    pesoEsquinas[dominante] = 1;
    if (perfil() < 0.5) pesoEsquinas[3 - dominante] = 1; // A veces también la opuesta.
    const pesoCantos = [0, 1, 2, 3].map(() => 0.4 + perfil() * 1.2); // arriba, derecha, abajo, izquierda
    const enTandas = perfil() < 0.4;
    const anguloTanda = perfil() * Math.PI;
    const zonaSucia = { x: 40 + perfil() * 340, y: 60 + perfil() * 490 };
    const factorDesconchones = 0.7 + perfil() * 0.65;
    const factorAranazos = 0.6 + perfil() * 0.9;
    const factorMotas = 0.6 + perfil() * 1;

    // Desconchones del canto: pequeños polígonos blancos pegados al borde, más
    // en los cantos y esquinas que más se gastan en esta copia.
    const rndCanto = semilla('canto');
    const inicioCanto = [0, ANCHO, ANCHO + ALTO, 2 * ANCHO + ALTO];
    const largoCanto = [ANCHO, ALTO, ANCHO, ALTO];
    const sumaCantos = pesoCantos.reduce((a, b) => a + b, 0);
    const perimetro = 2 * (ANCHO + ALTO);
    // Esquinas en el orden del perímetro: arriba-izq., arriba-dcha., abajo-dcha., abajo-izq.
    const esquinasT = [0, ANCHO, ANCHO + ALTO, 2 * ANCHO + ALTO].map((v) => v / perimetro);
    const pesoEsquinaT = [pesoEsquinas[0]!, pesoEsquinas[1]!, pesoEsquinas[3]!, pesoEsquinas[2]!];
    const desconchones = Array.from({ length: Math.round((DESCONCHONES[nivel] ?? 0) * factorDesconchones) }, () => {
      let r = rndCanto() * sumaCantos;
      let canto = 0;
      while (canto < 3 && r > pesoCantos[canto]!) r -= pesoCantos[canto++]!;
      let t = (inicioCanto[canto]! + rndCanto() * largoCanto[canto]!) / perimetro;
      // Atraídos hacia las esquinas, más hacia las que más se gastan.
      const k = esquinasT.reduce((a, b, idx) => (Math.abs(b - t) < Math.abs(esquinasT[a]! - t) ? idx : a), 0);
      if (rndCanto() < 0.25 + 0.35 * pesoEsquinaT[k]!) t = esquinasT[k]! + (t - esquinasT[k]!) * 0.25;
      const { x, y, nx, ny } = puntoDelCanto(t);
      // Alguno más grande, como un mordisco del cartón.
      const grande = rndCanto() < 0.06 ? 1.8 : 1;
      const largo = (2 + rndCanto() * (2 + nivel * 2.2)) * grande;
      const hondo = (1 + rndCanto() * (1 + nivel * 1.2)) * grande;
      const tx = -ny; // Tangente al canto.
      const ty = nx;
      const a = 0.5 + rndCanto() * 0.6;
      const b = 0.4 + rndCanto() * 0.5;
      const puntos = [
        [x - tx * largo, y - ty * largo],
        [x + nx * hondo * a - tx * largo * 0.3, y + ny * hondo * a - ty * largo * 0.3],
        [x + nx * hondo, y + ny * hondo],
        [x + nx * hondo * b + tx * largo * 0.5, y + ny * hondo * b + ty * largo * 0.5],
        [x + tx * largo, y + ty * largo],
      ];
      return { d: fmt(puntos), opacidad: 0.7 + rndCanto() * 0.3 };
    });

    // Esquinas: arriba-izq., arriba-dcha., abajo-izq., abajo-dcha., según el carácter de la copia.
    const rndEsquina = semilla('esquinas');
    const base = ESQUINA[nivel] ?? 0;
    const esquinas = pesoEsquinas.map((f) => base * f * (0.8 + rndEsquina() * 0.4));

    // Arañazos: sueltos o en tandas paralelas; algunos curvos.
    const rndAranazo = semilla('aranazos');
    const aranazos = Array.from({ length: cuanto(ARANAZOS[nivel] ?? 0, factorAranazos, factorAranazos) }, () => {
      const x = 50 + rndAranazo() * 320;
      const y = 60 + rndAranazo() * 500;
      const largo = 25 + rndAranazo() * (50 + nivel * 22);
      const angulo = enTandas && rndAranazo() < 0.75 ? anguloTanda + (rndAranazo() - 0.5) * 0.15 : rndAranazo() * Math.PI;
      const curva = rndAranazo() < 0.3 ? (rndAranazo() - 0.5) * largo * 0.25 : 0;
      const mx = x + (Math.cos(angulo) * largo) / 2 - Math.sin(angulo) * curva;
      const my = y + (Math.sin(angulo) * largo) / 2 + Math.cos(angulo) * curva;
      return {
        puntos: fmt([
          [x, y],
          [mx, my],
          [x + Math.cos(angulo) * largo, y + Math.sin(angulo) * largo],
        ]),
        ancho: 0.5 + rndAranazo() * (0.4 + nivel * 0.15),
        opacidad: 0.45 + rndAranazo() * 0.55,
      };
    });

    // Pliegues: de canto a canto, o doblando una esquina en diagonal.
    const rndPliegue = semilla('pliegues');
    const pliegues = Array.from({ length: PLIEGUES[nivel] ?? 0 }, () => {
      const tipo = rndPliegue();
      const pasos = 14;
      const puntos: number[][] = [];
      if (tipo < 0.3) {
        // Esquina doblada: de un canto al de al lado, cerca de la esquina.
        const esq = Math.floor(rndPliegue() * 4);
        const ox = esq % 2 === 0 ? 0 : ANCHO;
        const oy = esq < 2 ? 0 : ALTO;
        const dx = ox === 0 ? 1 : -1;
        const dy = oy === 0 ? 1 : -1;
        const largoX = 40 + rndPliegue() * 90;
        const largoY = 40 + rndPliegue() * 90;
        for (let i2 = 0; i2 <= pasos; i2++) {
          const f = i2 / pasos;
          const sacudida = (rndPliegue() - 0.5) * 2;
          puntos.push([ox + dx * largoX * (1 - f) + sacudida, oy + dy * largoY * f + sacudida]);
        }
      } else {
        const horizontal = tipo < 0.65;
        const a = 90 + rndPliegue() * (horizontal ? 430 : 240);
        const b = 90 + rndPliegue() * (horizontal ? 430 : 240);
        for (let i2 = 0; i2 <= pasos; i2++) {
          const f = i2 / pasos;
          const sacudida = (rndPliegue() - 0.5) * 2.2;
          puntos.push(horizontal ? [f * ANCHO, a + (b - a) * f + sacudida] : [a + (b - a) * f + sacudida, f * ALTO]);
        }
      }
      return fmt(puntos);
    });

    // Suciedad: motitas oscuras, la mitad agrupadas en una zona; en Poor, una mancha.
    const rndMota = semilla('motas');
    const motas = Array.from({ length: cuanto(MOTAS[nivel] ?? 0, factorMotas, factorMotas) }, () => {
      const agrupada = rndMota() < 0.5;
      const x = agrupada ? zonaSucia.x + (rndMota() - 0.5) * 90 : 15 + rndMota() * 391;
      const y = agrupada ? zonaSucia.y + (rndMota() - 0.5) * 120 : 15 + rndMota() * 584;
      return {
        x: Math.min(406, Math.max(15, x)),
        y: Math.min(599, Math.max(15, y)),
        r: 0.5 + rndMota() * (0.6 + nivel * 0.25),
        opacidad: 0.25 + rndMota() * 0.35,
      };
    });
    const mancha =
      nivel >= 5
        ? { x: (zonaSucia.x / ANCHO) * 100, y: (zonaSucia.y / ALTO) * 100, w: 12 + rndMota() * 14, h: 8 + rndMota() * 10 }
        : null;

    // Abolladuras (desde LP): un hoyito con luz a un lado y sombra al otro.
    const rndAbolladura = semilla('abolladuras');
    const abolladuras = Array.from({ length: nivel >= 3 ? Math.floor(rndAbolladura() * (nivel - 1)) : 0 }, () => ({
      x: 40 + rndAbolladura() * 340,
      y: 60 + rndAbolladura() * 490,
      r: 3 + rndAbolladura() * 5,
    }));

    return { desconchones, esquinas, aranazos, pliegues, motas, mancha, abolladuras };
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
        {/* Abolladuras: luz arriba a la izquierda, sombra abajo a la derecha. */}
        {marcas.abolladuras.map((h, i) => (
          <g key={`h${i}`}>
            <circle cx={h.x + 0.8} cy={h.y + 0.8} r={h.r} fill="none" stroke="#000" strokeWidth={1.2} strokeOpacity={0.22} />
            <circle cx={h.x - 0.6} cy={h.y - 0.6} r={h.r} fill="none" stroke="#fff" strokeWidth={0.8} strokeOpacity={0.35} />
          </g>
        ))}
        {marcas.desconchones.map((d, i) => (
          <polygon key={`d${i}`} points={d.d} fill="#f7f3ea" fillOpacity={d.opacidad} />
        ))}
      </svg>
      {/* Arañazos aparte: brillan cuando les da la luz (ver el CSS). */}
      <svg className="desgaste__marcas desgaste__aranazos" viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none">
        {marcas.aranazos.map((r, i) => (
          <polyline
            key={i}
            points={r.puntos}
            fill="none"
            stroke="#fff"
            strokeWidth={r.ancho}
            strokeOpacity={r.opacidad}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
}
