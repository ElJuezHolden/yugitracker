/*
 * Apunta los precios de hoy de TODAS las cartas en el historial público.
 *
 * Lo ejecuta GitHub Actions una vez al día (ver .github/workflows/deploy.yml),
 * así el historial crece aunque nadie tenga la web abierta. La web lo lee de
 * /precios/NN.json y lo mezcla con lo que apunta cada navegador.
 *
 * Formato de cada archivo (las cartas se reparten en 100 por `id % 100`):
 *
 *   { "v": 1, "actualizado": <día>, "cartas": { "<id>": { "<set>|<rareza>": [[<día>, <dólares>], ...] } } }
 *
 * Los días son días desde 1970 (UTC). Solo se apunta un precio cuando cambia:
 * entre dos puntos el precio es el del primero. Para que no crezca sin fin,
 * pasado un mes se deja un punto por semana y pasados 400 días se borra.
 *
 * Uso: node scripts/actualizar-precios.mjs <carpeta>
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CARPETA = process.argv[2] ?? 'datos-precios';
const API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const TROZOS = 100;
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_DIARIOS = 30;
const DIAS_MAXIMOS = 400;

const hoy = Math.floor(Date.now() / DIA_MS);

// 1. Precios de hoy: una sola petición con todas las cartas (unos 20 MB).
const res = await fetch(API);
if (!res.ok) throw new Error(`YGOPRODeck respondió ${res.status}`);
const { data } = await res.json();
if (!Array.isArray(data) || data.length < 1000) throw new Error('Respuesta de YGOPRODeck incompleta');

/** id → (clave → dólares) */
const deHoy = new Map();
for (const carta of data) {
  const precios = {};
  for (const s of carta.card_sets ?? []) {
    const usd = Number.parseFloat(s.set_price);
    if (Number.isFinite(usd) && usd > 0) precios[`${s.set_code}|${s.set_rarity}`] = usd;
  }
  if (Object.keys(precios).length) deHoy.set(carta.id, precios);
}

// 2. Se cargan los trozos existentes, se añade lo de hoy y se aclara lo viejo.
await mkdir(CARPETA, { recursive: true });
const trozos = [];
for (let i = 0; i < TROZOS; i++) {
  try {
    trozos.push(JSON.parse(await readFile(join(CARPETA, `${i}.json`), 'utf8')));
  } catch {
    trozos.push({ v: 1, actualizado: hoy, cartas: {} });
  }
}

let cambios = 0;
for (const [id, precios] of deHoy) {
  const cartas = trozos[id % TROZOS].cartas;
  const historial = (cartas[id] ??= {});
  for (const [clave, usd] of Object.entries(precios)) {
    const puntos = (historial[clave] ??= []);
    const ultimo = puntos[puntos.length - 1];
    if (ultimo && ultimo[1] === usd) continue;
    if (ultimo && ultimo[0] === hoy) ultimo[1] = usd;
    else puntos.push([hoy, usd]);
    cambios++;
  }
}

/** Un punto por día el último mes, uno por semana antes, y nada de hace más de 400 días. */
function aclarar(puntos) {
  const limite = hoy - DIAS_MAXIMOS;
  const desdeDiario = hoy - DIAS_DIARIOS;
  const fuera = puntos.filter((p) => p[0] < limite);
  const quedan = puntos.filter((p) => p[0] >= limite);
  // El último de antes del límite se conserva: es el precio con el que empieza la ventana.
  const ancla = fuera.length ? [[limite, fuera[fuera.length - 1][1]]] : [];
  const semanal = new Map();
  for (const p of quedan) if (p[0] < desdeDiario) semanal.set(Math.floor(p[0] / 7), p);
  return [...ancla, ...semanal.values(), ...quedan.filter((p) => p[0] >= desdeDiario)];
}

for (let i = 0; i < TROZOS; i++) {
  const trozo = trozos[i];
  trozo.actualizado = hoy;
  for (const historial of Object.values(trozo.cartas)) {
    for (const clave of Object.keys(historial)) historial[clave] = aclarar(historial[clave]);
  }
  await writeFile(join(CARPETA, `${i}.json`), JSON.stringify(trozo));
}

console.log(`${deHoy.size} cartas con precio, ${cambios} precios nuevos o cambiados hoy.`);
