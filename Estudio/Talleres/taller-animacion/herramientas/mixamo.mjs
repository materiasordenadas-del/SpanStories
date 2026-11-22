// Descargas de Mixamo → biblioteca/mixamo (permanentes, verificadas).
//
// El descargador corre en la página de Mixamo (public/mixamo-descargador.js) y habla con
// este servidor a través de la ventana puente (public/mixamo-puente.html), porque la CSP
// de mixamo.com no deja conectar con 127.0.0.1.
//
// Reglas que arreglan los fallos del script original:
//  - Un archivo solo cuenta como descargado cuando ESTE servidor lo ha bajado, comprobado
//    (HTTP 200, tamaño, cabecera FBX binaria, curvas de animación) y escrito en disco.
//  - El progreso vive aquí (biblioteca/mixamo/_mixamo.json) por id de producto, no por
//    página/posición: una interrupción ni salta ni repite animaciones.
//  - Un solo descargador a la vez (sesión con concesión) y un solo trabajo por id.
import fs from 'node:fs';
import path from 'node:path';

const FBX_MAGIA = Buffer.from('Kaydara FBX Binary  \0', 'latin1');
const HOSTS_OK = /(^|\.)(amazonaws\.com|cloudfront\.net|mixamo\.com|adobe\.com|adobe\.io)$/i;
const CONCESION_MS = 90_000;

