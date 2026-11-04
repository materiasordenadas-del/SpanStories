import { AFORDANCIAS, ANIMACIONES, crearAzar, crearIdentidad, entre } from './Identidades.js';
import { decidir } from './Decision.js';
import { elegirDialogo, duracionFrase } from './Dialogos.js';
import { claveConfiguracion, LIMITES_VIDA, validarConfiguracion } from './Ambiente.js';
import { validarNavegacion } from './Navegacion.js';

/**
 * Grabador de la vida ambiental. Se ejecuta UNA vez en el modo estudio: simula
 * a paso fijo identidades + decisión + navegación + diálogos y guarda pistas
 * (posición, giro, animación y frases por tiempo). El juego del estudiante solo
 * reproduce esas pistas, así que la escena es idéntica en cada reproducción y
 * para el tutor y el estudiante, sin sincronizar NPC.
 */
const PASO = .1, GIRO_MAX = 3.5, SEPARACION = .75, TOLERANCIA = .03;
const distancia = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const angulo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const r3 = v => Math.round(v * 1000) / 1000;
const NOMBRES = { sit: 'sentarse', look: 'mirar', talk: 'hablar', wave: 'saludar', walk: 'caminar', idle: 'esperar' };

function posicionPlaza(punto, plaza) {
  const r = punto.rotation, desplazamiento = (plaza - (punto.slots - 1) / 2) * .8;
  return [punto.position[0] + Math.cos(r) * desplazamiento, punto.position[1], punto.position[2] - Math.sin(r) * desplazamiento];
}

