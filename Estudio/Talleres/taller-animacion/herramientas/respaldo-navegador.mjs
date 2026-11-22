// Respaldo en disco de los datos del Taller (facial y animación) que el navegador guarda en localStorage.
//  GET  /api/respaldo-navegador            → { items: [{clave, valor, fecha}] }
//  POST /api/respaldo-navegador            → cuerpo { items: [{clave, valor, fecha?}] } (guarda/actualiza)
// Cada clave es un archivo JSON en biblioteca/respaldo-navegador/. Escritura atómica (temporal + rename);
// la versión anterior se conserva como <archivo>.anterior.json. Nunca se borra nada.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PREFIJOS = [
  'spanstories.facial-project.v1:',
  'spanstories.facial-draft.v1:',
  'spanstories.facial-gain.v1:',
  'spanstories.acting-style.v1:',
  'spanstories.character-physics.v1:',
  'taller:',
];
const MAX_VALOR = 8 * 1024 * 1024;
const MAX_LOTE = 400;

export const claveValida = (c) => typeof c === 'string' && c.length <= 400 && PREFIJOS.some((p) => c.startsWith(p) && c.length > p.length);

export function nombreArchivo(clave) {
  const legible = clave.replace(/[^\w.-]+/g, '_').slice(0, 80);
  const hash = crypto.createHash('sha1').update(clave).digest('hex').slice(0, 10);
  return `${legible}.${hash}.json`;
}

export function crearRespaldo(dir) {
  function escribir(clave, valor, fecha) {
    if (!claveValida(clave)) throw Object.assign(new Error('clave no permitida'), { code: 400 });
    if (typeof valor !== 'string' || valor.length > MAX_VALOR) throw Object.assign(new Error('valor no válido o demasiado grande'), { code: 400 });
    fs.mkdirSync(dir, { recursive: true });
    const destino = path.join(dir, nombreArchivo(clave));
    const nuevo = JSON.stringify({ clave, fecha: Number(fecha) || Date.now(), valor }, null, 1);
    if (fs.existsSync(destino)) {
      try {
        if (JSON.parse(fs.readFileSync(destino, 'utf8')).valor === valor) return false; // sin cambios
      } catch { /* archivo ilegible: se conserva como .anterior y se reescribe */ }
      fs.copyFileSync(destino, destino.replace(/\.json$/, '.anterior.json'));
    }
    const tmp = destino + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, nuevo);
    fs.renameSync(tmp, destino);
    return true;
  }
  function leerTodo() {
    if (!fs.existsSync(dir)) return [];
    const items = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.endsWith('.anterior.json')) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (claveValida(d.clave) && typeof d.valor === 'string') items.push({ clave: d.clave, valor: d.valor, fecha: d.fecha || 0 });
      } catch { /* se ignora el archivo dañado; no se toca */ }
    }
    return items;
  }
  function guardarLote(items) {
    if (!Array.isArray(items) || items.length > MAX_LOTE) throw Object.assign(new Error('lote no válido'), { code: 400 });
    let guardados = 0;
    for (const it of items) if (escribir(it?.clave, it?.valor, it?.fecha)) guardados++;
    return guardados;
  }
  return { escribir, leerTodo, guardarLote };
}

export function respaldoMiddleware(dir) {
  const r = crearRespaldo(dir);
  const send = (res, data, code = 200) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };
  return async (req, res, next) => {
    const ruta = req.url.split('?')[0];
    if (ruta !== '/api/respaldo-navegador') return next();
    const origen = req.headers.origin;
    if (origen && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origen)) return send(res, { ok: false, error: 'origen no permitido' }, 403);
    try {
      if (req.method === 'GET') return send(res, { ok: true, items: r.leerTodo() });
      if (req.method === 'POST') {
        const chunks = [];
        let total = 0;
        for await (const c of req) {
          total += c.length;
          if (total > MAX_VALOR * 2) return send(res, { ok: false, error: 'cuerpo demasiado grande' }, 413);
          chunks.push(c);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        return send(res, { ok: true, guardados: r.guardarLote(body.items) });
      }
      return send(res, { ok: false, error: 'método no permitido' }, 405);
    } catch (e) {
      return send(res, { ok: false, error: e.message }, e.code || 500);
    }
  };
}
