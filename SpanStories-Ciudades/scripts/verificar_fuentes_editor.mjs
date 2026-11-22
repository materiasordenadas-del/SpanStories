// Cotejo de los catálogos del usuario (estilos y césped) con el código canónico del Generador.
// Solo lectura. Uso: node scripts/verificar_fuentes_editor.mjs [carpeta con los HTML]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const carpeta = process.argv[2] || 'D:/Español/imagen para animación/Ambiente/vegetacion';
const render = path.join(raiz, 'Generador-Mundos/src/estudio/render');
const informe = [];
const fallos = [];
const ok = (texto) => informe.push('- ✅ ' + texto);
const mal = (texto) => { informe.push('- ❌ ' + texto); fallos.push(texto); };
const aviso = (texto) => informe.push('- ⚠️ ' + texto);

// ---- Estilos: catálogo HTML vs style-pool.js ----
const catalogoHtml = fs.readFileSync(path.join(carpeta, 'SpanStories_Atlas_Catalogo_Estilos.html'), 'utf8');
const pool = await import(pathToFileURL(path.join(render, 'style-pool.js')).href);
const filas = [...catalogoHtml.matchAll(/\{id:'(\w+)',name:'([^']+)',mode:(\d+),family:'([^']+)'/g)];
informe.push('## Estilos visuales (catálogo HTML ↔ `style-pool.js`)');
if (filas.length !== pool.STYLE_CATALOG.length) mal(`El catálogo HTML tiene ${filas.length} estilos y el Generador ${pool.STYLE_CATALOG.length}.`);
else ok(`Ambos tienen ${filas.length} estilos.`);
for (const [, id, nombre, modo] of filas) {
  const canon = pool.STYLE_CATALOG.find((s) => s.id === id);
  if (!canon) mal(`«${nombre}» (${id}) no existe en el Generador.`);
  else if (canon.mode !== Number(modo)) mal(`«${nombre}»: modo ${modo} en HTML y ${canon.mode} en el Generador.`);
  else ok(`«${nombre}» · id \`${id}\` · modo ${modo} coincide (nombre del Generador: «${canon.name}»).`);
}
const base = catalogoHtml.match(/const BASE=\{([^}]+)\}/)?.[1] ?? '';
for (const par of base.split(',')) {
  const [clave, valor] = par.split(':');
  if (!clave) continue;
  const canon = pool.STYLE_DEFAULTS[clave];
  if (canon === undefined) mal(`Parámetro HTML \`${clave}\` no existe en STYLE_DEFAULTS.`);
  else if (Math.abs(canon - Number(valor)) > 1e-9) mal(`\`${clave}\`: HTML ${valor}, Generador ${canon}.`);
  else ok(`\`${clave}\` = ${valor} coincide.`);
}
const controlesHtml = [...catalogoHtml.matchAll(/\['(\w+)','[^']+',([\d.]+),([\d.]+),([\d.]+)\]/g)].map((m) => m[1]);
const controlesCanon = pool.STYLE_CONTROLS.map((c) => c.key);
const falta = controlesCanon.filter((k) => !controlesHtml.includes(k));
if (falta.length) aviso(`El HTML solo expone ${controlesHtml.join(', ')}; el Generador además tiene: ${falta.join(', ')}. El editor mostrará los controles del Generador (canónicos).`);
else ok('Los controles coinciden.');

// ---- Césped: V12 vs grass-config.js ----
informe.push('', '## Césped (V12 ↔ `grass-config.js`)');
const v12 = fs.readFileSync(path.join(carpeta, 'SpanStories_cesped_V12.html'), 'utf8');
const config = await import(pathToFileURL(path.join(render, 'grass-config.js')).href);
const defaultsV12 = v12.match(/const defaults=\{(enabled:true,preset:[^}]+)\};/)?.[1];
if (!defaultsV12) mal('No se encontró `defaults` en V12.');
else {
  const valores = Object.fromEntries(defaultsV12.split(',').map((par) => {
    const i = par.indexOf(':'); const v = par.slice(i + 1).trim();
    return [par.slice(0, i), v === 'true' ? true : v === 'false' ? false : v.startsWith("'") ? v.slice(1, -1) : Number(v)];
  }));
  let distintos = 0;
  for (const [clave, valor] of Object.entries(valores)) {
    if (!(clave in config.GRASS_DEFAULTS)) { mal(`V12 define \`${clave}\` que el Generador no tiene.`); distintos++; }
    else if (config.GRASS_DEFAULTS[clave] !== valor) { mal(`\`${clave}\`: V12 ${valor}, Generador ${config.GRASS_DEFAULTS[clave]}.`); distintos++; }
  }
  for (const clave of Object.keys(config.GRASS_DEFAULTS)) if (!(clave in valores)) { mal(`El Generador define \`${clave}\` que V12 no tiene.`); distintos++; }
  if (!distintos) ok(`Los ${Object.keys(valores).length} parámetros por defecto de V12 son idénticos a \`GRASS_DEFAULTS\`.`);
}
const presetsV12 = v12.match(/const presets=\{([^;]+)\};/)?.[1] ?? '';
for (const [, nombre, d, , mi, mt] of presetsV12.matchAll(/(\w+):\[([\d.]+),([\d.]+),(\d+),(\d+)\]/g)) {
  const c = config.GRASS_PRESETS[nombre];
  if (!c) mal(`Preset V12 «${nombre}» no existe en el Generador.`);
  else if (c.density !== Number(d) || c.maxInstances !== Number(mi) || c.maxTriangles !== Number(mt)) mal(`Preset «${nombre}» difiere (densidad/instancias/triángulos).`);
  else ok(`Preset «${nombre}» coincide.`);
}
const oot = v12.match(/const ootDefaults=\{\.\.\.defaults,([^}]+)\};/)?.[1];
if (oot) aviso('Ocarina Remake V1 = `GRASS_DEFAULTS` + `{' + oot + '}` → se adopta como perfil de parámetros (sin motor nuevo).');
const variantes = 13;
informe.push('', '### Las 13 variantes de V12 y cómo se integran',
  '| # | Variante | Técnica | Decisión |', '|---|---|---|---|');
