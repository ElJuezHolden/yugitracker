import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import './CardFoilOverlay.css';

/*
 * Brillos de rareza.
 *
 * Tres ideas que vienen de mirar cómo lo resuelven las versiones digitales
 * oficiales (Master Duel, Duel Links, Pokémon TCG Pocket) y el referente web de
 * estos efectos (pokemon-cards-css):
 *
 *   1. DÓNDE brilla define la rareza: la Rare solo en el nombre, la Super Rare
 *      solo en la ilustración, la Parallel en toda la carta. (Tabla abajo.)
 *   2. El arco iris solo aparece DONDE DA LA LUZ. Fuera de esa franja la carta
 *      se ve impresa normal, como en la vida real; pintarlo en toda la zona era
 *      lo que hacía que pareciera un "ataque epiléptico".
 *   3. En reposo, calma: la luz sigue al puntero y, sin él, solo un destello
 *      suave cruza la carta de vez en cuando, escalonado entre cartas.
 *
 * El nombre es distinto: no se le pone una capa encima, sino que brillan LAS
 * LETRAS con su forma exacta, recortadas de la propia imagen con un filtro SVG
 * (ver FoilFilters.tsx).
 *
 *   RAREZA                        NOMBRE     ILUSTRACIÓN         CARTA ENTERA
 *   -------------------------------------------------------------------------------
 *   Common · Short Print · Normal Rare  —     —                   —
 *   Rare                          plata      —                   —
 *   Super Rare                    —          holo de puntos      —
 *   Ultra Rare                    oro        holo de puntos      —
 *   Secret Rare                   arcoíris   diagonales finas    —
 *   Ultra / Extra Secret Rare     oro        diagonales finas    —
 *   Prismatic Secret              moteado    trama cruzada       —
 *   Millennium Rare               —          —                   jeroglíficos y grano
 *   Platinum Secret Rare          platino    trama Secret plata  marcos de platino con trama
 *   Platinum Rare                 arcoíris   —                   platino (menos el texto)
 *   Extra Secret Rare             arcoíris   —                   arcoíris (menos el texto)
 *   Ultimate Rare                 oro        relieve             —        + marco en relieve
 *   Ghost Rare / Holographic      plata      desaturada y pálida —
 *   Ghost/Gold Rare               oro        desaturada y pálida marcos de oro
 *   Collector's Rare              arcoíris   mancha de aceite    marcos con huella  + relieve
 *   Starlight / Alternate Rare    arcoíris   —                   trama horizontal
 *   Quarter Century Secret Rare   champán    —                   purpurina multicolor (menos el texto) + sello 25
 *   10000 Secret Rare             oro        —                   paralelo
 *   Grand Master Rare             oro        —                   jeroglíficos + relieve
 *   Pharaoh's Rare                oro        jeroglíficos        paralelo
 *   Gold Rare                     oro        holo de puntos      marcos de oro (canto, ilustración, texto)
 *   Gold Secret Rare              oro        diagonales finas    marcos de oro con trama de Secret
 *   Premium Gold Rare             oro        holo de puntos      marcos de oro gruesos y en relieve
 *   Starfoil / Mosaic / Shatterfoil  —       —                   estrellas / cuadros / cristal
 *   Parallel y Duel Terminal      según su rareza base            + líneas paralelas
 */

type NameFoil = 'silver' | 'gold' | 'rainbow' | 'speckled' | 'platinum' | 'champan' | 'red' | 'blue' | 'green' | 'purple' | 'pink' | 'bronze';
type ArtFoil = 'holo' | 'diagonal' | 'grid' | 'emboss' | 'ghost' | 'oilslick' | 'hieroglyph' | 'platino';
type CardFoil =
  | 'parallel'
  | 'starlight'
  | 'platinum'
  | 'qcr'
  | 'stars'
  | 'mosaic'
  | 'shatter'
  | 'millennium'
  | 'grandmaster';

interface FoilSpec {
  /** Foil sobre las letras del nombre. */
  name?: NameFoil;
  /** Foil dentro del recuadro de la ilustración. */
  art?: ArtFoil;
  /** Foil sobre toda la superficie de la carta. */
  card?: CardFoil;
  /** Marco y bordes resaltados, como en Ultimate y Premium Gold. */
  emboss?: boolean;
  /** Marca de agua del 25.º aniversario. */
  seal25?: boolean;
  /** Oro en canto, marco de la ilustración y caja de texto (serie Gold). */
  oro?: 'gold' | 'secret' | 'premium' | 'platino' | 'collector';
  /** Foil en toda la carta MENOS la caja de texto. */
  cubierta?: 'qcsr' | 'platino' | 'extra';
}

