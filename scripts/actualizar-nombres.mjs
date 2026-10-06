/*
 * Nombres en español de las cartas, para poder buscarlas por ellos.
 *
 * YGOPRODeck no tiene nombres en español (solo francés, alemán, italiano y
 * portugués). Yugipedia sí, junto al número de la carta (password), que es el
 * mismo id que usa YGOPRODeck. Su API devuelve como mucho 5000 resultados por
 * consulta, así que se pide en 10 tandas, una por el primer dígito del número.
 *
 * Los nombres casi no cambian: se vuelven a pedir una vez por semana, para no
 * cargar a Yugipedia. Si falla, se queda el archivo anterior.
 *
 * Archivo: nombres-es.json  { v: 1, actualizado: <día>, nombres: [[id, "Nombre"], ...] }
 *
 * Uso: node scripts/actualizar-nombres.mjs <carpeta>
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CARPETA = process.argv[2] ?? 'datos-precios';
const ARCHIVO = join(CARPETA, 'nombres-es.json');
const API = 'https://yugipedia.com/api.php';
const AGENTE = 'YugiTracker/1.0 (coleccion personal; https://github.com/ElJuezHolden/yugitracker)';
const DIA_MS = 24 * 60 * 60 * 1000;
const CADA_DIAS = 7;
const POR_PAGINA = 500;
const hoy = Math.floor(Date.now() / DIA_MS);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const anterior = JSON.parse(await readFile(ARCHIVO, 'utf8'));
  if (anterior?.v === 1 && hoy - anterior.actualizado < CADA_DIAS) {
    console.log(`Nombres en español del día ${anterior.actualizado}: aún valen.`);
    process.exit(0);
  }
} catch {
  // No hay archivo anterior: se genera.
}

const nombres = new Map();
for (let digito = 0; digito <= 9; digito++) {
  for (let offset = 0; ; offset += POR_PAGINA) {
    const consulta = `[[Spanish name::+]][[Password::~${digito}*]]|?Spanish name|?Password|limit=${POR_PAGINA}|offset=${offset}`;
    const res = await fetch(`${API}?action=ask&format=json&query=${encodeURIComponent(consulta)}`, {
      headers: { 'User-Agent': AGENTE },
    });
    if (!res.ok) throw new Error(`Yugipedia respondió ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`Yugipedia: ${json.error.info ?? JSON.stringify(json.error)}`);
    for (const { printouts } of Object.values(json.query?.results ?? {})) {
      const id = Number.parseInt(printouts.Password?.[0], 10);
      const nombre = printouts['Spanish name']?.[0];
      if (Number.isFinite(id) && id > 0 && typeof nombre === 'string' && nombre.trim()) nombres.set(id, nombre.trim());
    }
    await esperar(1000); // Educación con un wiki que mantienen voluntarios.
    if (json['query-continue-offset'] == null) break;
  }
}

if (nombres.size < 5000) throw new Error(`Solo ${nombres.size} nombres: algo ha fallado, se deja el archivo anterior.`);
await mkdir(CARPETA, { recursive: true });
await writeFile(ARCHIVO, JSON.stringify({ v: 1, actualizado: hoy, nombres: [...nombres] }));
console.log(`${nombres.size} nombres en español guardados.`);