export function mixamoApi({ biblio, avisar }) {
  const DIR = path.join(biblio, 'mixamo');
  const MANIFIESTO = path.join(DIR, '_mixamo.json');
  fs.mkdirSync(DIR, { recursive: true });

  let sesion = null; // { id, visto }
  const enCurso = new Map(); // idProducto → archivo reservado

  function leer() {
    try {
      const m = JSON.parse(fs.readFileSync(MANIFIESTO, 'utf8'));
      return { version: 1, hechos: m.hechos || {}, fallos: m.fallos || {} };
    } catch {
      return { version: 1, hechos: {}, fallos: {} };
    }
  }
  function escribir(m) {
    const tmp = `${MANIFIESTO}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(m, null, 1));
    fs.renameSync(tmp, MANIFIESTO);
  }
  // Un «hecho» solo vale si su archivo sigue en disco con el mismo tamaño.
  function hechosValidos(m) {
    const out = {};
    for (const [id, h] of Object.entries(m.hechos)) {
      try {
        if (fs.statSync(path.join(DIR, h.archivo)).size === h.bytes) out[id] = h;
      } catch {
        /* borrado a mano: se volverá a descargar */
      }
    }
    return out;
  }
  function nombresUsados() {
    const s = new Set();
    const rec = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) rec(path.join(d, e.name));
        else s.add(e.name.replace(/\.[^.]+$/, '').toLowerCase());
      }
    };
    rec(DIR);
    for (const a of enCurso.values()) s.add(a.toLowerCase());
    return s;
  }
  const limpio = (s) =>
    String(s || '')
      .replace(/[<>:"|?*\\/\x00-\x1f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 90) || 'Mixamo';

  function comprobarSesion(s) {
    const ahora = Date.now();
    if (!s) throw Object.assign(new Error('falta la sesión'), { code: 400 });
    if (sesion && sesion.id !== s && ahora - sesion.visto < CONCESION_MS)
      throw Object.assign(new Error('Ya hay otro descargador de Mixamo en marcha (otra pestaña). Ciérralo o espera 90 s.'), { code: 409 });
    sesion = { id: s, visto: ahora };
  }

  function comprobarFbx(buf) {
    if (buf.length < 4096) return `archivo demasiado pequeño (${buf.length} B)`;
    if (!buf.subarray(0, FBX_MAGIA.length).equals(FBX_MAGIA)) {
      const ini = buf.subarray(0, 200).toString('utf8');
      if (/<\?xml|<Error>|<html/i.test(ini)) return `Mixamo devolvió un error en vez del FBX: ${ini.replace(/\s+/g, ' ').slice(0, 160)}`;
      return 'no es un FBX binario';
    }
    if (buf.indexOf('AnimationCurve', 0, 'latin1') < 0) return 'el FBX no contiene animación';
    return null;
  }

  async function bajar(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      throw new Error('URL de descarga no válida');
    }
    if (u.protocol !== 'https:' || !HOSTS_OK.test(u.hostname)) throw new Error(`origen de descarga no permitido: ${u.hostname}`);
    const r = await fetch(u, { signal: AbortSignal.timeout(180_000), redirect: 'follow' });
    if (r.status !== 200) throw new Error(`la descarga respondió HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const largo = Number(r.headers.get('content-length'));
    if (largo && largo !== buf.length) throw new Error(`descarga incompleta (${buf.length} de ${largo} B)`);
    const mal = comprobarFbx(buf);
    if (mal) throw new Error(mal);
    return buf;
  }

  const acciones = {
    estado() {
      const m = leer();
      const hechos = hechosValidos(m);
      return {
        hechos: Object.fromEntries(Object.entries(hechos).map(([id, h]) => [id, h.archivo])),
        nHechos: Object.keys(hechos).length,
        fallos: Object.entries(m.fallos).filter(([id]) => !hechos[id]).map(([id, f]) => ({ id, ...f })),
        enMarcha: !!(sesion && Date.now() - sesion.visto < CONCESION_MS),
        carpeta: DIR,
      };
    },

    sesion(b) {
      comprobarSesion(b.sesion);
      return { ok: true };
    },

    soltar(b) {
      if (sesion?.id === b.sesion) {
        sesion = null;
        enCurso.clear();
      }
      return { ok: true };
    },

    // Reserva un nombre de archivo único para un producto antes de exportarlo.
    reservar(b) {
      comprobarSesion(b.sesion);
      const id = String(b.id || '');
      if (!/^[0-9a-f-]{20,}$/i.test(id)) throw Object.assign(new Error('id de producto no válido'), { code: 400 });
      const hecho = hechosValidos(leer())[id];
      if (hecho) return { hecho: true, archivo: hecho.archivo };
      if (enCurso.has(id)) return { archivo: enCurso.get(id) }; // mismo id: mismo nombre, nunca dos
      const usados = nombresUsados();
      const base = limpio(b.nombre);
      const candidatos = [base, limpio(`${base} - ${b.descripcion || ''}`)];
      let archivo = candidatos.find((c) => c && !usados.has(c.toLowerCase()));
      for (let n = 2; !archivo; n++) if (!usados.has(`${base} (${n})`.toLowerCase())) archivo = `${base} (${n})`;
      enCurso.set(id, archivo);
      return { archivo };
    },

    // Baja la URL que devolvió Mixamo, la verifica y solo entonces la marca como hecha.
    async guardar(b) {
      comprobarSesion(b.sesion);
      const id = String(b.id || '');
      const archivo = enCurso.get(id);
      if (!archivo) throw Object.assign(new Error('ese producto no estaba reservado'), { code: 409 });
      const buf = await bajar(b.url);
      const destino = path.join(DIR, `${archivo}.fbx`);
      const parcial = `${destino}.part`;
      const fd = fs.openSync(parcial, 'w');
      try {
        fs.writeSync(fd, buf);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      if (fs.statSync(parcial).size !== buf.length) {
        fs.rmSync(parcial, { force: true });
        throw new Error('no se pudo escribir el archivo completo');
      }
      fs.renameSync(parcial, destino);
      const m = leer();
      m.hechos[id] = {
        archivo: `${archivo}.fbx`,
        bytes: buf.length,
        nombre: b.nombre || archivo,
        descripcion: b.descripcion || '',
        paquete: b.paquete || '',
        enElSitio: !!b.enElSitio,
        fps: b.fps || 30,
        fecha: new Date().toISOString(),
      };
      delete m.fallos[id];
      escribir(m);
      enCurso.delete(id);
      avisar?.(`${archivo}.fbx`);
      return { ok: true, archivo: `${archivo}.fbx`, bytes: buf.length };
    },

    fallo(b) {
      comprobarSesion(b.sesion);
      const id = String(b.id || '');
      if (!id) return { ok: true };
      const m = leer();
      const prev = m.fallos[id];
      m.fallos[id] = { nombre: b.nombre || id, error: String(b.error || '').slice(0, 400), intentos: (prev?.intentos || 0) + 1, fecha: new Date().toISOString() };
      escribir(m);
      enCurso.delete(id);
      return { ok: true };
    },
  };

  return {
    async manejar(accion, cuerpo) {
      const f = acciones[accion];
      if (!f) throw Object.assign(new Error(`acción desconocida: ${accion}`), { code: 404 });
      return await f(cuerpo || {});
    },
    _probar: { comprobarFbx, limpio },
  };
}
