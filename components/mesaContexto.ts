import { createContext, useContext } from 'react';

/**
 * Lo que la vista mesa (DisplayTable) dice a cada carta: el ancho de su celda y
 * cuántas hay. Con muchas cartas pequeñas, cada una se pinta más ligera (ver
 * CardItem): imagen reducida, sin brillos ni desgaste hasta pasar el ratón y sin
 * animación de posición.
 */
export interface Mesa {
  ancho: number;
  cantidad: number;
}

export const MesaContexto = createContext<Mesa | null>(null);

export const useMesa = () => useContext(MesaContexto);

/**
 * Por debajo de este ancho, la imagen reducida de YGOPRODeck (168 px, muy
 * comprimida). Ampliada (hasta 1,6 veces) no pasa de unos 160 px, su tamaño: con
 * 150 se ampliaban cartas de 130 px a 210 y se veían pixeladas hasta que bajaba la grande.
 */
export const ANCHO_IMAGEN_PEQUENA = 100;
/** Por debajo de este, brillos y desgaste solo en la carta ampliada (no se aprecian). */
export const ANCHO_SIN_EFECTOS = 110;
/** A partir de cuántas cartas se quita la animación de posición (mide todas en cada render). */
export const CARTAS_SIN_LAYOUT = 150;

/** La versión reducida de una imagen de YGOPRODeck; cualquier otra, tal cual. */
export const imagenPequena = (img: string) => img.replace(/(images\.ygoprodeck\.com\/images\/)cards\//, '$1cards_small/');
