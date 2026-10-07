/*
 * Color del brillo del nombre de una copia. Algunas cartas se imprimieron con
 * el nombre en otro color del que toca por su rareza (p. ej. Ultra Rare con el
 * nombre rojo o morado): se elige en la ficha y solo cambia las letras del
 * nombre; el resto del efecto sigue siendo el de su rareza. Los `id` son los
 * metales de CardFoilOverlay.css (.foil-metal--<id>).
 */
export interface NameColor {
  id: string;
  nombre: string;
  /** Muestra para el selector. */
  muestra: string;
}

export const NAME_COLORS: NameColor[] = [
  { id: 'gold', nombre: 'Oro', muestra: 'linear-gradient(100deg, #a5761a, #fff3c4 50%, #a5761a)' },
  { id: 'silver', nombre: 'Plata', muestra: 'linear-gradient(100deg, #848d98, #ffffff 50%, #848d98)' },
  { id: 'platinum', nombre: 'Platino', muestra: 'linear-gradient(100deg, #7f9ab2, #ffffff 50%, #7f9ab2)' },
  { id: 'rainbow', nombre: 'Arcoíris', muestra: 'linear-gradient(100deg, #e6a0c4, #f0d48a, #a8e6b0, #9fd6f0, #c4a8f0)' },
  { id: 'champan', nombre: 'Champán', muestra: 'linear-gradient(100deg, #b89a6a, #fff4e0 50%, #b89a6a)' },
  { id: 'speckled', nombre: 'Moteado', muestra: 'radial-gradient(circle at 30% 40%, #f2a6d0 0 18%, transparent 20%), radial-gradient(circle at 70% 60%, #9fd6f0 0 18%, transparent 20%), #d9dde3' },
  { id: 'red', nombre: 'Rojo', muestra: 'linear-gradient(100deg, #8a1010, #ffb0a8 50%, #8a1010)' },
  { id: 'blue', nombre: 'Azul', muestra: 'linear-gradient(100deg, #12398a, #b4d4ff 50%, #12398a)' },
  { id: 'green', nombre: 'Verde', muestra: 'linear-gradient(100deg, #0f6a2e, #b8f5c8 50%, #0f6a2e)' },
  { id: 'purple', nombre: 'Morado', muestra: 'linear-gradient(100deg, #4b1a8a, #e2c4ff 50%, #4b1a8a)' },
  { id: 'pink', nombre: 'Rosa', muestra: 'linear-gradient(100deg, #9a1e63, #ffc4e4 50%, #9a1e63)' },
  { id: 'bronze', nombre: 'Bronce', muestra: 'linear-gradient(100deg, #6b3a14, #f2c49a 50%, #6b3a14)' },
];

export const nombreColor = (id: string | undefined) => NAME_COLORS.find((c) => c.id === id)?.nombre;
