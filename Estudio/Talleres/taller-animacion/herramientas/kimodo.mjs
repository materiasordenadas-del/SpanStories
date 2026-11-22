// Kimodo local (texto → movimiento) para el Taller.
// Todo vive en taller-animacion/kimodo (disco D): fuente, compilador portátil, build y modelos.
// El generador se arranca una sola vez en modo --server (el modelo de texto queda en memoria)
// y se le mandan peticiones por stdin. Cada resultado se convierte a GLB (esqueleto SOMA de 30
// huesos) y se guarda en biblioteca/kimodo → librería «Kimodo», que el Taller retargetea al
// personaje (Mixamo u otro) como cualquier clip.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export function kimodoApi({ root, biblio, avisar }) {
  const K = path.join(root, 'kimodo');
  const MODELOS = path.join(K, 'modelos');
  const SALIDAS = path.join(K, 'salidas');
  const DESTINO = path.join(biblio, 'kimodo');
  const INDICE = path.join(DESTINO, '_kimodo.json');
  const MOVIMIENTO = path.join(MODELOS, 'kimodo-soma-rp-v1.1-f32.gguf');
  const TOKENIZER = path.join(MODELOS, 'tokenizer.gguf');
  const FPS = 30;

  const texto = () => {
    // El modelo de texto cuantizado que haya (de más a menos calidad).
    for (const q of ['Q8_0', 'Q6_K', 'Q5_K', 'Q4_K_M', 'Q4_K']) {
      const p = path.join(MODELOS, `Llama-3-Kimodo-${q}.gguf`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  };
  const exe = () =>
    [path.join(K, 'build', 'bin', 'kmd-generate.exe'), path.join(K, 'build', 'kmd-generate.exe')].find((p) => fs.existsSync(p)) || null;
  const exportador = path.join(K, 'fuente', 'scripts', 'export_glb.py');
  const python = () => {
    const r = spawnSync('where', ['python'], { encoding: 'utf8', windowsHide: true });
    return (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find((s) => s && !/WindowsApps/i.test(s)) || null;
  };

  const rel = (p) => path.relative(K, p).split(path.sep).join('/');

  function entorno() {
    const extra = [path.join(K, 'herramientas', 'mingw64', 'bin'), path.join(K, 'build', 'bin'), path.join(K, 'build'), path.join(K, 'build', 'ggml', 'src'), path.join(K, 'build', 'ggml', 'bin')];
    const tmp = path.join(K, 'tmp');
    fs.mkdirSync(tmp, { recursive: true });
    return { ...process.env, PATH: extra.join(';') + ';' + process.env.PATH, KIMODO_BACKEND: process.env.KIMODO_BACKEND || 'cpu', TEMP: tmp, TMP: tmp };
  }

  function faltan() {
    const f = [];
    if (!exe()) f.push('kmd-generate.exe (compilar en kimodo/build)');
    if (!fs.existsSync(MOVIMIENTO)) f.push('modelos/kimodo-soma-rp-v1.1-f32.gguf');
    if (!fs.existsSync(TOKENIZER)) f.push('modelos/tokenizer.gguf');
    if (!texto()) f.push('modelos/Llama-3-Kimodo-Q4_K.gguf');
    if (!fs.existsSync(exportador)) f.push('fuente/scripts/export_glb.py');
    if (!python()) f.push('python (para escribir el GLB)');
    return f;
  }

  // ---------- proceso servidor ----------
  let proc = null;
  let cargado = false;
  let log = [];
  let espera = null; // { resolve, reject } de la petición en curso
  const apunta = (s) => {
    for (const l of String(s).split(/\r?\n/)) if (l.trim()) log.push(l.trim());
    if (log.length > 200) log = log.slice(-200);
  };

  function arrancar() {
    if (proc) return;
    const t = texto();
    cargado = false;
    // Rutas relativas a kimodo/: el .exe no acepta tildes («Español») en argumentos.
    proc = spawn(exe(), ['--server', rel(MOVIMIENTO), rel(t)], { cwd: K, env: entorno(), windowsHide: true });
    apunta(`arrancando Kimodo con ${path.basename(t)}…`);
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        const p = espera;
        if (/^OK\t/.test(line)) {
          espera = null;
          const [, frames, joints] = line.split('\t');
          p?.resolve({ frames: +frames, joints: +joints });
        } else if (/^ERR\t/.test(line)) {
          espera = null;
          p?.reject(new Error(line.slice(4)));
        } else apunta(line);
      }
    });
    proc.stderr.on('data', (d) => apunta(d));
    proc.on('close', (code) => {
      apunta(`Kimodo se cerró (código ${code})`);
      proc = null;
      cargado = false;
      if (espera) {
        espera.reject(new Error(`Kimodo se cerró (código ${code}). ${log.slice(-3).join(' · ')}`));
        espera = null;
      }
    });
    proc.on('error', (e) => {
      apunta(`no se pudo arrancar: ${e.message}`);
      proc = null;
      if (espera) {
        espera.reject(new Error(`No se pudo arrancar Kimodo: ${e.message}`));
        espera = null;
      }
    });
    proc.stdin.on('error', () => {}); // si el proceso muere, el error llega por 'close'
  }

  // Libera la RAM (~5,5 GB) tras un rato sin generar; se vuelve a cargar con la siguiente.
  const LIBERAR_MS = 10 * 60 * 1000;
  let temporizador = null;
  function programarLiberar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (proc && !ocupado && !cola.length) {
        apunta('liberando memoria tras 10 min sin uso');
        proc.kill();
      }
    }, LIBERAR_MS);
    temporizador.unref?.();
  }

  function pedir(linea) {
    clearTimeout(temporizador);
    arrancar();
    return new Promise((resolve, reject) => {
      if (!proc) return reject(new Error(`No se pudo arrancar Kimodo. ${log.slice(-2).join(' · ')}`));
      espera = { resolve, reject };
      proc.stdin.write(linea + '\n');
    });
  }

  // ---------- cola de trabajos ----------
  const trabajos = new Map();
  const cola = [];
  let ocupado = false;
  let nId = 1;

  const slugDe = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const limpio = (s) => String(s || '').normalize('NFC').replace(/[<>:"|?*\\/\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

  function indice() {
    try {
      return JSON.parse(fs.readFileSync(INDICE, 'utf8'));
    } catch {
      return { formato: 'taller-animacion/kimodo@1', animaciones: [] };
    }
  }

  async function procesar() {
    if (ocupado) return;
    const job = cola.shift();
    if (!job) return;
    ocupado = true;
    const t0 = Date.now();
    try {
      job.estado = cargado ? 'generando' : 'cargando';
      const dir = path.join(SALIDAS, String(job.id));
      fs.mkdirSync(dir, { recursive: true });
      const campos = [job.transicion, job.pasos, job.semilla, rel(dir)];
      job.segmentos.forEach((s, i) => {
        const f = path.join(dir, `texto-${i}.txt`);
        fs.writeFileSync(f, s.texto, 'utf8');
        campos.push(Math.max(2, Math.round(s.segundos * FPS)), rel(f));
      });
      const r = await pedir(campos.join('\t'));
      cargado = true;
      job.estado = 'guardando';
      fs.mkdirSync(DESTINO, { recursive: true });
      // Único por id de clip (el Taller usa slug(nombre)), no solo por nombre de archivo.
      const usados = new Set(fs.readdirSync(DESTINO).filter((f) => /\.glb$/i.test(f)).map((f) => slugDe(f.replace(/\.glb$/i, ''))));
      let nombre = job.nombre;
      for (let n = 2; usados.has(slugDe(nombre)); n++) nombre = `${job.nombre} ${n}`;
      const glb = path.join(DESTINO, `${nombre}.glb`);
      const py = spawnSync(python(), ['-I', '-B', exportador, '--motion-dir', dir, '--output', glb, '--fps', String(FPS)], { encoding: 'utf8', windowsHide: true, env: entorno() });
      if (py.status !== 0 || !fs.existsSync(glb)) throw new Error(`export_glb.py falló: ${(py.stderr || py.stdout || '').slice(-500)}`);
      fs.rmSync(dir, { recursive: true, force: true });
      const idx = indice();
      idx.animaciones.push({ archivo: `${nombre}.glb`, segmentos: job.segmentos, pasos: job.pasos, semilla: job.semilla, fotogramas: r.frames, huesos: r.joints, fecha: new Date().toISOString(), segundos_calculo: Math.round((Date.now() - t0) / 1000) });
      fs.writeFileSync(INDICE, JSON.stringify(idx, null, 2));
      Object.assign(job, { estado: 'listo', archivo: `${nombre}.glb`, fotogramas: r.frames, segundos_calculo: Math.round((Date.now() - t0) / 1000) });
      avisar?.(`${nombre}.glb`);
    } catch (e) {
      Object.assign(job, { estado: 'error', error: e.message });
    } finally {
      ocupado = false;
      if (!cola.length) programarLiberar();
      procesar();
    }
  }

  return {
    cerrar() {
      try {
        proc?.kill();
      } catch {}
    },
    async manejar(accion, b) {
      if (accion === 'estado') {
        const f = faltan();
        return { ok: true, listo: !f.length, faltan: f, texto: texto() && path.basename(texto()), cargado, activo: !!proc, ocupado, cola: cola.length, log: log.slice(-12) };
      }
      if (accion === 'trabajo') {
        const j = trabajos.get(+b.id);
        if (!j) return { ok: false, error: 'trabajo desconocido' };
        const { segmentos, ...rest } = j;
        return { ok: true, ...rest, posicion: cola.indexOf(j) + 1, log: log.slice(-4) };
      }
      if (accion === 'precargar') {
        if (faltan().length) return { ok: false, error: `Falta: ${faltan().join(', ')}` };
        arrancar();
        programarLiberar();
        return { ok: true };
      }
      if (accion === 'parar') {
        if (ocupado) return { ok: false, error: 'Está generando; espera a que acabe' };
        proc?.kill();
        return { ok: true };
      }
      if (accion === 'generar') {
        const f = faltan();
        if (f.length) return { ok: false, error: `Kimodo no está listo. Falta: ${f.join(', ')}` };
        let segmentos = Array.isArray(b.segmentos) ? b.segmentos : [{ texto: b.texto, segundos: b.segundos }];
        segmentos = segmentos
          .map((s) => ({ texto: String(s.texto || '').trim().slice(0, 500), segundos: Math.min(10, Math.max(1, +s.segundos || 4)) }))
          .filter((s) => s.texto);
        if (!segmentos.length) return { ok: false, error: 'Escribe qué debe hacer el personaje' };
        if (segmentos.length > 6) return { ok: false, error: 'Como mucho 6 tramos' };
        const job = {
          id: nId++,
          estado: 'cola',
          segmentos,
          pasos: Math.min(100, Math.max(10, Math.round(+b.pasos || 50))),
          semilla: Number.isFinite(+b.semilla) && b.semilla !== '' && b.semilla != null ? Math.abs(Math.round(+b.semilla)) : Math.floor(Math.random() * 1e6),
          transicion: Math.min(30, Math.max(0, Math.round(+b.transicion || 10))),
          nombre: limpio(b.nombre) || limpio(segmentos.map((s) => s.texto).join(' + ')).slice(0, 48).trim() || 'kimodo',
          creado: Date.now(),
        };
        trabajos.set(job.id, job);
        cola.push(job);
        procesar();
        return { ok: true, id: job.id, semilla: job.semilla, nombre: job.nombre };
      }
      if (accion === 'lista') {
        // Solo las que siguen en disco.
        const idx = indice();
        idx.animaciones = idx.animaciones.filter((a) => fs.existsSync(path.join(DESTINO, a.archivo)));
        return { ok: true, ...idx };
      }
      // Borrador (biblioteca/kimodo) → guardada (biblioteca/kimodo/guardadas, librería «Kimodo guardadas»).
      if (accion === 'guardar') {
        const archivo = path.basename(String(b.archivo || ''));
        const origen = path.join(DESTINO, archivo);
        if (!/\.glb$/i.test(archivo) || !fs.existsSync(origen)) return { ok: false, error: `No existe el borrador «${archivo}»` };
        const dir = path.join(DESTINO, 'guardadas');
        fs.mkdirSync(dir, { recursive: true });
        const base = limpio(b.nombre) || archivo.replace(/\.glb$/i, '');
        const usados = new Set(fs.readdirSync(dir).filter((f) => /\.glb$/i.test(f)).map((f) => slugDe(f.replace(/\.glb$/i, ''))));
        let nombre = base;
        for (let n = 2; usados.has(slugDe(nombre)); n++) nombre = `${base} ${n}`;
        fs.renameSync(origen, path.join(dir, `${nombre}.glb`));
        const idx = indice();
        const e = idx.animaciones.find((a) => a.archivo === archivo);
        if (e) Object.assign(e, { archivo: `guardadas/${nombre}.glb`, guardada: true, guardada_fecha: new Date().toISOString() });
        fs.writeFileSync(INDICE, JSON.stringify(idx, null, 2));
        avisar?.(`guardadas/${nombre}.glb`);
        return { ok: true, archivo: `guardadas/${nombre}.glb`, nombre };
      }
      // Borra un borrador (o una guardada si se pide explícitamente).
      if (accion === 'descartar') {
        const rel = String(b.archivo || '').replace(/\\/g, '/');
        if (!/^(guardadas\/)?[^/]+\.glb$/i.test(rel) || rel.includes('..')) return { ok: false, error: 'archivo no válido' };
        if (rel.startsWith('guardadas/') && !b.guardada) return { ok: false, error: 'Es una guardada: confirma con guardada: true' };
        const p = path.join(DESTINO, rel);
        if (fs.existsSync(p)) fs.rmSync(p);
        const idx = indice();
        idx.animaciones = idx.animaciones.filter((a) => a.archivo !== rel);
        fs.writeFileSync(INDICE, JSON.stringify(idx, null, 2));
        return { ok: true, archivo: rel };
      }
      // Borra todos los borradores (nunca las guardadas).
      if (accion === 'limpiar') {
        const idx = indice();
        const borrados = [];
        for (const f of fs.existsSync(DESTINO) ? fs.readdirSync(DESTINO) : []) {
          if (!/\.glb$/i.test(f)) continue;
          fs.rmSync(path.join(DESTINO, f));
          borrados.push(f);
        }
        idx.animaciones = idx.animaciones.filter((a) => a.archivo.startsWith('guardadas/'));
        fs.writeFileSync(INDICE, JSON.stringify(idx, null, 2));
        return { ok: true, borrados };
      }
      const e = new Error('acción desconocida');
      e.code = 404;
      throw e;
    },
  };
}