/** Douglas–Peucker en el tiempo: conserva solo las claves que cambian la pose. */
function simplificar(muestras) {
  if (muestras.length <= 2) return muestras;
  const conservar = new Uint8Array(muestras.length); conservar[0] = conservar[muestras.length - 1] = 1;
  const pila = [[0, muestras.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop(); let peor = -1, error = TOLERANCIA;
    const a = muestras[i], b = muestras[j];
    for (let k = i + 1; k < j; k++) {
      const m = muestras[k], f = (m[0] - a[0]) / (b[0] - a[0]);
      const e = Math.hypot(a[1] + (b[1] - a[1]) * f - m[1], a[2] + (b[2] - a[2]) * f - m[2], a[3] + (b[3] - a[3]) * f - m[3])
        + Math.abs(angulo(a[4] + angulo(a[4], b[4]) * f, m[4])) * .5;
      if (e > error) { error = e; peor = k; }
    }
    if (peor >= 0) { conservar[peor] = 1; pila.push([i, peor], [peor, j]); }
  }
  return muestras.filter((_, k) => conservar[k]);
}

/** Avisos sobre animaciones que el personaje no tiene (se usará otra). */
function avisosAnimacion(cast, clipsPorPersonaje, usadas) {
  const avisos = [];
  for (const characterId of new Set(cast.map(c => c.characterId))) {
    const clips = clipsPorPersonaje?.[characterId]; if (!clips) continue;
    for (const anim of usadas) if (!ANIMACIONES[anim].some(r => clips.some(c => r.test(c))))
      avisos.push(`El personaje ${characterId} no tiene animación para «${NOMBRES[anim]}»; se mostrará ${anim === 'walk' ? 'sin animación' : 'en espera'}.`);
  }
  return avisos;
}

export function grabarAmbiente({ ambiente, zoneId, centro, navegacion, clipsPorPersonaje = null }) {
  if (!validarConfiguracion(ambiente)) throw new Error('La configuración del ambiente no es válida.');
  validarNavegacion(navegacion);
  const azar = crearAzar(ambiente.seed), avisos = [], puntos = [];
  for (const p of ambiente.points) {
    const cerca = navegacion.puntoCercano(p.position);
    if (!cerca || distancia(cerca, p.position) > 1.2) { avisos.push(`El punto «${AFORDANCIAS[p.kind].etiqueta}» está fuera del área caminable y no se usará.`); continue; }
    puntos.push({ ...p, position: [p.position[0], navegacion.altura(p.position[0], p.position[2]), p.position[2]] });
  }
  if (puntos.some(p => p.kind === 'pedir') && !ambiente.cast.some(c => c.roleId === 'mesero' || c.roleId === 'vendedor'))
    avisos.push('Hay puntos para pedir, pero nadie atiende: añade un mesero o un vendedor.');
  const ocupacion = new Map(), lineas = [], usadas = new Set(['walk', 'idle']);
  const ocupar = (p, npc) => {
    let plazas = ocupacion.get(p.id); if (!plazas) ocupacion.set(p.id, plazas = new Map());
    if (plazas.has(npc.id)) return plazas.get(npc.id);
    for (let i = 0; i < p.slots; i++) if (![...plazas.values()].includes(i)) { plazas.set(npc.id, i); return i; }
    return -1;
  };
  const liberar = npc => { if (npc.punto) ocupacion.get(npc.punto.id)?.delete(npc.id); npc.punto = null; };
  const ocupacionVista = { get: id => { const m = ocupacion.get(id); return m && { size: m.size, has: k => m.has(k) }; } };

  // Reparto y posiciones iniciales (el punto de partida es también el final del bucle).
  const npcs = [];
  for (const miembro of ambiente.cast) {
    const identidad = crearIdentidad(miembro, azar), npc = {
      id: miembro.id, identidad, recientes: [], muestras: [], clips: [], velocidad: 0,
      estado: 'actuar', hasta: entre(azar, [.5, 3]), punto: null, ruta: null, paso: 0, anulacion: null,
    };
    let inicio = null, yaw = azar() * Math.PI * 2;
    if (identidad.rol.puesto) {
      const puesto = puntos.filter(p => p.kind === identidad.rol.puesto && (!p.roles?.length || p.roles.includes(miembro.roleId)) && !ocupacion.get(p.id)?.size)
        .sort((a, b) => distancia(a.position, centro) - distancia(b.position, centro))[0];
      if (puesto) {
        npc.puestoId = puesto.id; ocupar(puesto, npc); npc.punto = puesto; inicio = posicionPlaza(puesto, 0); yaw = puesto.rotation;
        npc.hasta = entre(azar, AFORDANCIAS[puesto.kind].estancia) * identidad.ritmo; npc.recientes.push(puesto.id);
      } else avisos.push(`${identidad.rol.etiqueta} sin puesto de trabajo: declara un punto «Atender» para él.`);
    }
    for (let intento = 0; !inicio && intento < 60; intento++) {
      const p = navegacion.puntoAleatorio(azar);
      if (p && distancia(p, centro) < ambiente.radius * .8 && npcs.every(o => distancia(o.inicio.pos, p) > 1.2)) inicio = p;
    }
    if (!inicio) throw new Error('No hay suelo caminable suficiente en el área del ambiente.');
    npc.posicion = [...inicio]; npc.yaw = yaw; npc.inicio = { pos: [...inicio], yaw }; npc.anim = 'idle';
    npcs.push(npc);
  }

  const atendidos = p => npcs.some(o => o.punto?.kind === 'atender' && o.estado === 'actuar' && distancia(o.posicion, p.position) < 6);
  const costeCasa = npc => distancia(npc.posicion, npc.inicio.pos) * 1.4 / npc.identidad.velocidad + 2;
  const L = ambiente.duration, maximo = L * 1.5;

  function hablar(dialogo, desde, participantes) {
    // Una conversación empieza solo si cabe entera antes de que alguien deba volver.
    const duracionTotal = dialogo.reduce((s, turno) => s + duracionFrase(turno.texto) + .35, 0);
    if (participantes.some(n => desde + duracionTotal + .6 > L - costeCasa(n) - 1)) return null;
    let t = desde;
    for (const turno of dialogo) {
      if (lineas.length >= LIMITES_VIDA.lineas) break;
      const duracion = duracionFrase(turno.texto);
      lineas.push({ id: 'linea-' + lineas.length, npcId: turno.npcId, at: t, duration: duracion, text: turno.texto });
      const hablante = participantes.find(n => n.id === turno.npcId);
      hablante.habla.push([t, t + duracion]); usadas.add('talk');
      t += duracion + .35;
    }
    for (const n of participantes) n.hasta = Math.max(n.hasta, t + .6);
    return t;
  }

  function llegar(npc, t) {
    const p = npc.punto; npc.estado = 'actuar'; npc.ruta = null; npc.velocidad = 0;
    npc.yawObjetivo = p ? p.rotation : npc.yaw;
    npc.anim = p ? AFORDANCIAS[p.kind].animacion : 'idle'; usadas.add(npc.anim);
    npc.hasta = t + entre(azar, p ? AFORDANCIAS[p.kind].estancia : [1.5, 4]) * npc.identidad.ritmo;
    npc.habla = [];
    if (p?.kind === 'pedir') {
      const atiende = npcs.find(o => o.punto?.kind === 'atender' && o.estado === 'actuar' && distancia(o.posicion, p.position) < 6 && !(o.ocupadoHasta > t));
      if (atiende) {
        atiende.habla ??= [];
        const fin = hablar(elegirDialogo('pedir', azar, { cliente: npc.id, atiende: atiende.id }), t + .5, [npc, atiende]);
        if (fin !== null) { atiende.ocupadoHasta = fin; atiende.mirarA = { npc, hasta: fin }; }
      }
    }
    if (p?.kind === 'conversar') {
      const otro = npcs.find(o => o !== npc && o.estado === 'actuar' && o.punto?.kind === 'conversar' && distancia(o.posicion, npc.posicion) < 3.5 && !(o.ocupadoHasta > t));
      if (otro) {
        otro.habla ??= [];
        const fin = hablar(elegirDialogo('conversar', azar, { a: otro.id, b: npc.id }), t + .6, [otro, npc]);
        if (fin !== null) { otro.ocupadoHasta = npc.ocupadoHasta = fin; otro.mirarA = { npc, hasta: fin }; npc.mirarA = { npc: otro, hasta: fin }; }
      }
    }
    if ((p?.kind === 'mirar' || p?.kind === 'esperar') && azar() < .3 * npc.identidad.personalidad.curiosidad)
      hablar(elegirDialogo(p.kind, azar, { a: npc.id }), t + (npc.hasta - t) * .4, [npc]);
    // Nadie se queda tanto que no pueda volver a su punto de partida antes del final del bucle.
    npc.hasta = Math.min(npc.hasta, Math.max(t + 1, L - costeCasa(npc) - 1));
  }

  function siguiente(npc, t) {
    const pasado = npc.punto; liberar(npc);
    if (pasado && pasado.id !== npc.puestoId) { npc.recientes.unshift(pasado.id); npc.recientes.length = Math.min(npc.recientes.length, 2); }
    if (L - t < costeCasa(npc) + 8) {
      npc.estado = 'casa'; npc.ruta = navegacion.buscarRuta(npc.posicion, npc.inicio.pos) || [npc.posicion, npc.inicio.pos]; npc.paso = 1;
      if (npc.puestoId) { const puesto = puntos.find(p => p.id === npc.puestoId); ocupar(puesto, npc); npc.punto = puesto; }
      return;
    }
    const opcion = decidir({ identidad: npc.identidad, npc, puntos, ocupacion: ocupacionVista, atendidos }, azar);
    let destino = null;
    if (opcion.punto) { const plaza = ocupar(opcion.punto, npc); if (plaza >= 0) { npc.punto = opcion.punto; destino = posicionPlaza(opcion.punto, plaza); } }
    else {
      const base = npc.puestoId ? puntos.find(p => p.id === npc.puestoId).position : npc.posicion;
      const radio = npc.identidad.rol.radioPuesto ?? 14;
      for (let i = 0; !destino && i < 30; i++) {
        const p = navegacion.puntoAleatorio(azar), d = p && distancia(p, npc.posicion);
        if (p && d > 3 && distancia(p, base) < radio && distancia(p, centro) < ambiente.radius * .9) destino = p;
      }
    }
    const ruta = destino && navegacion.buscarRuta(npc.posicion, destino);
    if (!ruta) { liberar(npc); npc.estado = 'actuar'; npc.anim = 'idle'; npc.hasta = t + entre(azar, [1.5, 3]); npc.habla = []; return; }
    npc.estado = 'caminar'; npc.ruta = ruta; npc.paso = 1;
  }

  function mover(npc, t) {
    const objetivo = npc.ruta[npc.paso], dx = objetivo[0] - npc.posicion[0], dz = objetivo[2] - npc.posicion[2], d = Math.hypot(dx, dz);
    const ultimo = npc.paso === npc.ruta.length - 1, deseada = npc.identidad.velocidad * (ultimo ? Math.min(1, .35 + d / 1.5) : 1);
    npc.velocidad += (deseada - npc.velocidad) * Math.min(1, PASO * 3);
    let vx = d > 1e-6 ? dx / d * npc.velocidad : 0, vz = d > 1e-6 ? dz / d * npc.velocidad : 0;
    // Separación: deja espacio a los demás sin atravesar paredes.
    for (const o of npcs) {
      if (o === npc) continue;
      const ox = npc.posicion[0] - o.posicion[0], oz = npc.posicion[2] - o.posicion[2], od = Math.hypot(ox, oz);
      if (od > 1e-4 && od < SEPARACION) { const f = (SEPARACION - od) / SEPARACION * .9; vx += ox / od * f; vz += oz / od * f; }
    }
    const paso = Math.min(Math.hypot(vx, vz) * PASO, d + .05), nx = npc.posicion[0] + (vx / (Math.hypot(vx, vz) || 1)) * paso, nz = npc.posicion[2] + (vz / (Math.hypot(vx, vz) || 1)) * paso;
    if (navegacion.esTransitable(nx, nz)) { npc.posicion[0] = nx; npc.posicion[2] = nz; }
    else { npc.posicion[0] += dx / (d || 1) * Math.min(d, npc.velocidad * PASO); npc.posicion[2] += dz / (d || 1) * Math.min(d, npc.velocidad * PASO); }
    npc.posicion[1] = navegacion.altura(npc.posicion[0], npc.posicion[2]);
    if (d > .05) npc.yawObjetivo = Math.atan2(dx, dz);
    if (Math.hypot(objetivo[0] - npc.posicion[0], objetivo[2] - npc.posicion[2]) < .18) {
      npc.paso++;
      if (npc.paso >= npc.ruta.length) {
        if (npc.estado === 'casa') { npc.posicion = [...npc.inicio.pos]; npc.estado = 'fin'; npc.yawObjetivo = npc.inicio.yaw; npc.anim = 'idle'; npc.ruta = null; npc.habla = []; npc.finEn = t; }
        else llegar(npc, t);
      }
    }
  }

  let t = 0;
  for (const npc of npcs) { npc.habla = []; npc.yawObjetivo = npc.yaw; }
  for (; t <= maximo + 1e-9; t = r3(t + PASO)) {
    for (const npc of npcs) {
      if (npc.estado === 'actuar' && t >= npc.hasta) siguiente(npc, t);
      if (npc.estado === 'caminar' || npc.estado === 'casa') mover(npc, t);
      if (npc.mirarA && t < npc.mirarA.hasta) npc.yawObjetivo = Math.atan2(npc.mirarA.npc.posicion[0] - npc.posicion[0], npc.mirarA.npc.posicion[2] - npc.posicion[2]);
      else if (npc.mirarA) { npc.mirarA = null; if (npc.estado === 'actuar') npc.yawObjetivo = npc.punto ? npc.punto.rotation : npc.yaw; }
      npc.yaw += Math.max(-GIRO_MAX * PASO, Math.min(GIRO_MAX * PASO, angulo(npc.yaw, npc.yawObjetivo)));
      const hablando = npc.habla?.some(([a, b]) => t >= a && t < b);
      const anim = npc.estado === 'caminar' || npc.estado === 'casa' ? (npc.velocidad > .15 ? 'walk' : 'idle') : hablando ? 'talk' : npc.anim;
      if (npc.clips.at(-1)?.[1] !== anim) npc.clips.push([r3(t), anim]);
      npc.muestras.push([r3(t), npc.posicion[0], npc.posicion[1], npc.posicion[2], Math.atan2(Math.sin(npc.yaw), Math.cos(npc.yaw))]);
    }
    if (t >= L && npcs.every(n => n.estado === 'fin')) break;
  }
  const loop = r3(Math.max(L, t));
  const tracks = npcs.map(npc => {
    if (npc.estado !== 'fin') avisos.push(`Un NPC (${npc.identidad.rol.etiqueta}) no pudo volver a su punto de partida; el bucle tendrá un salto.`);
    const final = [loop, ...npc.inicio.pos, Math.atan2(Math.sin(npc.inicio.yaw), Math.cos(npc.inicio.yaw))];
    const muestras = npc.muestras.filter(m => m[0] < loop); muestras.push(final);
    const keys = simplificar(muestras).flatMap(m => m.map(r3));
    // Normaliza la primera pose exacta para que el bucle cierre sin saltos.
    keys.splice(1, 4, ...npc.inicio.pos.map(r3), r3(Math.atan2(Math.sin(npc.inicio.yaw), Math.cos(npc.inicio.yaw))));
    return { npcId: npc.id, keys, clips: npc.clips.filter(c => c[0] < loop), phase: r3(npc.identidad.fase) };
  });
  avisos.push(...avisosAnimacion(ambiente.cast, clipsPorPersonaje, usadas));
  return {
    version: 1, zoneId, configKey: claveConfiguracion(ambiente), center: centro.map(r3), loop,
    tracks, lines: lineas.filter(l => l.at < loop).map(l => ({ ...l, at: r3(l.at), duration: r3(Math.min(l.duration, 30)) })), warnings: [...new Set(avisos)],
  };
}
