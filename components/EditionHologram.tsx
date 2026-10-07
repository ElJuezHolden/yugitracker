interface Props {
  /** Imagen de la carta: solo se pinta sobre las de YGOPRODeck. */
  img: string;
  is1st: boolean;
  isLimited?: boolean;
}

/**
 * El cuadrito holográfico de la esquina inferior derecha: dorado en 1.ª edición,
 * plateado en Unlimited y Limited (estilos en CardFoilOverlay.css). Solo sobre
 * las imágenes de YGOPRODeck: los escaneos de cartas reales (las sacadas de
 * Yugipedia) ya traen el suyo.
 */
export default function EditionHologram({ img, is1st, isLimited }: Props) {
  if (!/images\.ygoprodeck\.com/.test(img)) return null;
  return (
    <span
      className={`holo-edicion ${is1st ? 'holo-edicion--oro' : 'holo-edicion--plata'}`}
      title={is1st ? '1.ª edición' : isLimited ? 'Limited' : 'Unlimited'}
      aria-hidden="true"
    />
  );
}
