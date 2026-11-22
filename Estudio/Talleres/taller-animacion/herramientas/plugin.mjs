// Servidor local de Taller de Animación (plugin de Vite):
//  /api/biblioteca          lista de archivos de la biblioteca (local + rutas.json)
//  /bib/<raiz>/<ruta>       sirve esos archivos en su sitio
//  /api/subir               guarda un archivo en biblioteca/<carpeta>/ (mixamo, personajes, objetos…)
//  /api/guardar             guarda una exportación o captura en disco (exportaciones/, reports/)
//  /api/fbx                 GLB → FBX con Blender en segundo plano
//  /api/leer                lee un archivo del disco (para que la IA importe por ruta)
//  /api/mixamo/<acción>     descargas de Mixamo verificadas → biblioteca/mixamo (ver mixamo.mjs)
//  /api/ia                  puente de comandos: la IA manda {cmd,args}, la app abierta responde
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { mixamoApi } from './mixamo.mjs';
import { kimodoApi } from './kimodo.mjs';
import { ecosystemMiddleware } from './ecosystem.mjs';
import { respaldoMiddleware } from './respaldo-navegador.mjs';

export function tallerPlugin({ root }) {
  const BIBLIO = path.join(root, 'biblioteca');
  const EXPORT = path.join(root, 'exportaciones');
  const REPORTS = path.join(root, 'reports');
  const BLENDER = process.env.BLENDER || 'D:/Blender 5.2/blender.exe';
  const SEGURAS = [root, path.resolve(root, '../../..'), 'D:/Español'].map((p) => path.resolve(p).toLowerCase());

  function raices() {
    const out = [{ id: 'local', dir: BIBLIO }];
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(BIBLIO, 'rutas.json'), 'utf8'));
      (cfg.carpetas || []).forEach((c, i) => {
        const dir = path.resolve(BIBLIO, c.ruta);
        if (fs.existsSync(dir)) out.push({ id: `r${i}`, dir, nombre: c.nombre || path.basename(dir) });
      });
    } catch {
      /* sin rutas extra */
    }
    return out;
  }

  function listar(dir, base = dir, perfil = null) {
    if (!fs.existsSync(dir)) return [];
    // Clasificación del archivo fuente, independiente del personaje de destino.
    try {
      const metadata = JSON.parse(fs.readFileSync(path.join(dir, '_biblioteca.json'), 'utf8'));
      if (['male', 'female'].includes(metadata.perfil)) perfil = metadata.perfil;
    } catch { /* clasificación opcional */ }
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (/^unity$/i.test(e.name)) continue; // los FBX de Unity duplican los GLB
        if (dir === BIBLIO && /^animales$/i.test(e.name)) continue; // esqueletos de animales: los lee la categoría «Animales», no el conversor humanoide
        out.push(...listar(p, base, perfil));
      } else if (/\.(glb|gltf|fbx|bvh)$/i.test(e.name) && !/_rm\.(glb|fbx)$/i.test(e.name)) {
        const st = fs.statSync(p);
        out.push({ ruta: path.relative(base, p).split(path.sep).join('/'), bytes: st.size, mtime: Math.round(st.mtimeMs), ...(perfil ? { perfil } : {}) });
      }
    }
    return out;
  }

  const limpio = (s) => String(s || '').replace(/[<>:"|?*\\/]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'archivo';
  const cuerpo = (req) =>
    new Promise((res, rej) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => res(Buffer.concat(chunks)));
      req.on('error', rej);
    });
  const json = (res, data, code = 200) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };
  const q = (req) => new URL(req.url, 'http://x').searchParams;
  const segura = (p) => SEGURAS.some((s) => path.resolve(p).toLowerCase().startsWith(s));

  // ---------- puente IA ----------
  const pendientes = new Map();
  let nId = 1;

  return {
    name: 'taller-servidor',
    configureServer(server) {
      server.middlewares.use(ecosystemMiddleware(root));
      server.middlewares.use(respaldoMiddleware(path.join(BIBLIO, 'respaldo-navegador')));
      server.ws.on('taller:res', (data) => {
        const p = pendientes.get(data.id);
        if (!p) return;
        pendientes.delete(data.id);
        clearTimeout(p.t);
        p.res(data);
      });
      server.ws.on('taller:hola', () => (server._tallerVivo = Date.now()));
      // Animaciones que llegan a biblioteca/ por otras vías (conversiones por lotes, copias): el Taller las carga solo,
      // sin recargar. Se agrupan los cambios y se avisa como mucho una vez cada 20 s.
      // Lista de la biblioteca en memoria: recorrer 3 GB de carpetas en cada petición era lento.
      // Se rehace al cambiar cualquier cosa dentro de biblioteca/ (vigilancia de abajo) o tras una subida.
      let listaCache = null;
      let vigilada = false;
      const invalidar = () => { listaCache = null; };
      server.middlewares.use((req, _res, next) => {
        if (req.method === 'POST' && /^\/api\/(subir|mixamo|kimodo)/.test(req.url || '')) _res.on('finish', invalidar);
        next();
      });
      try {
        let aviso = 0;
        fs.watch(BIBLIO, { recursive: true }, (_evento, archivo) => {
          invalidar();
          if (!archivo || !/\.(glb|gltf|fbx|bvh)$/i.test(archivo) || /(^|[\\/])(_|\.)/.test(archivo) || /^animales[\\/]/i.test(archivo)) return;
          clearTimeout(aviso);
          aviso = setTimeout(() => server.ws.send({ type: 'custom', event: 'taller:biblioteca', data: { carpeta: 'paquetes', archivo: String(archivo) } }), 20000);
        });
        vigilada = true;
      } catch (error) { console.warn('[taller] sin vigilancia de biblioteca/:', error.message); }

      server.middlewares.use('/api/biblioteca', (req, res) => {
        if (vigilada && listaCache) return json(res, listaCache);
        const archivos = [];
        // Las librerías de rutas.json dentro de biblioteca/ se listan aparte, no mezcladas con «local».
        const rs = raices(), extra = rs.filter((x) => x.id !== 'local').map((x) => path.relative(BIBLIO, x.dir).split(path.sep).join('/') + '/');
        for (const r of rs) for (const a of listar(r.dir)) if (r.id !== 'local' || !extra.some((e) => a.ruta.startsWith(e))) archivos.push({ ...a, raiz: r.id, url: `/bib/${r.id}/${a.ruta.split('/').map(encodeURIComponent).join('/')}` });
        listaCache = { archivos };
        json(res, listaCache);
      });

      // Animales: biblioteca/animales/<especie>/{clips,modelo}. Se listan y sirven aparte (no son humanoides).
      const ANIMALES = path.join(BIBLIO, 'animales');
      server.middlewares.use('/api/animales', (_req, res) => {
        const especies = [];
        if (fs.existsSync(ANIMALES)) {
          for (const e of fs.readdirSync(ANIMALES, { withFileTypes: true })) {
            if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
            const dir = path.join(ANIMALES, e.name);
            const ls = (sub, re) => { const d = path.join(dir, sub); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => re.test(f) && !f.startsWith('_')).sort() : []; };
            let meta = {};
            try { meta = JSON.parse(fs.readFileSync(path.join(dir, '_animal.json'), 'utf8')); } catch { /* ficha opcional */ }
            const fuera = meta.excluir ? new RegExp(meta.excluir, 'i') : null; // p. ej. la pose de referencia del rig (duración 0)
            especies.push({ id: e.name, nombre: meta.nombre || e.name, ...meta, clips: ls('clips', /\.(glb|fbx)$/i).filter((f) => !fuera?.test(f)), modelos: ls('modelo', /\.(glb|fbx)$/i), texturas: ls('modelo', /\.(png|jpe?g)$/i) });
          }
        }
        json(res, { especies });
      });
      server.middlewares.use('/animales/', (req, res) => {
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
        const p = path.resolve(ANIMALES, rel);
        if (!p.startsWith(path.resolve(ANIMALES) + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) return json(res, { error: 'no existe' }, 404);
        const st = fs.statSync(p);
        const etag = `"${st.size}-${Math.round(st.mtimeMs)}"`;
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'no-cache');
        if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }
        res.setHeader('Content-Type', /\.png$/i.test(p) ? 'image/png' : /\.jpe?g$/i.test(p) ? 'image/jpeg' : 'application/octet-stream');
        res.setHeader('Content-Length', st.size);
        fs.createReadStream(p).pipe(res);
      });

      server.middlewares.use('/bib/', (req, res, next) => {
        const [id, ...rest] = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '').split('/');
        const r = raices().find((x) => x.id === id);
        if (!r) return next();
        const p = path.resolve(r.dir, rest.join('/'));
        if (!p.startsWith(path.resolve(r.dir)) || !fs.existsSync(p)) return json(res, { error: 'no existe' }, 404);
        const st = fs.statSync(p);
        // El navegador puede reutilizar lo ya descargado: responde 304 si el archivo no cambió.
        const etag = `"${st.size}-${Math.round(st.mtimeMs)}"`;
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', st.mtime.toUTCString());
        res.setHeader('Cache-Control', 'no-cache');
        if (req.headers['if-none-match'] === etag) {
          res.statusCode = 304;
          return res.end();
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', st.size);
        fs.createReadStream(p).pipe(res);
      });

      server.middlewares.use('/api/subir', async (req, res) => {
        if (req.method !== 'POST') return json(res, { error: 'POST' }, 405);
        const p = q(req);
        const carpeta = limpio(p.get('carpeta') || 'mixamo');
        const nombre = limpio(p.get('nombre'));
        const dir = path.join(BIBLIO, carpeta);
        fs.mkdirSync(dir, { recursive: true });
        const destino = path.join(dir, nombre);
        fs.writeFileSync(destino, await cuerpo(req));
        json(res, { ok: true, ruta: destino });
      });

      server.middlewares.use('/api/guardar', async (req, res) => {
        if (req.method !== 'POST') return json(res, { error: 'POST' }, 405);
        const p = q(req);
        const tipo = p.get('tipo') === 'captura' ? REPORTS : EXPORT;
        const sub = (p.get('carpeta') || '').split(/[\\/]/).filter(Boolean).map(limpio).join(path.sep);
        const dir = path.join(tipo === REPORTS ? path.join(REPORTS, 'capturas') : EXPORT, sub);
        fs.mkdirSync(dir, { recursive: true });
        const destino = path.join(dir, limpio(p.get('nombre')));
        fs.writeFileSync(destino, await cuerpo(req));
        json(res, { ok: true, ruta: destino });
      });

      server.middlewares.use('/api/leer', (req, res) => {
        const p = q(req).get('ruta');
        if (!p || !segura(p) || !fs.existsSync(p)) return json(res, { error: 'ruta no permitida o inexistente' }, 404);
        res.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(p).pipe(res);
      });

      server.middlewares.use('/api/fbx', async (req, res) => {
        if (req.method !== 'POST') return json(res, { error: 'POST' }, 405);
        if (!fs.existsSync(BLENDER)) return json(res, { error: `No encuentro Blender en ${BLENDER} (variable BLENDER)` }, 500);
        const tmp = fs.mkdtempSync(path.join(root, 'tmp-fbx-'));
        const glb = path.join(tmp, 'entrada.glb');
        const fbx = path.join(tmp, 'salida.fbx');
        fs.writeFileSync(glb, await cuerpo(req));
        const py = [
          'import bpy, sys',
          'bpy.ops.wm.read_factory_settings(use_empty=True)',
          `bpy.ops.import_scene.gltf(filepath=r"${glb}")`,
          `bpy.ops.export_scene.fbx(filepath=r"${fbx}", use_selection=False, bake_anim=True, bake_anim_use_all_actions=True, bake_anim_use_nla_strips=False, add_leaf_bones=False, path_mode='COPY', embed_textures=True, axis_forward='-Z', axis_up='Y')`,
        ].join('\n');
        const p = spawn(BLENDER, ['-b', '--factory-startup', '--python-expr', py], { windowsHide: true });
        let log = '';
        p.stdout.on('data', (d) => (log += d));
        p.stderr.on('data', (d) => (log += d));
        p.on('close', (code) => {
          try {
            if (!fs.existsSync(fbx)) return json(res, { error: 'Blender no produjo el FBX', code, log: log.slice(-2000) }, 500);
            const data = fs.readFileSync(fbx);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.end(data);
          } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
          }
        });
      });

      // Descargas de Mixamo (llegan desde la ventana puente, mismo origen que el Taller)
      const mixamo = mixamoApi({ biblio: BIBLIO, avisar: (archivo) => server.ws.send({ type: 'custom', event: 'taller:biblioteca', data: { carpeta: 'mixamo', archivo } }) });
      server.middlewares.use('/api/mixamo/', async (req, res) => {
        const accion = req.url.split('?')[0].replace(/^\//, '');
        // Solo desde páginas del propio Taller: el navegador manda Origin en los POST de otros sitios.
        const origen = req.headers.origin;
        if (origen && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origen)) return json(res, { ok: false, error: 'origen no permitido' }, 403);
        try {
          let b = {};
          if (req.method === 'POST') b = JSON.parse((await cuerpo(req)).toString('utf8') || '{}');
          json(res, await mixamo.manejar(accion, b));
        } catch (e) {
          json(res, { ok: false, error: e.message }, e.code || 500);
        }
      });

      // Kimodo local: texto → movimiento → biblioteca/kimodo (ver kimodo.mjs)
      const kimodo = kimodoApi({ root, biblio: BIBLIO, avisar: (archivo) => server.ws.send({ type: 'custom', event: 'taller:biblioteca', data: { carpeta: 'kimodo', archivo } }) });
      server.httpServer?.on('close', () => kimodo.cerrar());
      process.once('exit', () => kimodo.cerrar());
      server.middlewares.use('/api/kimodo/', async (req, res) => {
        const accion = req.url.split('?')[0].replace(/^\//, '');
        const origen = req.headers.origin;
        if (origen && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origen)) return json(res, { ok: false, error: 'origen no permitido' }, 403);
        try {
          let b = Object.fromEntries(q(req));
          if (req.method === 'POST') b = JSON.parse((await cuerpo(req)).toString('utf8') || '{}');
          json(res, await kimodo.manejar(accion, b));
        } catch (e) {
          json(res, { ok: false, error: e.message }, e.code || 500);
        }
      });

      server.middlewares.use('/api/ia', async (req, res) => {
        let msg;
        if (req.method === 'GET') {
          const p = q(req);
          msg = { cmd: p.get('cmd') || 'ayuda', args: p.get('args') ? JSON.parse(p.get('args')) : {},session:p.get('session')||null };
        } else {
          try {
            msg = JSON.parse((await cuerpo(req)).toString('utf8') || '{}');
          } catch {
            return json(res, { ok: false, error: 'JSON no válido' }, 400);
          }
        }
        const clientes = server.ws.clients?.size ?? 1;
        if (!clientes) return json(res, { ok: false, error: 'La app no está abierta en ningún navegador: abre http://127.0.0.1:5189' }, 503);
        const id = nId++;
        const espera = Math.min(600000, Math.max(5000, (msg.timeout || msg.args?.timeout || 120) * 1000));
        const r = await new Promise((resolve) => {
          const t = setTimeout(() => {
            pendientes.delete(id);
            resolve({ ok: false, error: `Sin respuesta en ${espera / 1000}s (¿la app está abierta?)` });
          }, espera);
          pendientes.set(id, { res: resolve, t });
          server.ws.send({ type: 'custom', event: 'taller:cmd', data: { id, cmd: msg.cmd, args: msg.args || {}, session:msg.session||null } });
        });
        json(res, r, r.ok === false ? 500 : 200);
      });
    },
  };
}

export function tmpDir() {
  return os.tmpdir();
}