/**
 * Traduce el texto de rareza que devuelve la API a las capas que hay que pintar.
 *
 * La lista sale de recorrer unas 13.000 cartas de YGOPRODeck y quedarse con
 * todas las cadenas distintas de `set_rarity`, así que cubre lo que el catálogo
 * usa de verdad, no lo que debería usar. Algunas entradas del campo no son
 * rarezas sino notas de edición ("New", "Reprint", "2", "European debut"): esas
 * caen al final sin foil, que es lo correcto.
 *
 * **EL ORDEN ES LO QUE HACE QUE FUNCIONE.** Casi todas las rarezas contienen el
 * nombre de otra más genérica, así que se comprueba de lo más específico a lo
 * más general. Tres ejemplos de por qué:
 *
 *   "Super Short Print"   contiene "super" pero NO lleva foil
 *   "Gold Secret Rare"    contiene "gold" y "secret"
 *   "Ultra Rare (Pharaoh's Rare)" contiene "ultra"
 *
 * Mover una línea hacia abajo puede dejar una rareza sin su brillo, o darle el
 * de otra. Si se añade una nueva, colocarla por especificidad y comprobarla en
 * /foil-demo.html.
 */
function resolveFoil(rarity: string): FoilSpec | null {
  const r = (rarity || '').toLowerCase().trim();
  if (!r) return null;

  // --- Sin foil. Van las primeras porque "Super Short Print" lleva "super". ---
  if (r.includes('short print')) return null;

  // --- Cimas de la escala ---

  // 10000 Secret Rare: la más extrema del OCG, foil sobre toda la carta.
  if (r.includes('10000')) return { name: 'gold', card: 'qcr' };

  /*
   * Quarter Century: nombre en champán moteado, foil de Secret en toda la carta
   * menos la caja de texto, y el sello del 25 en relieve dentro de ella.
   */
  if (r.includes('quarter century') || r.includes('25th')) {
    return { name: 'champan', cubierta: 'qcsr', seal25: true };
  }

  /*
   * Grand Master Rare: arco iris sobre atributo, nivel y borde del cuadro de
   * texto, con una cenefa de jeroglíficos en el canto de la carta.
   */
  if (r.includes('grand master')) {
    return { name: 'gold', card: 'grandmaster', emboss: true };
  }

  // Starlight (también llamada Alternate Rare): trama horizontal en toda la carta.
  if (r.includes('starlight') || r.includes('alternate rare')) {
    return { name: 'rainbow', card: 'starlight' };
  }

  // Pharaoh's Rare: una Ultra con jeroglíficos diminutos dentro del foil.
  if (r.includes('pharaoh')) return { name: 'gold', art: 'hieroglyph', card: 'parallel' };

  // Ghost/Gold Rare: ilustración vaciada de Ghost con el nombre perfilado en oro.
  if (r.includes('ghost') && r.includes('gold')) return { name: 'gold', art: 'ghost', oro: 'gold' };

  // Ghost Rare (Holographic Rare en el OCG): la ilustración sale casi blanca.
  if (r.includes('ghost') || r.includes('holographic')) return { name: 'silver', art: 'ghost' };

  // Collector's: arco iris de "huella dactilar" en ilustración y marcos, con relieve.
  if (r.includes('collector')) return { name: 'rainbow', art: 'oilslick', emboss: true, oro: 'collector' };

  // Ultra Rare "Special" (Battles of Legend: Chapter 1): una Ultra con el nombre en plata.
  if (r.includes('ultra') && r.includes('special')) return { name: 'silver', art: 'holo' };

  // Ultimate: la única que se nota con el dedo. Relieve, sin diagonales.
  if (r.includes('ultimate')) return { name: 'gold', art: 'emboss', emboss: true };

  // --- Familia Secret (antes que "secret" a secas y que "ultra") ---

  // Platinum Secret: platino con trama de Secret en ilustración y marcos; nombre en platino.
  if (r.includes('platinum') && r.includes('secret')) return { name: 'platinum', art: 'platino', oro: 'platino' };
  // Platinum Rare: platino en toda la carta menos el texto, nombre de Secret.
  if (r.includes('platinum')) return { name: 'rainbow', cubierta: 'platino' };

  // Millennium: un Parallel con jeroglíficos en vertical y grano.
  if (r.includes('millennium')) return { card: 'millennium' };

  // Prismatic: trama horizontal+vertical y nombre moteado.
  if (r.includes('prismatic')) return { name: 'speckled', art: 'grid' };

  // Extra Secret: arco iris en todo menos la caja de texto.
  if (r.includes('secret') && r.includes('extra')) return { name: 'rainbow', cubierta: 'extra' };

  // Ultra Secret: foil de Secret con el nombre en oro.
  if (r.includes('secret') && r.includes('ultra')) return { name: 'gold', art: 'diagonal' };

  // --- Serie dorada (antes que los genéricos "gold" y "secret") ---

  // Oro solo en canto, marco de la ilustración y caja de texto; la ilustración, holo.
  if (r.includes('premium gold')) return { name: 'gold', art: 'holo', oro: 'premium' };
  if (r.includes('gold') && r.includes('secret')) return { name: 'gold', art: 'diagonal', oro: 'secret' };
  if (r.includes('gold')) return { name: 'gold', art: 'holo', oro: 'gold' };

  // --- Tramas que cubren la carta entera ---

  if (r.includes('starfoil')) return { card: 'stars' };
  if (r.includes('mosaic')) return { card: 'mosaic' };
  if (r.includes('shatterfoil')) return { card: 'shatter' };

  /*
   * Parallel y Duel Terminal. Son un acabado que se SUMA a una rareza base
   * ("Duel Terminal Super Parallel Rare" = una Super con foil paralelo), así
   * que se mira qué rareza lleva dentro. Ojo: "Duel Terminal Normal Rare
   * Parallel Rare" lleva "normal" y "rare", y manda "normal".
   */
  if (r.includes('parallel') || r.includes('duel terminal')) {
    const base: FoilSpec = { card: 'parallel' };
    if (r.includes('secret')) return { ...base, name: 'rainbow', art: 'diagonal' };
    if (r.includes('ultra')) return { ...base, name: 'gold', art: 'holo' };
    if (r.includes('super')) return { ...base, art: 'holo' };
    if (r.includes('normal')) return base;
    if (r.includes('rare')) return { ...base, name: 'silver' };
    return base;
  }

  // --- Escalera clásica ---

  if (r.includes('secret')) return { name: 'rainbow', art: 'diagonal' };
  if (r.includes('ultra')) return { name: 'gold', art: 'holo' };
  if (r.includes('super')) return { art: 'holo' };

  /*
   * "Rare" a secas va la última porque aparece dentro de casi todas las
   * demás. Normal Rare es una Common en hueco de Rare: sin foil.
   */
  if (r.includes('normal rare')) return null;
  if (r.includes('rare')) return { name: 'silver' };

  // Common y las notas de edición que ensucian el campo ("New", "Reprint"...).
  return null;
}

