#!/usr/bin/env node
// Cliente para IA: manda comandos a la app abierta (npm run dev + navegador en http://127.0.0.1:5189).
//   node herramientas/ia.mjs ayuda
//   node herramientas/ia.mjs estado
//   node herramientas/ia.mjs usarClip '{"id":"lib:ual_1:walk_loop"}'
//   node herramientas/ia.mjs rotar '{"hueso":"head","y":20,"f":12}'
//   node herramientas/ia.mjs --lote pasos.json      (lista [{cmd,args}] en orden; se para en el primer error)
// Variable TALLER_URL para otro puerto.
import fs from 'node:fs';
import http from 'node:http';

const BASE = process.env.TALLER_URL || 'http://127.0.0.1:5189';

// node:http y no fetch: el fetch de Node corta a los 300 s sin cabeceras (headersTimeout de undici)
// y `texto` (Kimodo) puede tardar hasta 600 s. El límite real lo pone el servidor (args.timeout).
function enviar(cmd, args = {}) {
  const cuerpo = JSON.stringify({ cmd, args,session:process.env.TALLER_SESSION||null });
  return new Promise((resolve) => {
    const req = http.request(`${BASE}/api/ia`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) } }, (res) => {
      let datos = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (datos += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(datos));
        } catch {
          resolve({ ok: false, error: `Respuesta no válida (${res.statusCode}): ${datos.slice(0, 200)}` });
        }
      });
    });
    req.setTimeout(0);
    req.on('error', (e) => resolve({ ok: false, error: `No hay servidor en ${BASE} (${e.code || e.message}). Arranca con: npm run dev (y abre la app en el navegador).` }));
    req.end(cuerpo);
  });
}

const [, , cmd = 'ayuda', ...rest] = process.argv;
if (cmd === '--lote') {
  const pasos = JSON.parse(fs.readFileSync(rest[0], 'utf8'));
  const resultados = [];
  for (const [i, p] of pasos.entries()) {
    const r = await enviar(p.cmd, p.args || {});
    resultados.push({ paso: i, cmd: p.cmd, ...r });
    if (!r.ok) break;
  }
  console.log(JSON.stringify(resultados, null, 2));
  process.exit(resultados.every((r) => r.ok) ? 0 : 1);
} else {
  let args = {};
  if (rest.length) {
    const raw = rest.join(' ');
    try {
      args = JSON.parse(raw);
    } catch {
      console.error(`Argumentos JSON no válidos: ${raw}`);
      process.exit(2);
    }
  }
  const r = await enviar(cmd, args);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
