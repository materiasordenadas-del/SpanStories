/* Cambiador de estaciones y climas del visor de mundos.
   Capa independiente sobre la escena: no toca Luz25D, la cámara ni el panel.
   - La estación gradúa el color del lienzo (filtro CSS) y añade un velo suave.
   - El clima dibuja partículas 2D planas (lluvia, nieve, hojas, pétalos), niebla
     y rayos en un lienzo superpuesto sin eventos de puntero (ESTILO.md: fondo y
     efectos lejanos van en 2D plano).
   - Lluvia, tormenta, nieve, niebla y nublado piden el ambiente «Nublado» de día
     a través de la API existente y lo devuelven al volver a «Despejado». */

export const ESTACIONES = Object.freeze({
  primavera: { nombre: 'Primavera', icono: '🌸', filtro: { saturar: 1.1, brillo: 1.03, sepia: 0, tono: -4, contraste: 1 }, velo: { color: '#ffd6ea', opacidad: 0.08 }, particulas: { tipo: 'petalos', densidad: 0.35 } },
  verano: { nombre: 'Verano', icono: '☀️', filtro: { saturar: 1.18, brillo: 1.05, sepia: 0.08, tono: 0, contraste: 1.03 }, velo: { color: '#ffd98a', opacidad: 0.08 }, particulas: null },
  otono: { nombre: 'Otoño', icono: '🍂', filtro: { saturar: 1.05, brillo: 0.98, sepia: 0.28, tono: -14, contraste: 1.02 }, velo: { color: '#e38a45', opacidad: 0.1 }, particulas: { tipo: 'hojas', densidad: 0.5 } },
  invierno: { nombre: 'Invierno', icono: '❄️', filtro: { saturar: 0.72, brillo: 1.05, sepia: 0, tono: 8, contraste: 0.96 }, velo: { color: '#cfe3ff', opacidad: 0.14 }, particulas: null },
});

export const CLIMAS = Object.freeze({
  despejado: { nombre: 'Despejado', icono: '🌤️' },
  nublado: { nombre: 'Nublado', icono: '☁️', ambiente: 'nublado', filtro: { saturar: 0.9, brillo: 0.97 }, velo: { color: '#9aa7b3', opacidad: 0.12 } },
  lluvia: { nombre: 'Lluvia', icono: '🌧️', ambiente: 'nublado', filtro: { saturar: 0.85, brillo: 0.92 }, velo: { color: '#6f8191', opacidad: 0.18 }, particulas: { tipo: 'lluvia', densidad: 1 }, viento: 0.15 },
  tormenta: { nombre: 'Tormenta', icono: '⛈️', ambiente: 'nublado', filtro: { saturar: 0.75, brillo: 0.82 }, velo: { color: '#3f4a5c', opacidad: 0.3 }, particulas: { tipo: 'lluvia', densidad: 1.8 }, viento: 0.4, rayos: true },
  nieve: { nombre: 'Nieve', icono: '🌨️', ambiente: 'nublado', filtro: { saturar: 0.8, brillo: 1.04 }, velo: { color: '#e8f0fa', opacidad: 0.18 }, particulas: { tipo: 'nieve', densidad: 1 }, viento: 0.1 },
  niebla: { nombre: 'Niebla', icono: '🌫️', ambiente: 'nublado', filtro: { saturar: 0.8, brillo: 1.02, contraste: 0.9 }, velo: { color: '#dfe4e8', opacidad: 0.1 }, niebla: 0.6 },
  viento: { nombre: 'Viento', icono: '🍃', particulas: { tipo: 'hojas', densidad: 0.9 }, viento: 1 },
});

/** Partículas por cada 1280×720 px CSS con densidad 1, y tope absoluto. */
export const PARTICULAS = Object.freeze({
  lluvia: { base: 380, tope: 900 },
  nieve: { base: 220, tope: 520 },
  hojas: { base: 36, tope: 90 },
  petalos: { base: 44, tope: 110 },
});
const AREA_REFERENCIA = 1280 * 720;
const AMBIENTES_DIA = new Set(['manana', 'mediodia', 'tarde']);
const AMBIENTE_CLIMA = 'nublado';

