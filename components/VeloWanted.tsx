/**
 * Las cartas WANTED en gris y algo oscurecidas.
 *
 * No va con `filter` en la imagen: dentro de la carta, que se inclina en 3D, Chrome
 * a veces no repintaba una imagen con filtro al terminar de cargar (diferida), y
 * la carta se quedaba en negro hasta pasar el ratón por encima. Dos capas encima
 * hacen lo mismo sin tocar la imagen: una gris que le quita el color (mezcla
 * "saturation") y otra negra translúcida que la oscurece.
 */
export default function VeloWanted() {
  return (
    <>
      <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: '#808080', mixBlendMode: 'saturation' }} />
      <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0, 0, 0, 0.25)' }} />
    </>
  );
}