/**
 * Color de la tinta del nombre según el tipo de carta. Medido sobre una carta
 * de cada tipo: blanca en Xyz, Link, Mágica y Trampa; negra en el resto.
 */
function tintaDelNombre(cardType: string | undefined): 'oscura' | 'clara' {
  return /spell|trap|xyz|link|skill/i.test(cardType ?? '') ? 'clara' : 'oscura';
}

/**
 * Retraso del destello en reposo, entre 0 y 9 s, sacado de la imagen para que
 * sea siempre el mismo en cada carta. Si todas destellaran a la vez la rejilla
 * entera parpadearía.
 */
function retrasoDestello(semilla: string): number {
  let h = 0;
  for (let i = 0; i < semilla.length; i++) h = (h * 31 + semilla.charCodeAt(i)) | 0;
  return (Math.abs(h) % 900) / 100;
}

/*
 * El destello en reposo solo corre en las cartas que están en pantalla. Con
 * cientos de cartas, animarlas todas fuera de la vista sería gastar por nada.
 * Un único observador para todas, en vez de uno por carta.
 */
let observador: IntersectionObserver | null = null;
function observarVisibilidad(el: HTMLElement) {
  if (typeof IntersectionObserver === 'undefined') {
    el.dataset.visible = 'true';
    return () => {};
  }
  observador ??= new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) (e.target as HTMLElement).dataset.visible = String(e.isIntersecting);
    },
    { rootMargin: '100px' },
  );
  observador.observe(el);
  return () => observador?.unobserve(el);
}

