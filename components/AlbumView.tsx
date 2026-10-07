import { useEffect, useState, useRef, type ReactNode, type PointerEvent as EventoPuntero } from 'react';
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { BookOpen, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RectangleVertical } from 'lucide-react';
import type { Card, AlbumColumns } from '../types';
import { CardItem } from './CardItem';
import { useStore } from '../context/StoreContext';
import './AlbumView.css';

interface Props {
  cards: Card[];
  onCardPress: (card: Card) => void;
  isSelectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  /** Nombre de la carpeta, grabado en la tapa. */
  titulo?: string;
  /** Imagen de la carpeta, en la ventanita de la tapa. */
  portada?: string;
  /** Si las flechas del teclado pasan página (no con una ventana abierta encima). */
  teclado?: boolean;
}

/*
 * Álbum de fundas, como una carpeta de anillas de verdad:
 *
 *   - Una hoja o abierto (dos hojas enfrentadas, con las anillas en medio).
 *   - Las hojas se pasan girando en 3D alrededor de las anillas, con su cara y su
 *     reverso, la sombra que proyectan sobre la de debajo y el brillo del
 *     plástico al levantarse. Con los botones, el teclado, o arrastrando la hoja
 *     con el ratón o el dedo (se suelta a medias y vuelve o termina de pasar).
 *   - Al entrar, la tapa se abre.
 *
 * Todas las medidas salen del ancho de un bolsillo (u), calculado para que el
 * álbum entero quepa en el hueco: así nada se recorta ni hace falta scroll.
 *
 * Las hojas se numeran como las de un álbum: la hoja que se pasa lleva en la
 * cara la página de la derecha y en el reverso la siguiente de la izquierda.
 * Abierto por la vista k se ven las páginas 2k y 2k+1.
 */

type Modo = 'una' | 'doble';
const CLAVE_MODO = 'yugi-tracker-album-modo';
const leerModo = (): Modo => {
  try {
    return localStorage.getItem(CLAVE_MODO) === 'una' ? 'una' : 'doble';
  } catch {
    return 'doble';
  }
};

const CARTA = 614 / 421;
/** La carta respecto al bolsillo, que es algo más ancho. */
const ANCHO_CARTA = 0.93;
const ALTO_BOLSILLO = ANCHO_CARTA * CARTA + 0.1;
/** La soldadura entre bolsillos. */
const JUNTA = 0.05;
/** Altura de las anillas (y de los agujeros de las hojas), en fracción de la hoja. */
const ANILLAS = [0.17, 0.5, 0.83];
/**
 * Abierto solo si las cartas no se quedan demasiado pequeñas: al menos este
 * tanto del tamaño que tendrían con una hoja (y nunca bolsillos de menos de
 * 30 px). En una pantalla apaisada suele costar poco o nada, porque manda el alto.
 */
const DOBLE_MIN = 0.6;

interface Medidas {
  u: number;
  /** Hoja. */
  pw: number;
  ph: number;
  /** Márgenes de la hoja: del lado de las anillas, del otro, arriba y abajo. */
  lomo: number;
  ext: number;
  arriba: number;
  abajo: number;
  /** Lo que asoma la tapa alrededor de las hojas, y el lomo. */
  m: number;
  s: number;
  ancho: number;
  alto: number;
}

function medir(cols: number, doble: boolean, aw: number, ah: number): Medidas {
  const gw = cols + (cols - 1) * JUNTA;
  const gh = cols * ALTO_BOLSILLO + (cols - 1) * JUNTA;
  const lomo = 0.085 * gh;
  const ext = 0.03 * gh;
  const arriba = 0.035 * gh;
  const abajo = 0.06 * gh;
  const pw = gw + lomo + ext;
  const ph = gh + arriba + abajo;
  const m = 0.035 * ph;
  const s = 0.08 * ph;
  const ancho = doble ? 2 * pw + s + 2 * m : s + pw + m;
  const alto = ph + 2 * m;
  const u = Math.max(8, Math.min(aw / ancho, ah / alto));
  return { u, pw: pw * u, ph: ph * u, lomo: lomo * u, ext: ext * u, arriba: arriba * u, abajo: abajo * u, m: m * u, s: s * u, ancho: ancho * u, alto: alto * u };
}