export const valorPorDefecto = Object.freeze({ estacion: 'primavera', clima: 'despejado' });

export function normalizar({ estacion, clima } = {}) {
  return {
    estacion: ESTACIONES[estacion] ? estacion : valorPorDefecto.estacion,
    clima: CLIMAS[clima] ? clima : valorPorDefecto.clima,
  };
}

/** Combina estación y clima en una descripción pura del efecto. */
export function combinarAmbiente(estacion, clima) {
  const E = ESTACIONES[estacion] || ESTACIONES[valorPorDefecto.estacion];
  const C = CLIMAS[clima] || CLIMAS[valorPorDefecto.clima];
  const f = { ...E.filtro };
  for (const [k, v] of Object.entries(C.filtro || {})) f[k] = (f[k] ?? (k === 'sepia' || k === 'tono' ? 0 : 1)) * v;
  const filtro = `saturate(${f.saturar.toFixed(3)}) brightness(${f.brillo.toFixed(3)}) contrast(${f.contraste.toFixed(3)}) sepia(${f.sepia.toFixed(3)}) hue-rotate(${f.tono.toFixed(1)}deg)`;
  const particulas = [];
  if (C.particulas) {
    // El viento arrastra hojas; en primavera, pétalos, y en invierno, nieve.
    const sustituto = clima === 'viento' ? { primavera: 'petalos', invierno: 'nieve' }[estacion] : null;
    particulas.push({ ...C.particulas, tipo: sustituto || C.particulas.tipo });
  }
  // Las hojas y pétalos de la estación se mantienen salvo con lluvia o nieve.
  if (E.particulas && !particulas.some(p => p.tipo === 'lluvia' || p.tipo === 'nieve')) {
    const mismo = particulas.find(p => p.tipo === E.particulas.tipo);
    if (mismo) mismo.densidad += E.particulas.densidad; else particulas.push({ ...E.particulas });
  }
  return {
    filtro, particulas,
    veloEstacion: E.velo, veloClima: C.velo || null,
    niebla: C.niebla || 0, rayos: !!C.rayos, viento: C.viento || 0,
    ambiente: C.ambiente || null,
  };
}

export function cantidadParticulas(tipo, densidad, ancho, alto, reducido = false) {
  const p = PARTICULAS[tipo]; if (!p) return 0;
  const n = Math.round(p.base * densidad * (ancho * alto) / AREA_REFERENCIA * (reducido ? 0.35 : 1));
  return Math.max(0, Math.min(p.tope, n));
}

const COLORES = {
  hojas: ['#c8642b', '#e09a3a', '#a8452a', '#d9b04a', '#b8582f'],
  petalos: ['#f7c6d9', '#fbe0ea', '#f2a7c3', '#ffffff'],
};

/** Sistema de partículas puro: sin DOM, con azar inyectable para las pruebas. */
export class SistemaParticulas {
  constructor({ azar = Math.random } = {}) { this.azar = azar; this.grupos = []; this.ancho = 1; this.alto = 1; this.viento = 0; }
  configurar(particulas, ancho, alto, { viento = 0, reducido = false } = {}) {
    this.ancho = ancho; this.alto = alto; this.viento = viento;
    const previos = new Map(this.grupos.map(g => [g.tipo, g]));
    this.grupos = particulas.map(({ tipo, densidad }) => {
      const n = cantidadParticulas(tipo, densidad, ancho, alto, reducido);
      const g = previos.get(tipo) || { tipo, items: [] };
      while (g.items.length < n) g.items.push(this.nueva(tipo, true));
      g.items.length = n;
      return g;
    });
  }
  nueva(tipo, enCualquierAltura = false) {
    const r = this.azar, W = this.ancho, H = this.alto;
    const y = enCualquierAltura ? r() * H : -20 - r() * 40;
    const x = r() * (W + 200) - 100;
    if (tipo === 'lluvia') return { x, y, vy: 900 + r() * 500, largo: 12 + r() * 14, alfa: 0.35 + r() * 0.35 };
    if (tipo === 'nieve') return { x, y, vy: 40 + r() * 60, radio: 1.2 + r() * 2.4, fase: r() * 6.283, alfa: 0.7 + r() * 0.3 };
    return { x, y, vy: 35 + r() * 55, tam: 4 + r() * 5, giro: r() * 6.283, vGiro: (r() - 0.5) * 4, fase: r() * 6.283, color: COLORES[tipo][Math.floor(r() * COLORES[tipo].length)] };
  }
  update(dt, t) {
    const W = this.ancho, H = this.alto, v = this.viento;
    for (const g of this.grupos) for (let i = 0; i < g.items.length; i++) {
      const p = g.items[i];
      if (g.tipo === 'lluvia') { p.y += p.vy * dt; p.x += p.vy * (0.08 + v * 0.35) * dt; }
      else if (g.tipo === 'nieve') { p.y += p.vy * dt; p.x += (Math.sin(t * 1.3 + p.fase) * 18 + v * 120) * dt; }
      else { p.y += p.vy * dt; p.x += (Math.sin(t * 0.9 + p.fase) * 30 + v * 220) * dt; p.giro += p.vGiro * dt; }
      if (p.y > H + 30 || p.x > W + 120 || p.x < -140) g.items[i] = this.nueva(g.tipo);
    }
  }
  get total() { return this.grupos.reduce((n, g) => n + g.items.length, 0); }
}