interface Props {
  rarity: string;
  /** Imagen de la carta: de ella se recortan las letras del nombre. */
  img?: string;
  /** Tipo de carta de la API ("Spell Card", "XYZ Monster"...): decide el color de la tinta. */
  cardType?: string;
  /** Color del nombre elegido a mano para esta copia: cambia solo el metal de las letras. */
  nameColor?: string;
}

/**
 * Capas de foil de una carta. Solo pinta: el seguimiento del puntero y la
 * inclinación viven en `useCardPointer`, sobre el contenedor de la carta.
 */
/*
 * Textura de purpurina de la Quarter Century: puntitos de brillo variable sobre
 * negro, alineados en columnas (las estrías verticales de la carta real). Se
 * genera una sola vez con canvas y se deja en una variable CSS de la raíz, así
 * la comparten todas las cartas.
 */
let purpurinaLista = false;
function asegurarPurpurina() {
  if (purpurinaLista || typeof document === 'undefined') return;
  purpurinaLista = true;
  try {
    const lado = 108;
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, lado, lado);
    let semilla = 25;
    const rnd = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    for (let x = 1; x < lado; x += 3) {
      for (let y = 0; y < lado; y++) {
        if (rnd() > 0.22) continue;
        const brillo = 0.5 + rnd() * 0.5;
        const v = Math.round(brillo * 255);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 1, rnd() > 0.75 ? 2 : 1);
      }
    }
    document.documentElement.style.setProperty('--tex-purpurina', `url("${canvas.toDataURL('image/png')}")`);
  } catch {
    // Sin canvas: queda el velo de base, sin purpurina.
  }
}

export default function CardFoilOverlay({ rarity, img, cardType, nameColor }: Props) {
  const spec = useMemo(() => {
    const base = resolveFoil(rarity);
    // El color elegido manda sobre el de la rareza (y lo pone aunque la rareza no lleve nombre metálico).
    return nameColor ? { ...(base ?? {}), name: nameColor as NameFoil } : base;
  }, [rarity, nameColor]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (spec?.cubierta === 'qcsr') asegurarPurpurina();
  }, [spec]);

  useEffect(() => {
    const el = ref.current;
    return el ? observarVisibilidad(el) : undefined;
  }, [spec]);

  if (!spec) return null; // Common: nada que pintar, y una capa menos por carta.

  const tinta = tintaDelNombre(cardType);
  const estilo = {
    '--carta-img': img ? `url("${img}")` : 'none',
    '--retraso-destello': `${retrasoDestello(img || rarity)}s`,
  } as CSSProperties;

  return (
    <div ref={ref} className={`foil${/pendulum/i.test(cardType ?? '') ? ' foil--pendulo' : ''}`} aria-hidden="true" style={estilo}>
      {spec.card && <div className={`foil-zona foil-zona--carta foil-carta--${spec.card}`} />}
      {spec.cubierta && <div className={`foil-cubierta foil-cubierta--${spec.cubierta}`} />}
      {spec.cubierta === 'qcsr' && <div className="foil-purpurina" />}
      {spec.art && <div className={`foil-zona foil-zona--arte foil-arte--${spec.art}`} />}
      {spec.oro && (
        <div className={`foil-oro foil-oro--${spec.oro}`}>
          <div className="foil-oro__metal" />
          {spec.oro === 'premium' && <div className="foil-oro__sombra" />}
          {spec.oro === 'premium' && <div className="foil-oro__luz" />}
          {(spec.oro === 'secret' || spec.oro === 'platino') && <div className="foil-oro__trama" />}
          <div className="foil-oro__brillo" />
        </div>
      )}
      {spec.name && img && (
        <div className={`foil-letras foil-letras--tinta-${tinta}`}>
          <div className="foil-letras__mascara" />
          <div className={`foil-letras__metal foil-metal--${spec.name}`} />
        </div>
      )}
      {spec.emboss && <div className="foil-relieve" />}
      {spec.seal25 && (
        <div className="foil-sello">
          <div className="foil-sello__tinta" />
          <div className="foil-sello__sombra" />
          <div className="foil-sello__luz" />
          <div className="foil-sello__brillo" />
        </div>
      )}
      <div className="foil-destello" />
      <div className="foil-reflejo" />
    </div>
  );
}