/** Respeta "reducir movimiento" del sistema: las hojas cambian sin girar. */
const sinMovimiento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Curva de una hoja que se pasa a mano: arranca y se posa suave. */
const CURVA_HOJA = [0.6, 0.02, 0.28, 1] as const;

interface Acciones {
  onCardPress: (card: Card) => void;
  isSelectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

// --- Una hoja de fundas ------------------------------------------------------

interface HojaProps {
  cartas: Card[];
  cols: number;
  md: Medidas;
  /** 'dcha': las anillas a su izquierda; 'izq': a su derecha. */
  lado: 'izq' | 'dcha';
  numero?: number;
  acciones: Acciones;
}

function Hoja({ cartas, cols, md, lado, numero, acciones }: HojaProps) {
  const { u } = md;
  const radio = md.ph * 0.012;
  const xAgujero = md.lomo * 0.45;
  return (
    <div className={`album-hoja album-hoja--${lado}`} style={{ width: md.pw, height: md.ph }}>
      {ANILLAS.map((y) => (
        <span
          key={y}
          className="album-agujero"
          style={{ top: y * md.ph - radio, [lado === 'dcha' ? 'left' : 'right']: xAgujero - radio, width: radio * 2, height: radio * 2 }}
        />
      ))}
      <div
        className="absolute grid"
        style={{
          left: lado === 'dcha' ? md.lomo : md.ext,
          top: md.arriba,
          gridTemplateColumns: `repeat(${cols}, ${u}px)`,
          gridAutoRows: `${u * ALTO_BOLSILLO}px`,
          gap: u * JUNTA,
        }}
      >
        {Array.from({ length: cols * cols }, (_, i) => {
          const card = cartas[i];
          // La carta se apoya en el fondo del bolsillo; la boca queda arriba.
          const hueco = { left: '3.5%', width: `${ANCHO_CARTA * 100}%`, bottom: u * 0.035, aspectRatio: '421 / 614' };
          return (
            <div key={card?.uid ?? `vacio-${i}`} className="album-bolsillo">
              {card ? (
                <div className="absolute" style={hueco}>
                  <CardItem
                    card={card}
                    onPress={acciones.onCardPress}
                    viewMode="album"
                    isSelectionMode={acciones.isSelectionMode}
                    isSelected={acciones.selectedIds.has(card.uid)}
                    onToggleSelect={() => acciones.onToggleSelect(card.uid)}
                  />
                </div>
              ) : (
                <div className="album-bolsillo__vacio" style={hueco} />
              )}
              <div className="album-bolsillo__funda" />
              <div className="album-bolsillo__boca" />
            </div>
          );
        })}
      </div>
      <div className={`album-hoja__curva album-hoja__curva--${lado}`} />
      {numero != null && (
        <span
          className="album-hoja__numero"
          style={{ bottom: md.abajo * 0.22, fontSize: Math.max(9, md.abajo * 0.42), [lado === 'dcha' ? 'right' : 'left']: md.ext + u * 0.04 }}
        >
          {numero}
        </span>
      )}
    </div>
  );
}

// --- La hoja que se está pasando ----------------------------------------------

interface GiroProps {
  /** 0: apoyada a la derecha; 1: pasada, a la izquierda. */
  avance: MotionValue<number>;
  md: Medidas;
  doble: boolean;
  /** Dónde está la hoja de la derecha dentro de la zona de hojas. */
  xDcha: number;
  frente: ReactNode;
  dorso: ReactNode;
}

function Giro({ avance, md, doble, xDcha, frente, dorso }: GiroProps) {
  const giro = useTransform(avance, (a) => -180 * a);
  // Al levantarse deja de darle la luz de frente: se oscurece hacia el canto.
  const sombraFrente = useTransform(avance, [0, 0.5], [0, 0.8]);
  const sombraDorso = useTransform(avance, [0.5, 1], [0.8, 0]);
  // El reflejo del plástico al empezar a levantarse.
  const brillo = useTransform(avance, [0, 0.2, 0.45], [0, 0.55, 0]);
  // Con una sola hoja no hay dónde posarla: se desvanece al pasar de canto.
  const opacidad = useTransform(avance, [0, 0.4, 0.5], doble ? [1, 1, 1] : [1, 1, 0]);
  // Sombra que proyecta sobre la hoja de debajo, más larga cuanto más tumbada.
  const sombraDcha = useTransform(avance, (a) => {
    if (a >= 0.5) return 'none';
    const fin = Math.cos(Math.PI * a) * 100 + 14;
    const o = Math.sin(Math.PI * a) * 0.7;
    return `linear-gradient(to right, rgba(0,0,0,${o.toFixed(3)}) 0%, rgba(0,0,0,${(o * 0.55).toFixed(3)}) ${(fin * 0.75).toFixed(1)}%, rgba(0,0,0,0) ${fin.toFixed(1)}%)`;
  });
  const sombraIzq = useTransform(avance, (a) => {
    if (a <= 0.5) return 'none';
    const fin = Math.cos(Math.PI * (1 - a)) * 100 + 14;
    const o = Math.sin(Math.PI * a) * 0.7;
    return `linear-gradient(to left, rgba(0,0,0,${o.toFixed(3)}) 0%, rgba(0,0,0,${(o * 0.55).toFixed(3)}) ${(fin * 0.75).toFixed(1)}%, rgba(0,0,0,0) ${fin.toFixed(1)}%)`;
  });

  return (
    <>
      <motion.div className="album-sombra-proyectada" style={{ left: xDcha, width: md.pw, height: md.ph, background: sombraDcha }} />
      {doble && <motion.div className="album-sombra-proyectada" style={{ left: 0, width: md.pw, height: md.ph, background: sombraIzq }} />}
      <motion.div
        className="album-lamina"
        style={{
          left: xDcha,
          width: md.pw,
          height: md.ph,
          // Gira alrededor de las anillas: en medio del lomo, o en el canto con una hoja.
          transformOrigin: `${doble ? -md.s / 2 : 0}px 50%`,
          rotateY: giro,
        }}
      >
        <motion.div className="album-lamina__cara" style={{ opacity: opacidad }}>
          {frente}
          <motion.div className="album-lamina__sombra album-lamina__sombra--frente" style={{ opacity: sombraFrente }} />
          <motion.div className="album-lamina__brillo" style={{ opacity: brillo }} />
        </motion.div>
        {doble && (
          <div className="album-lamina__cara album-lamina__cara--dorso">
            {dorso}
            <motion.div className="album-lamina__sombra album-lamina__sombra--dorso" style={{ opacity: sombraDorso }} />
          </div>
        )}
      </motion.div>
    </>
  );
}

// --- La tapa, que se abre al entrar ------------------------------------------

interface TapaProps {
  avance: MotionValue<number>;
  md: Medidas;
  xDcha: number;
  titulo?: string;
  portada?: string;
  cantidad: number;
  onAbierta: (abierta: boolean) => void;
}

function Tapa({ avance, md, xDcha, titulo, portada, cantidad, onAbierta }: TapaProps) {
  const giro = useTransform(avance, (a) => -180 * a);
  const opacidad = useTransform(avance, [0, 0.38, 0.5], [1, 1, 0]);
  const sombra = useTransform(avance, [0, 0.5], [0, 0.75]);

  useEffect(() => {
    const animacion = animate(avance, 1, { duration: 1.05, delay: 0.25, ease: CURVA_HOJA });
    animacion.then(() => onAbierta(true));
    return () => animacion.stop();
  }, [avance, onAbierta]);

  const letra = md.pw * 0.055;
  return (
    <motion.div
      className="album-lamina album-tapa"
      style={{ left: xDcha, top: -md.m, width: md.pw + md.m, height: md.ph + 2 * md.m, transformOrigin: `${-md.s / 2}px 50%`, rotateY: giro, opacity: opacidad }}
    >
      <div className="album-lamina__cara album-cuero album-tapa__frente">
        <div className="album-costura" style={{ inset: md.m * 0.45 }} />
        <div className="flex flex-col items-center justify-center h-full gap-[4%] px-[12%] text-center">
          {portada && (
            <div className="album-tapa__ventana" style={{ width: '34%' }}>
              <img src={portada} alt="" className="w-full h-full object-cover" draggable={false} />
            </div>
          )}
          <div className="album-tapa__titulo" style={{ fontSize: letra }}>
            {titulo || 'Colección'}
          </div>
          <div className="album-tapa__subtitulo" style={{ fontSize: letra * 0.42 }}>
            {cantidad} {cantidad === 1 ? 'carta' : 'cartas'}
          </div>
        </div>
        <motion.div className="album-lamina__sombra album-lamina__sombra--frente" style={{ opacity: sombra }} />
      </div>
    </motion.div>
  );
}

// --- El álbum ----------------------------------------------------------------

export const AlbumView = ({ cards, onCardPress, isSelectionMode, selectedIds, onToggleSelect, titulo, portada, teclado = true }: Props) => {
  const { state, dispatch } = useStore();
  const cols = state.ui.albumColumns;
  const porPagina = cols * cols;
  const totalPaginas = Math.max(1, Math.ceil(cards.length / porPagina));

  const [modo, setModo] = useState<Modo>(leerModo);
  const [escenario, setEscenario] = useState<HTMLDivElement | null>(null);
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  /** Alto de la vista: lo que queda de ventana por debajo de donde empieza el álbum. */
  const [altoVista, setAltoVista] = useState<number | null>(null);
  const [hueco, setHueco] = useState<{ w: number; h: number } | null>(null);
  /** Primera página a la vista: sobrevive al cambio entre una y dos hojas. */
  const [pagina, setPagina] = useState(0);
  /** La hoja que se está pasando, entre la vista `a` y la `a + 1`. */
  const [giro, setGiro] = useState<{ a: number } | null>(null);
  const [salto, setSalto] = useState(0);
  const [abierta, setAbierta] = useState(sinMovimiento);

  const avance = useMotionValue(0);
  const tapa = useMotionValue(abierta ? 1 : 0);
  // La hoja de la izquierda aparece según se levanta la tapa.
  const aparicionIzq = useTransform(tapa, [0.2, 0.6], [0, 1]);

  const girando = useRef(false);
  const cola = useRef(0);
  const arrastre = useRef<{ x0: number; y0: number; id: number; activo: boolean; adelante: boolean; ultX: number; ultT: number; vel: number } | null>(null);
  const huboArrastre = useRef(false);

  useEffect(() => {
    if (!raiz) return;
    // Empieza debajo de la cabecera y del resumen de la carpeta: con todo el alto
    // de la ventana se salía por abajo y los controles quedaban fuera.
    const medirAlto = () => setAltoVista(Math.max(420, window.innerHeight - (raiz.getBoundingClientRect().top + window.scrollY) - 8));
    medirAlto();
    window.addEventListener('resize', medirAlto);
    return () => window.removeEventListener('resize', medirAlto);
  }, [raiz]);

  useEffect(() => {
    if (!escenario) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setHueco({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(escenario);
    return () => ro.disconnect();
  }, [escenario]);

  const cabeDoble = !!hueco && medir(cols, true, hueco.w, hueco.h).u >= Math.max(30, DOBLE_MIN * medir(cols, false, hueco.w, hueco.h).u);
  const doble = modo === 'doble' && cabeDoble;
  const paginasPorVista = doble ? 2 : 1;
  const vistas = Math.max(1, Math.ceil(totalPaginas / paginasPorVista));
  const vista = Math.min(Math.floor(pagina / paginasPorVista), vistas - 1);
  const md = hueco ? medir(cols, doble, hueco.w, hueco.h) : null;
  const xDcha = md ? (doble ? md.pw + md.s : 0) : 0;

  const acciones: Acciones = { onCardPress, isSelectionMode, selectedIds, onToggleSelect };
  const hoja = (indice: number, lado: 'izq' | 'dcha') =>
    md && (
      <Hoja
        key={`p${indice}`}
        cartas={cards.slice(indice * porPagina, (indice + 1) * porPagina)}
        cols={cols}
        md={md}
        lado={lado}
        numero={indice < totalPaginas ? indice + 1 : undefined}
        acciones={acciones}
      />
    );

  /** Pasa una hoja hacia delante (1) o hacia atrás (-1), con su giro. */
  const pasar = (dir: 1 | -1) => {
    if (girando.current) {
      cola.current = dir; // Se pasa en cuanto termine la que va girando.
      return;
    }
    const destino = vista + dir;
    if (destino < 0 || destino >= vistas) return;
    if (sinMovimiento()) {
      setPagina(destino * paginasPorVista);
      return;
    }
    const a = dir > 0 ? vista : destino;
    girando.current = true;
    avance.set(dir > 0 ? 0 : 1);
    setGiro({ a });
    animate(avance, dir > 0 ? 1 : 0, { duration: 0.75, ease: CURVA_HOJA }).then(() => {
      setPagina(destino * paginasPorVista);
      setGiro(null);
      girando.current = false;
    });
  };

  // Lo que se pidió mientras giraba otra hoja (dejar pulsada la flecha pasa varias).
  useEffect(() => {
    if (giro || !cola.current) return;
    const dir = cola.current as 1 | -1;
    cola.current = 0;
    pasar(dir);
  });

  const irA = (destino: number) => {
    if (girando.current || destino === vista || destino < 0 || destino >= vistas) return;
    if (Math.abs(destino - vista) === 1) return pasar(destino > vista ? 1 : -1);
    setPagina(destino * paginasPorVista);
    setSalto((s) => s + 1);
  };

  const cambiarModo = (nuevo: Modo) => {
    if (girando.current) return;
    setModo(nuevo);
    try {
      localStorage.setItem(CLAVE_MODO, nuevo);
    } catch {
      // Sin almacenamiento: se queda solo para esta visita.
    }
  };

  const cambiarColumnas = (nuevas: AlbumColumns) => {
    if (girando.current || nuevas === cols) return;
    // Se sigue viendo la misma carta de antes.
    const primera = vista * paginasPorVista * porPagina;
    setPagina(Math.floor(primera / (nuevas * nuevas)));
    setSalto((s) => s + 1);
    dispatch({ type: 'SET_ALBUM_COLUMNS', payload: nuevas });
  };

  useEffect(() => {
    if (!teclado) return;
    const alPulsar = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') pasar(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') pasar(-1);
      else if (e.key === 'Home') irA(0);
      else if (e.key === 'End') irA(vistas - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  });

  // --- Arrastrar la hoja ---
  const recorrido = () => (md ? md.pw * (doble ? 1.6 : 1) : 1);

  const alBajar = (e: EventoPuntero<HTMLDivElement>) => {
    huboArrastre.current = false;
    if (e.button !== 0 || girando.current || !md) return;
    arrastre.current = { x0: e.clientX, y0: e.clientY, id: e.pointerId, activo: false, adelante: true, ultX: e.clientX, ultT: e.timeStamp, vel: 0 };
  };

  const alMover = (e: EventoPuntero<HTMLDivElement>) => {
    const d = arrastre.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.activo) {
      // Solo cuenta como arrastre un gesto claramente horizontal: los clics siguen abriendo la carta.
      if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) arrastre.current = null;
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      const adelante = dx < 0;
      if (adelante ? vista >= vistas - 1 : vista <= 0) {
        arrastre.current = null;
        return;
      }
      d.activo = true;
      d.adelante = adelante;
      huboArrastre.current = true;
      girando.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      avance.set(adelante ? 0 : 1);
      setGiro({ a: adelante ? vista : vista - 1 });
    }
    const f = d.adelante ? -dx / recorrido() : 1 - dx / recorrido();
    avance.set(Math.min(1, Math.max(0, f)));
    const dt = e.timeStamp - d.ultT;
    if (dt > 0) d.vel = 0.7 * ((e.clientX - d.ultX) / dt) + 0.3 * d.vel;
    d.ultX = e.clientX;
    d.ultT = e.timeStamp;
  };

  const alSoltar = (e: EventoPuntero<HTMLDivElement>) => {
    const d = arrastre.current;
    arrastre.current = null;
    if (!d?.activo || d.id !== e.pointerId) return;
    const a = avance.get();
    // Se completa si se soltó pasada la tercera parte, o con un golpe de muñeca.
    const completar = d.adelante ? d.vel < -0.4 || (a > 0.35 && d.vel < 0.3) : d.vel > 0.4 || (a < 0.65 && d.vel > -0.3);
    const destino = completar === d.adelante ? 1 : 0;
    const vistaFinal = completar ? (d.adelante ? vista + 1 : vista - 1) : vista;
    animate(avance, destino, { duration: 0.2 + 0.5 * Math.abs(destino - a), ease: [0.22, 1, 0.36, 1] }).then(() => {
      setPagina(vistaFinal * paginasPorVista);
      setGiro(null);
      girando.current = false;
    });
  };

  // --- Qué se ve ---
  // Sin girar: la vista actual. Girando entre a y a+1: debajo, la izquierda de a
  // y la derecha de a+1; la hoja lleva la derecha de a y, detrás, la izquierda de a+1.
  const a = giro?.a ?? vista;
  const izqDebajo = doble ? 2 * a : null;
  const dchaDebajo = giro ? (doble ? 2 * a + 3 : a + 1) : doble ? 2 * vista + 1 : vista;

  // Cantos de las hojas que quedan por pasar (derecha) y de las pasadas (izquierda).
  const cantos = (n: number, signo: 1 | -1) =>
    Array.from({ length: Math.min(n, 4) }, (_, i) => `${signo * (i + 1) * 1.4}px ${(i + 1) * 0.6}px 0 -0.5px ${i % 2 ? '#0c0c0f' : '#2a2a31'}`).join(', ') || 'none';

  const etiqueta = (() => {
    if (!doble) return `Pág. ${vista + 1} de ${totalPaginas}`;
    const desde = 2 * vista + 1;
    const hasta = Math.min(desde + 1, totalPaginas);
    return desde === hasta ? `Pág. ${desde} de ${totalPaginas}` : `Págs. ${desde}–${hasta} de ${totalPaginas}`;
  })();

  return (
    <div
      ref={setRaiz}
      className="flex flex-col items-center w-full overflow-hidden select-none relative z-0"
      style={{ height: altoVista ?? 'calc(100vh - 90px)' }}
    >
      <div ref={setEscenario} className="album-escenario w-full flex-1 min-h-0">
        {md && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="album-cuero album-carpeta"
            style={{ width: md.ancho, height: md.alto, borderRadius: md.m * 0.7 }}
          >
            <div className="album-costura" style={{ inset: md.m * 0.38, borderRadius: md.m * 0.45 }} />
            <div className="album-lomo" style={doble ? { left: md.m + md.pw, width: md.s } : { left: 0, width: md.s }} />

            {/* Zona de hojas: todo lo de dentro se coloca respecto a ella. */}
            <div
              className="album-hojas"
              style={{ left: doble ? md.m : md.s, top: md.m, width: doble ? 2 * md.pw + md.s : md.pw, height: md.ph, touchAction: 'pan-y' }}
              onPointerDown={alBajar}
              onPointerMove={alMover}
              onPointerUp={alSoltar}
              onPointerCancel={alSoltar}
              onDragStart={(e) => e.preventDefault()}
              onClickCapture={(e) => {
                // El clic que cierra un arrastre no abre la carta.
                if (huboArrastre.current) {
                  e.stopPropagation();
                  e.preventDefault();
                  huboArrastre.current = false;
                }
              }}
            >
              {/* Mecanismo de las anillas, en el lomo */}
              <div className="album-mecanismo" style={{ left: (doble ? md.pw + md.s / 2 : -md.s / 2) - md.s * 0.21, width: md.s * 0.42, top: md.ph * 0.06, height: md.ph * 0.88 }} />

              <motion.div
                key={salto}
                initial={salto ? { opacity: 0.2 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0"
              >
                {izqDebajo != null && (
                  <motion.div className="album-ranura" style={{ left: 0, boxShadow: cantos(vista, -1), opacity: aparicionIzq }}>
                    {hoja(izqDebajo, 'izq')}
                  </motion.div>
                )}
                <div className="album-ranura" style={{ left: xDcha, boxShadow: cantos(vistas - 1 - vista, 1) }}>
                  {hoja(dchaDebajo, 'dcha')}
                </div>
              </motion.div>

              {giro && (
                <Giro avance={avance} md={md} doble={doble} xDcha={xDcha} frente={hoja(doble ? 2 * giro.a + 1 : giro.a, 'dcha')} dorso={doble ? hoja(2 * giro.a + 2, 'izq') : null} />
              )}

              {/* Anillas, por encima de las hojas */}
              {ANILLAS.map((y) => {
                const alto = md.ph * 0.017;
                const desde = doble ? md.pw - md.lomo * 0.45 : -md.s / 2;
                const hasta = doble ? md.pw + md.s + md.lomo * 0.45 : md.lomo * 0.45;
                return <span key={y} className="album-aro" style={{ left: desde, width: hasta - desde, top: y * md.ph - alto / 2, height: alto }} />;
              })}

              {!abierta && <Tapa avance={tapa} md={md} xDcha={xDcha} titulo={titulo} portada={portada} cantidad={cards.length} onAbierta={setAbierta} />}
            </div>
          </motion.div>
        )}
      </div>

      {/* Controles */}
      <div className="album-controles">
        <div className="album-segmento" role="group" aria-label="Hojas a la vista">
          <button type="button" onClick={() => cambiarModo('una')} className={!doble ? 'activo' : ''} title="Una hoja" aria-pressed={!doble}>
            <RectangleVertical size={15} />
          </button>
          <button
            type="button"
            onClick={() => cambiarModo('doble')}
            className={doble ? 'activo' : ''}
            disabled={!cabeDoble}
            title={cabeDoble ? 'Álbum abierto (dos hojas)' : 'No caben dos hojas: amplía la ventana'}
            aria-pressed={doble}
          >
            <BookOpen size={15} />
          </button>
        </div>

        <span className="album-separador" />

        <div className="album-segmento" role="group" aria-label="Bolsillos por hoja">
          {([2, 3, 4] as AlbumColumns[]).map((n) => (
            <button key={n} type="button" onClick={() => cambiarColumnas(n)} className={cols === n ? 'activo' : ''} title={`${n * n} bolsillos por hoja`} aria-pressed={cols === n}>
              <span className="text-[11px] font-bold tabular-nums">{n}×{n}</span>
            </button>
          ))}
        </div>

        <span className="album-separador" />

        <div className="flex items-center gap-1">
          <button type="button" className="album-flecha hidden sm:flex" onClick={() => irA(0)} disabled={vista === 0} title="Primera página" aria-label="Primera página">
            <ChevronsLeft size={17} />
          </button>
          <button type="button" className="album-flecha" onClick={() => pasar(-1)} disabled={vista === 0} title="Anterior (←)" aria-label="Página anterior">
            <ChevronLeft size={19} />
          </button>
          <div className="flex flex-col items-center px-1 min-w-[112px]">
            <span className="text-[11px] font-semibold text-white/85 tabular-nums whitespace-nowrap">{etiqueta}</span>
            {vistas > 1 && (
              <input
                type="range"
                min={0}
                max={vistas - 1}
                value={vista}
                onChange={(e) => irA(Number(e.target.value))}
                className="album-deslizador hidden sm:block"
                aria-label="Ir a la página"
              />
            )}
          </div>
          <button type="button" className="album-flecha" onClick={() => pasar(1)} disabled={vista >= vistas - 1} title="Siguiente (→)" aria-label="Página siguiente">
            <ChevronRight size={19} />
          </button>
          <button type="button" className="album-flecha hidden sm:flex" onClick={() => irA(vistas - 1)} disabled={vista >= vistas - 1} title="Última página" aria-label="Última página">
            <ChevronsRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
};