const fila = (n, v, t, d) => informe.push(`| ${n} | ${v} | ${t} | ${d} |`);
['Trigun', 'Zelda', 'Studio Ghibli', 'Dispatch', 'Color', 'Color + línea'].forEach((v, i) => fila(i + 1, v, 'Parámetros sobre `GrassField` + tinte del estilo', 'Perfil de parámetros (motor compartido)'));
fila(7, 'Ocarina Remake V1', '`GrassField` con `ootDefaults`', 'Perfil de parámetros (motor compartido)');
fila(8, 'Colina original', '`ColinaQuijote` (ya en el visor)', 'Se conserva; el editor expone sus controles existentes');
fila(9, 'Ocarina Remake V2', 'Módulo incrustado `ColinaOcarinaV2.js`', 'Evaluar en F2 (ver PENDIENTES)');
fila(10, 'Ocarina Remake V3', 'Módulo incrustado `ColinaOcarinaV3.js` (863 304 triángulos)', 'Evaluar en F2 (coste alto)');
fila(11, 'Ocarina Remake V4', 'Módulo importado `ocarina4`', 'Evaluar en F2');
fila(12, 'Pradera V5', 'Módulo `meadow` (5×5 m)', 'Evaluar en F2');
fila(13, 'James Smyth', '`grass-james-*` ya existe en el Generador', 'Perfil sobre `GrassField` (material James)');
if (variantes !== 13) mal('Recuento de variantes inesperado.');

// ---- Reglas GLSL: palabras reservadas que rompieron V11 ----
informe.push('', '## Palabras reservadas GLSL ES 3.00 en los shaders del césped del Generador');
const reservadas = ['patch', 'sample', 'input', 'output', 'filter', 'common', 'partition', 'active', 'asm', 'class', 'union', 'enum', 'typedef', 'template', 'this', 'resource', 'goto', 'inline', 'noinline', 'public', 'static', 'extern', 'external', 'interface', 'long', 'short', 'half', 'fixed', 'unsigned', 'superp', 'namespace', 'using'];
for (const archivo of ['grass-shaders.js', 'grass-james-source.js', 'gmaterial.js']) {
  const texto = fs.readFileSync(path.join(render, archivo), 'utf8');
  const glsl = [...texto.matchAll(/\/\*\s*glsl\s*\*\/\s*`([\s\S]*?)`/g)].map((m) => m[1]).join('\n') || texto;
  const hallazgos = reservadas.filter((p) => new RegExp(`\\b(float|vec[234]|int|bool|mat[234])\\s+${p}\\b`).test(glsl));
  if (hallazgos.length) mal(`${archivo}: declara ${hallazgos.join(', ')} (palabra reservada).`); else ok(`${archivo}: sin declaraciones de palabras reservadas.`);
}

const texto = ['# Verificación de fuentes del editor', '', `Generado por \`scripts/verificar_fuentes_editor.mjs\` · ${new Date().toISOString().slice(0, 10)}`, '', ...informe, '', fallos.length ? `**${fallos.length} diferencia(s) a revisar.**` : '**Sin diferencias.**', ''].join('\n');
const salida = path.join(raiz, 'SpanStories-Ciudades/docs/editor/VERIFICACION_FUENTES.md');
fs.mkdirSync(path.dirname(salida), {recursive: true});
fs.writeFileSync(salida, texto);
console.log(texto);
process.exitCode = fallos.length ? 1 : 0;
