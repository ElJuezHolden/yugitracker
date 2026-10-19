/*
 * Códigos de las cartas en español.
 *
 * Desde hace años la española lleva el código inglés con SP en vez de EN
 * (LC03-SP006); las primeras, S (LOB-S005 no existe: es LDD-S005). Siete sets
 * antiguos tienen además un prefijo propio en español, con el mismo número que
 * la inglesa (Yugipedia, listas TCG-SP; comprobado carta a carta):
 *
 *   LDD = LOB (Leyenda del Dragón Blanco de Ojos Azules)
 *   PMT = MRD (Metal Raiders)
 *   SDH = SRL / MRL (Spell Ruler)
 *   BIJ, BIK, BIP, BIY = SDJ, SDK, SDP, SDY (Barajas de Inicio)
 *
 * Las fuentes (YGOPRODeck, Cardmarket) solo tienen el código inglés, y es el
 * que se guarda en la copia: Cardmarket vende todos los idiomas en el mismo
 * producto, así que el precio es el mismo. El español solo se enseña y se busca.
 */

const DE_INGLES: Record<string, string> = {
  LOB: 'LDD',
  MRD: 'PMT',
  SRL: 'SDH',
  MRL: 'SDH',
  SDJ: 'BIJ',
  SDK: 'BIK',
  SDP: 'BIP',
  SDY: 'BIY',
};

const A_INGLES: Record<string, string[]> = {};
for (const [en, es] of Object.entries(DE_INGLES)) (A_INGLES[es] ??= []).push(en);

/** Código de la impresión española de un código inglés con prefijo propio ("SDJ-015" → "BIJ-S015"); si no, null. */
export function codigoEspanol(codigo: string): string | null {
  const m = /^([A-Z]+)-(?:EN|E)?(\d{3})$/.exec(codigo.toUpperCase());
  const es = m ? DE_INGLES[m[1]!] : undefined;
  return es ? `${es}-S${m![2]}` : null;
}

/** El código que lleva impreso esa copia: el español si la copia es española y su set tiene prefijo propio. */
export function codigoDeCopia(codigo: string, lang: string | undefined): string {
  return (lang === 'ES' && codigoEspanol(codigo)) || codigo;
}

/** Códigos ingleses con los que buscar un código español ("BIJ-S015" → SDJ-015, SDJ-EN015; "LC03-SP006" → LC03-EN006). */
export function codigosIngleses(codigo: string): string[] {
  const c = codigo.toUpperCase();
  const fuera: string[] = [];
  const propio = /^([A-Z]+)-S(\d{3})$/.exec(c);
  for (const en of propio ? (A_INGLES[propio[1]!] ?? []) : []) fuera.push(`${en}-EN${propio![2]}`, `${en}-${propio![2]}`);
  const sp = c.replace(/-SP?(\d)/, '-EN$1');
  if (sp !== c) fuera.push(sp);
  return fuera;
}
