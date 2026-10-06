import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import CardFoilOverlay from './components/CardFoilOverlay';
import { FoilFilters } from './components/FoilFilters';
import { useCardPointer } from './components/useCardPointer';
import './index.css';

/*
 * Banco de pruebas de los brillos (solo desarrollo: `npm run dev` y abrir
 * /foil-demo.html). Vite solo empaqueta index.html, así que no llega a
 * producción.
 *
 * Usa el componente de verdad, no una copia: lo que se ve aquí es lo que se ve
 * en la colección. Hay una carta de cada tipo porque el nombre se trata
 * distinto según la tinta (negra en monstruos normales, de efecto, fusión…;
 * blanca en Xyz, Link, Mágica y Trampa).
 */

const GRUPOS: { titulo: string; rarezas: string[] }[] = [
  { titulo: 'Sin foil', rarezas: ['Common', 'Short Print', 'Super Short Print'] },
  { titulo: 'Escalera clásica', rarezas: ['Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Ultimate Rare'] },
  {
    titulo: 'Familia Secret',
    rarezas: ['Ultra Secret Rare', 'Extra Secret Rare', 'Prismatic Secret Rare', 'Platinum Secret Rare', 'Platinum Rare'],
  },
  {
    titulo: 'Premium y aniversario',
    rarezas: [
      'Ghost Rare',
      'Ghost/Gold Rare',
      "Collector's Rare",
      'Starlight Rare',
      'Quarter Century Secret Rare',
      'Grand Master Rare',
      "Ultra Rare (Pharaoh's Rare)",
    ],
  },
  { titulo: 'Serie dorada', rarezas: ['Gold Rare', 'Gold Secret Rare', 'Premium Gold Rare'] },
  { titulo: 'Millennium', rarezas: ['Millennium Rare'] },
  { titulo: 'Tramas en toda la carta', rarezas: ['Starfoil Rare', 'Mosaic Rare', 'Shatterfoil Rare'] },
  {
    titulo: 'Parallel y Duel Terminal',
    rarezas: ['Normal Parallel Rare', 'Ultra Parallel Rare', 'Duel Terminal Rare Parallel Rare'],
  },
];

const img = (id: number) => `https://images.ygoprodeck.com/images/cards/${id}.jpg`;

/** Una carta por tipo de marco. El tipo decide si la tinta del nombre es negra o blanca. */
const CARTAS: Record<string, { img: string; tipo: string }> = {
  'Dark Magician (normal, tinta negra)': { img: img(46986414), tipo: 'Normal Monster' },
  'Jinzo (efecto, tinta negra)': { img: img(77585513), tipo: 'Effect Monster' },
  'Stardust Dragon (sincronía, tinta negra)': { img: img(44508094), tipo: 'Synchro Monster' },
  'Number 39: Utopia (Xyz, tinta blanca)': { img: img(84013237), tipo: 'XYZ Monster' },
  'Monster Reborn (mágica, tinta blanca)': { img: img(83764718), tipo: 'Spell Card' },
  'Mirror Force (trampa, tinta blanca)': { img: img(44095762), tipo: 'Trap Card' },
};

function CartaDemo({ rareza, carta, zonas }: { rareza: string; carta: { img: string; tipo: string }; zonas: boolean }) {
  const ref = useCardPointer();

  return (
    <figure className="flex flex-col gap-2">
      <div ref={ref} className="card-container relative w-full aspect-[421/614] rounded-lg overflow-hidden bg-black">
        {/* La imagen y el foil se inclinan juntos, igual que en la aplicación. */}
        <div className="card-tilt">
          <img src={carta.img} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <CardFoilOverlay rarity={rareza} img={carta.img} cardType={carta.tipo} />
        </div>
        {zonas && (
          <>
            <div
              className="absolute border border-dashed border-cyan-400/80 z-[30]"
              style={{ top: '17.2%', right: '11.5%', bottom: '29.4%', left: '10.4%' }}
            />
            <div
              className="absolute border border-dashed border-pink-400/80 z-[30]"
              style={{ top: '5.4%', right: '16.5%', bottom: '89.5%', left: '5.8%' }}
            />
          </>
        )}
      </div>
      <figcaption className="text-xs font-medium text-muted text-center leading-tight">{rareza}</figcaption>
    </figure>
  );
}

function Demo() {
  const [nombreCarta, setNombreCarta] = useState(Object.keys(CARTAS)[0]!);
  const [ancho, setAncho] = useState(220);
  const [zonas, setZonas] = useState(false);
  const carta = CARTAS[nombreCarta]!;

  return (
    <div className="min-h-screen p-6 text-main">
      <FoilFilters />
      <header className="mb-6 flex flex-wrap items-end gap-6">
        <div>
          <h1 className="text-2xl font-bold">Brillos por rareza</h1>
          <p className="text-muted text-sm">
            Pasa el cursor por encima: la luz sigue a la mano. Sin cursor, un destello cruza cada carta de vez en cuando.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Carta
          <select
            value={nombreCarta}
            onChange={(e) => setNombreCarta(e.target.value)}
            className="bg-bg-surface border border-border-base rounded-lg px-3 py-1.5 text-sm text-main"
          >
            {Object.keys(CARTAS).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Tamaño: {ancho}px
          <input type="range" min={120} max={420} value={ancho} onChange={(e) => setAncho(Number(e.target.value))} className="accent-primary" />
        </label>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={zonas} onChange={(e) => setZonas(e.target.checked)} />
          Marcar las zonas
        </label>
      </header>

      {GRUPOS.map((grupo) => (
        <section key={grupo.titulo} className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">{grupo.titulo}</h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${ancho}px, 1fr))` }}>
            {grupo.rarezas.map((rareza) => (
              <CartaDemo key={rareza} rareza={rareza} carta={carta} zonas={zonas} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Falta #root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Demo />
  </React.StrictMode>,
);
