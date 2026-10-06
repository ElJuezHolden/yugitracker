/*
 * Banderita del idioma de una copia. Dibujada en SVG: en Windows los emojis de
 * bandera se ven como dos letras ("ES"), así que no sirven.
 */

export const IDIOMAS: { id: string; nombre: string }[] = [
  { id: 'ES', nombre: 'Español' },
  { id: 'EN', nombre: 'Inglés' },
  { id: 'JP', nombre: 'Japonés' },
];

export const nombreIdioma = (lang: string) => IDIOMAS.find((i) => i.id === lang)?.nombre ?? lang;

interface Props {
  lang: string;
  /** Alto en píxeles (el ancho sale de la proporción 3:2). */
  size?: number;
  className?: string;
}

export function LanguageFlag({ lang, size = 14, className = '' }: Props) {
  const comun = {
    width: Math.round(size * 1.5),
    height: size,
    viewBox: '0 0 30 20',
    className: `inline-block shrink-0 rounded-[2px] ring-1 ring-black/20 ${className}`,
    role: 'img',
    'aria-label': nombreIdioma(lang),
  } as const;

  if (lang === 'ES') {
    return (
      <svg {...comun}>
        <title>{nombreIdioma(lang)}</title>
        <rect width="30" height="20" fill="#c60b1e" />
        <rect y="5" width="30" height="10" fill="#ffc400" />
      </svg>
    );
  }
  if (lang === 'EN') {
    // Union Jack simplificada.
    return (
      <svg {...comun}>
        <title>{nombreIdioma(lang)}</title>
        <g>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
          <path d="M0 0 30 20M30 0 0 20" stroke="#c8102e" strokeWidth="1.6" />
          <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
          <path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.4" />
        </g>
      </svg>
    );
  }
  if (lang === 'JP') {
    return (
      <svg {...comun}>
        <title>{nombreIdioma(lang)}</title>
        <rect width="30" height="20" fill="#fff" />
        <circle cx="15" cy="10" r="5.6" fill="#bc002d" />
      </svg>
    );
  }
  return <span className={`text-[10px] font-bold ${className}`}>{lang}</span>;
}
