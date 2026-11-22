// Descargador de Mixamo del Taller de Animación.
// Se ejecuta DENTRO de mixamo.com (lo inyecta el marcador / la consola a través de la
// ventana puente). Basado en el script de Jake Cattrall (gist krazyjakee/1e3592856dd636b8043cc359ad9d66fc),
// reescrito para no depender de la interfaz:
//  · usa la API de Mixamo por id de producto (sin selectores CSS ni clics simulados);
//  · comprueba que Mixamo devuelve el trabajo pedido (job_uuid + nombre de archivo);
//  · solo cuenta una animación cuando el Taller la ha bajado, verificado y guardado;
//  · el progreso está en el Taller, por id: al reanudar no salta ni repite nada;
//  · un único bucle (y una única sesión en el servidor): no hay descargas duplicadas.
// El token de Mixamo nunca sale de esta página: el Taller solo recibe la URL firmada del FBX.
(() => {
  'use strict';
  const TALLER = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(window.__tallerOrigen || '') ? window.__tallerOrigen : 'http://127.0.0.1:5189';
  const API = 'https://www.mixamo.com/api/v1';

  if (window.__tallerMixamo) {
    window.__tallerMixamo.conectar(window.__tallerPuente);
    return;
  }

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const fatal = (msg) => Object.assign(new Error(msg), { fatal: true });
  const normal = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  const st = {
    fase: 'listo', // listo | catalogo | descargando | pausado | terminado | error
    mensaje: '',
    total: 0,
    hechas: 0,
    nuevas: 0,
    fallos: [],
    actual: null,
    corriendo: false,
    pausar: false,
  };
  const sesion = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let puente = window.__tallerPuente || null;
  let catalogo = null; // [{id, nombre, descripcion, paquete}]

  // ---------- puente con el Taller ----------
  const pend = new Map();
  let nPet = 1;
  addEventListener('message', (e) => {
    if (e.origin !== TALLER || !puente || e.source !== puente) return;
    const d = e.data || {};
    if (d.tipo === 'resp') {
      const p = pend.get(d.id);
      if (!p) return;
      pend.delete(d.id);
      clearTimeout(p.t);
      if (d.ok) p.res(d.data);
      else p.rej(Object.assign(new Error(d.data?.error || `El Taller respondió ${d.status}`), { status: d.status, fatal: d.status === 409 }));
    } else if (d.tipo === 'orden') orden(d);
  });
  function taller(accion, cuerpo, ms = 240000) {
    if (!puente || puente.closed) return Promise.reject(fatal('La ventana del Taller está cerrada: vuelve a pulsar el marcador.'));
    return new Promise((res, rej) => {
      const id = nPet++;
      const t = setTimeout(() => {
        pend.delete(id);
        rej(new Error('El Taller no responde (¿está abierto npm run dev?)'));
      }, ms);
      pend.set(id, { res, rej, t });
      puente.postMessage({ tipo: 'pedir', id, accion, cuerpo: { ...cuerpo, sesion } }, TALLER);
    });
  }
  function informar() {
    if (puente && !puente.closed) puente.postMessage({ tipo: 'estado', estado: { ...st, fallos: st.fallos.slice(-50) } }, TALLER);
  }
  function log(texto, nivel = 'info') {
    console[nivel === 'error' ? 'error' : 'info']('[Taller ← Mixamo]', texto);
    if (puente && !puente.closed) puente.postMessage({ tipo: 'log', texto, nivel }, TALLER);
  }

  // ---------- API de Mixamo ----------
  function cabeceras() {
    const t = localStorage.getItem('access_token');
    if (!t) throw fatal('No has iniciado sesión en Mixamo.');
    return { Authorization: `Bearer ${t}`, 'X-Api-Key': 'mixamo2', 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json', Accept: 'application/json' };
  }
  async function mx(ruta, { metodo = 'GET', cuerpo, aceptar = [200, 202] } = {}) {
    for (let i = 0; ; i++) {
      let r;
      try {
        r = await fetch(API + ruta, { method: metodo, headers: cabeceras(), body: cuerpo ? JSON.stringify(cuerpo) : undefined, cache: 'no-store' });
      } catch (e) {
        if (i < 4) {
          await espera(2000 * 2 ** i);
          continue;
        }
        throw new Error(`Sin conexión con Mixamo (${e.message})`);
      }
      if (r.status === 401 || r.status === 403) throw fatal('La sesión de Mixamo caducó: recarga mixamo.com, entra y vuelve a pulsar el marcador.');
      if ((r.status === 429 || r.status >= 500) && i < 5) {
        await espera(4000 * 2 ** i);
        continue;
      }
      const json = await r.json().catch(() => null);
      if (!aceptar.includes(r.status)) {
        const e = new Error(`Mixamo ${ruta.split('?')[0]} → HTTP ${r.status}${json?.message ? ` (${json.message})` : ''}`);
        e.status = r.status;
        throw e;
      }
      return { status: r.status, json };
    }
  }

  async function leerCatalogo() {
    st.fase = 'catalogo';
    st.mensaje = 'Leyendo el catálogo de Mixamo…';
    informar();
    const lista = [];
    const ids = new Set();
    const pagina = async (tipo, n) => {
      const { json } = await mx(`/products?page=${n}&limit=96&order=&type=${tipo}&query=`, { aceptar: [200] });
      if (!json || !Array.isArray(json.results) || !json.pagination) throw fatal('La API del catálogo de Mixamo cambió (sin results/pagination).');
      return json;
    };
    // 1) animaciones sueltas
    for (let n = 1, paginas = 1; n <= paginas; n++) {
      const j = await pagina('Motion', n);
      paginas = j.pagination.num_pages;
      for (const p of j.results) {
        if (p.type !== 'Motion' || !p.id || ids.has(p.id)) continue;
        ids.add(p.id);
        lista.push({ id: p.id, nombre: p.name, descripcion: p.description || '', paquete: '' });
      }
      st.mensaje = `Catálogo: página ${n} de ${paginas} · ${lista.length} animaciones`;
      informar();
      if (st.pausar) throw Object.assign(new Error('pausa'), { pausa: true });
    }
    // 2) paquetes: solo las animaciones que no existen sueltas (sin duplicar)
    for (let n = 1, paginas = 1; n <= paginas; n++) {
      const j = await pagina('MotionPack', n);
      paginas = j.pagination.num_pages;
      for (const pk of j.results) {
        for (const m of pk.motions || []) {
          if (!m.product_id || ids.has(m.product_id)) continue;
          ids.add(m.product_id);
          lista.push({ id: m.product_id, nombre: m.name || pk.name, descripcion: m.description || '', paquete: pk.name });
        }
      }
    }
    return lista;
  }

  let personaje = null;
  async function idPersonaje() {
    if (personaje) return personaje;
    const { json } = await mx('/characters/primary', { aceptar: [200] });
    if (!json?.primary_character_id) throw fatal('Mixamo no tiene personaje principal: elige uno en mixamo.com.');
    personaje = json.primary_character_id;
    log(`Personaje de exportación: ${json.primary_character_name || personaje}`);
    return personaje;
  }

  // Exporta un producto y devuelve la URL firmada SOLO si es el trabajo que se pidió.
  async function exportar(item, archivo, op) {
    const ch = await idPersonaje();
    const { json: det } = await mx(`/products/${item.id}?similar=0&character_id=${ch}`, { aceptar: [200] });
    if (!det || det.id !== item.id) throw new Error('Mixamo devolvió otro producto al pedir los detalles.');
    const g = det.details?.gms_hash;
    if (!g || g['model-id'] == null || !Array.isArray(g.params)) throw new Error('Este producto no tiene gms_hash exportable.');
    const enElSitio = !!(op.enElSitio && det.details.supports_inplace);
    const gms = { ...g, inplace: enElSitio, params: g.params.map((p) => p[1]).join(',') };
    const { json: ex } = await mx('/animations/export', {
      metodo: 'POST',
      cuerpo: { character_id: ch, gms_hash: [gms], preferences: { format: 'fbx7', skin: String(!!op.conPiel), fps: String(op.fps), reducekf: '0' }, product_name: archivo, type: 'Motion' },
    });
    const trabajo = ex?.job_uuid;
    const inicio = Date.now();
    while (Date.now() - inicio < 240000) {
      await espera(1200);
      const { status, json: m } = await mx(`/characters/${ch}/monitor`, { aceptar: [200, 202, 404] });
      if (status === 404) continue;
      if (trabajo && m?.job_uuid && m.job_uuid !== trabajo) {
        // otro trabajo (p. ej. un clic en la web de Mixamo a la vez): este ya no es fiable
        throw new Error('Mixamo está exportando otra cosa a la vez (¿usas la web de Mixamo en paralelo?).');
      }
      if (m?.status === 'processing') continue;
      if (m?.status === 'failed') throw new Error(`Mixamo no pudo exportar: ${m.message || 'fallo'}`);
      if (m?.status === 'completed') {
        if (!m.job_result) throw new Error('Mixamo terminó sin URL de descarga.');
        // el nombre de la descarga lleva el product_name que pedimos
        const disp = decodeURIComponent(new URL(m.job_result).searchParams.get('response-content-disposition') || '');
        const fn = (disp.match(/filename="?([^";]+)/) || [])[1];
        if (fn && normal(fn.replace(/\.fbx$/i, '')) !== normal(archivo)) throw new Error(`Mixamo devolvió «${fn}» en vez de «${archivo}.fbx».`);
        if (!trabajo && !fn) throw new Error('No se puede comprobar que la descarga sea la pedida.');
        return { url: m.job_result, enElSitio };
      }
    }
    throw new Error('Mixamo tardó más de 4 minutos en exportar.');
  }

  async function procesar(item, op) {
    const r = await taller('reservar', { id: item.id, nombre: item.nombre, descripcion: item.descripcion });
    if (r.hecho) return 'ya';
    let ultimo;
    for (let intento = 1; intento <= op.reintentos + 1; intento++) {
      if (st.pausar) throw Object.assign(new Error('pausa'), { pausa: true });
      try {
        const { url, enElSitio } = await exportar(item, r.archivo, op);
        const g = await taller('guardar', { id: item.id, url, nombre: item.nombre, descripcion: item.descripcion, paquete: item.paquete, enElSitio, fps: op.fps });
        log(`✓ ${g.archivo} (${Math.round(g.bytes / 1024)} KB)`);
        return 'nueva';
      } catch (e) {
        if (e.fatal) throw e;
        ultimo = e;
        log(`Intento ${intento} de «${item.nombre}»: ${e.message}`, 'warn');
        await espera(3500 * intento);
      }
    }
    await taller('fallo', { id: item.id, nombre: item.nombre, error: ultimo?.message }).catch(() => {});
    st.fallos.push({ id: item.id, nombre: item.nombre, error: ultimo?.message });
    log(`✗ ${item.nombre}: ${ultimo?.message}`, 'error');
    return 'fallo';
  }

  async function iniciar(op) {
    if (st.corriendo) return log('Ya está en marcha.'); // un solo bucle: nunca dos descargas a la vez
    st.corriendo = true;
    st.pausar = false;
    st.fallos = [];
    st.nuevas = 0;
    try {
      cabeceras();
      await taller('sesion', {});
      catalogo ||= await leerCatalogo();
      const est = await taller('estado', {});
      const hechos = new Set(Object.keys(est.hechos || {}));
      let cola = catalogo.filter((x) => !hechos.has(x.id));
      if (op.soloFallos) {
        const f = new Set((est.fallos || []).map((x) => x.id));
        cola = cola.filter((x) => f.has(x.id));
      }
      if (op.maximo > 0) cola = cola.slice(0, op.maximo);
      st.total = catalogo.length;
      st.hechas = catalogo.length - catalogo.filter((x) => !hechos.has(x.id)).length;
      st.fase = 'descargando';
      log(`Catálogo: ${catalogo.length} · ya en el Taller: ${st.hechas} · en esta tanda: ${cola.length}`);
      for (const item of cola) {
        if (st.pausar) break;
        st.actual = item.nombre;
        st.mensaje = `Descargando «${item.nombre}»${item.paquete ? ` (${item.paquete})` : ''}`;
        informar();
        const r = await procesar(item, op);
        if (r === 'nueva') {
          st.nuevas++;
          st.hechas++;
        } else if (r === 'ya') st.hechas++;
        informar();
        await espera(op.pausaMs);
      }
      st.actual = null;
      st.fase = st.pausar ? 'pausado' : 'terminado';
      st.mensaje = st.pausar ? 'En pausa. El progreso está guardado en el Taller.' : `Tanda terminada: ${st.nuevas} nuevas, ${st.fallos.length} con error.`;
    } catch (e) {
      st.actual = null;
      if (e.pausa) {
        st.fase = 'pausado';
        st.mensaje = 'En pausa. El progreso está guardado en el Taller.';
      } else {
        st.fase = 'error';
        st.mensaje = e.message;
        log(e.message, 'error');
      }
    } finally {
      st.corriendo = false;
      st.pausar = false;
      await taller('soltar', {}, 10000).catch(() => {});
      informar();
    }
  }

  function orden(d) {
    if (d.orden === 'iniciar') {
      const o = d.opciones || {};
      iniciar({
        enElSitio: !!o.enElSitio,
        conPiel: !!o.conPiel,
        fps: [24, 30, 60].includes(+o.fps) ? +o.fps : 30,
        maximo: Math.max(0, +o.maximo || 0),
        soloFallos: !!o.soloFallos,
        reintentos: 2,
        pausaMs: 1500,
      });
    } else if (d.orden === 'pausar') {
      if (st.corriendo) {
        st.pausar = true;
        st.mensaje = 'Pausando al acabar la animación actual…';
      }
      informar();
    } else if (d.orden === 'estado') informar();
  }

  window.__tallerMixamo = {
    conectar(w) {
      if (w) puente = w;
      log('Conectado con el Taller.');
      informar();
    },
    estado: () => ({ ...st }),
    pausar: () => orden({ orden: 'pausar' }),
  };
  log('Descargador listo en mixamo.com.');
  informar();
})();