/** Intensidad de un rayo (0..1) en función del tiempo desde que empezó: dos destellos. */
export function destelloRayo(s) {
  if (s < 0 || s > 0.45) return 0;
  return Math.max(Math.exp(-((s - 0.04) ** 2) / 0.0008), 0.75 * Math.exp(-((s - 0.2) ** 2) / 0.0015));
}

const CLAVE = 'spanstories.ciudades.estaciones.v1';
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { return {}; } };
const guardar = v => { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

/** Monta la capa y el control dentro del visor. Devuelve { update, usar, estado, destruir }. */
export function montarEstacionesClima({ anfitrion, lienzo, luz, estilos, parametros = new URLSearchParams(location.search), control = true }) {
  const guardado = leer();
  let actual = normalizar({ estacion: parametros.get('estacion') || guardado.estacion, clima: parametros.get('clima') || guardado.clima });
  let ambientePrevio = guardado.ambientePrevio || null;
  const reducido = matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const capa = document.createElement('div'); capa.className = 'estaciones-capa'; capa.setAttribute('aria-hidden', 'true');
  const veloE = document.createElement('div'), veloC = document.createElement('div'), niebla = document.createElement('div'), rayo = document.createElement('div');
  veloE.className = 'estaciones-velo estacion'; veloC.className = 'estaciones-velo clima'; niebla.className = 'estaciones-niebla'; rayo.className = 'estaciones-rayo';
  const canvas = document.createElement('canvas'); canvas.className = 'estaciones-particulas';
  capa.append(veloE, veloC, niebla, canvas, rayo);
  // Justo tras el lienzo 3D: los controles del visor quedan por encima de los efectos.
  if (lienzo.parentElement === anfitrion) lienzo.after(capa); else anfitrion.append(capa);
  const ctx = canvas.getContext('2d');
  const sistema = new SistemaParticulas();
  let efecto = null, ancho = 1, alto = 1, dpr = 1, tiempo = 0, proximoRayo = 3, inicioRayo = -1;

  function ajustarTamano() {
    const r = anfitrion.getBoundingClientRect(); ancho = Math.max(1, r.width); alto = Math.max(1, r.height);
    dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(ancho * dpr); canvas.height = Math.round(alto * dpr);
    if (efecto) sistema.configurar(efecto.particulas, ancho, alto, { viento: efecto.viento, reducido });
  }
  const observador = new ResizeObserver(ajustarTamano); observador.observe(anfitrion);

  function ambienteSegunClima() {
    const destino = efecto.ambiente, ahora = luz?.ambiente;
    const usar = k => (estilos ? estilos.usarAmbiente(k) : luz?.usarAmbiente(k));
    if (destino && AMBIENTES_DIA.has(ahora)) { ambientePrevio = ahora; usar(destino); }
    else if (!destino && ambientePrevio) { if (ahora === AMBIENTE_CLIMA) usar(ambientePrevio); ambientePrevio = null; }
  }

  function aplicar() {
    efecto = combinarAmbiente(actual.estacion, actual.clima);
    lienzo.style.filter = efecto.filtro;
    veloE.style.background = efecto.veloEstacion.color; veloE.style.opacity = efecto.veloEstacion.opacidad;
    veloC.style.background = efecto.veloClima?.color || 'transparent'; veloC.style.opacity = efecto.veloClima?.opacidad || 0;
    niebla.style.opacity = efecto.niebla;
    sistema.configurar(efecto.particulas, ancho, alto, { viento: efecto.viento, reducido });
    if (!efecto.rayos) rayo.style.opacity = 0;
    ambienteSegunClima();
    guardar({ ...actual, ambientePrevio });
    capa.dataset.estacion = actual.estacion; capa.dataset.clima = actual.clima;
    actualizarControl();
  }

  function dibujar() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, ancho, alto);
    for (const g of sistema.grupos) {
      if (g.tipo === 'lluvia') {
        ctx.strokeStyle = '#d2dcea'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
        const inclinacion = 0.08 + sistema.viento * 0.35;
        for (const p of g.items) { ctx.globalAlpha = p.alfa; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.largo * inclinacion, p.y - p.largo); ctx.stroke(); }
      } else if (g.tipo === 'nieve') {
        ctx.fillStyle = '#ffffff';
        for (const p of g.items) { ctx.globalAlpha = p.alfa; ctx.beginPath(); ctx.arc(p.x, p.y, p.radio, 0, 6.283); ctx.fill(); }
      } else {
        for (const p of g.items) {
          ctx.globalAlpha = 0.92; ctx.fillStyle = p.color;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.giro); ctx.scale(1, Math.abs(Math.cos(p.giro * 0.7)) * 0.6 + 0.4);
          ctx.beginPath(); ctx.ellipse(0, 0, p.tam, p.tam * 0.55, 0, 0, 6.283); ctx.fill(); ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function update(dt) {
    if (!efecto) return;
    tiempo += dt;
    if (sistema.total) { sistema.update(dt, tiempo); dibujar(); }
    else if (canvas.dataset.vacio !== '1') { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    canvas.dataset.vacio = sistema.total ? '0' : '1';
    if (efecto.rayos && !reducido) {
      if (tiempo >= proximoRayo) { inicioRayo = tiempo; proximoRayo = tiempo + 4 + Math.random() * 7; }
      rayo.style.opacity = (destelloRayo(tiempo - inicioRayo) * 0.55).toFixed(3);
    }
  }

  // Control flotante: estación y clima como botones conmutables.
  let detalles = null, resumen = null;
  const botones = { estacion: new Map(), clima: new Map() };
  if (control) {
    detalles = document.createElement('details'); detalles.className = 'estaciones-control';
    resumen = document.createElement('summary'); resumen.setAttribute('aria-label', 'Estación y clima');
    detalles.append(resumen);
    for (const [grupo, titulo, lista] of [['estacion', 'Estación', ESTACIONES], ['clima', 'Clima', CLIMAS]]) {
      const fs = document.createElement('fieldset'); const lg = document.createElement('legend'); lg.textContent = titulo; fs.append(lg);
      for (const [clave, d] of Object.entries(lista)) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = d.icono + ' ' + d.nombre; b.dataset[grupo] = clave;
        b.onclick = () => usar({ [grupo]: clave });
        botones[grupo].set(clave, b); fs.append(b);
      }
      detalles.append(fs);
    }
    anfitrion.append(detalles);
  }
  function actualizarControl() {
    if (!detalles) return;
    const E = ESTACIONES[actual.estacion], C = CLIMAS[actual.clima];
    resumen.textContent = `${E.icono} ${E.nombre} · ${C.icono} ${C.nombre}`;
    for (const grupo of ['estacion', 'clima']) for (const [k, b] of botones[grupo]) b.setAttribute('aria-pressed', String(k === actual[grupo]));
  }

  function usar(cambio) { actual = normalizar({ ...actual, ...cambio }); aplicar(); return { ...actual }; }

  ajustarTamano(); aplicar();
  return {
    update, usar,
    estado: () => ({ ...actual, particulas: sistema.total }),
    destruir() { observador.disconnect(); capa.remove(); detalles?.remove(); lienzo.style.filter = ''; },
  };
}
