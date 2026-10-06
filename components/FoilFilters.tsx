/**
 * Filtros SVG que recortan las LETRAS del nombre a partir de la imagen de la
 * carta, para que el foil brille con la forma exacta de cada letra.
 *
 * Por qué así y no de otra forma:
 *   - Las imágenes de YGOPRODeck no envían cabeceras CORS, así que no se pueden
 *     leer sus píxeles con un canvas ni usarlas como `mask-image` (las máscaras
 *     CSS sí exigen CORS). Un filtro SVG, en cambio, solo transforma lo que se
 *     pinta: no lee nada desde JavaScript y no necesita permiso.
 *   - La tinta del nombre NO es igual en todas las cartas. Medido sobre una de
 *     cada tipo: es negra en Normal, Efecto, Ritual, Fusión, Sincronía y
 *     Péndulo, y BLANCA en Xyz, Link, Mágica y Trampa. Por eso hay dos filtros.
 *
 * Los dos calculan la oscuridad de cada píxel (1 − luminancia) y la pasan por
 * un umbral duro, que deja la letra y descarta el fondo:
 *
 *   tinta oscura → blanco donde hay letra, negro en el resto
 *   tinta clara  → negro donde hay letra, blanco en el resto
 *
 * Los umbrales están ajustados sobre las imágenes reales. El de la tinta oscura
 * es estricto (0,78) porque el fondo morado moteado de las Fusión es casi tan
 * oscuro como la letra y con uno más blando se colaba como grano.
 *
 * Se monta una sola vez por página; las cartas los usan con `filter: url(#…)`.
 */
export function FoilFilters() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <filter id="yt-letras-tinta-oscura" colorInterpolationFilters="sRGB">
          {/* Oscuridad = 1 − luminancia, opaca. */}
          <feColorMatrix
            type="matrix"
            values="-0.299 -0.587 -0.114 0 1
                    -0.299 -0.587 -0.114 0 1
                    -0.299 -0.587 -0.114 0 1
                     0      0      0     0 1"
          />
          {/* Umbral: (oscuridad − 0,78) × 8, recortado a [0, 1]. */}
          <feComponentTransfer>
            <feFuncR type="linear" slope="8" intercept="-6.24" />
            <feFuncG type="linear" slope="8" intercept="-6.24" />
            <feFuncB type="linear" slope="8" intercept="-6.24" />
          </feComponentTransfer>
        </filter>

        <filter id="yt-letras-tinta-clara" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="-0.299 -0.587 -0.114 0 1
                    -0.299 -0.587 -0.114 0 1
                    -0.299 -0.587 -0.114 0 1
                     0      0      0     0 1"
          />
          {/* (oscuridad − 0,30) × 6: la letra blanca queda en negro y el fondo en blanco. */}
          <feComponentTransfer>
            <feFuncR type="linear" slope="6" intercept="-1.8" />
            <feFuncG type="linear" slope="6" intercept="-1.8" />
            <feFuncB type="linear" slope="6" intercept="-1.8" />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
}
