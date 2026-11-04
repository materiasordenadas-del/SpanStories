import { SECCIONES, PLATOS, frasePedido, totalPedido, precio } from './engine/menu.js';
import { servir, definido } from './engine/Comida.js';
import { VISTAS } from './engine/config.js';

/* Interfaz de las historias: carta interactiva en pantalla, reserva en
   recepción, la cuenta, sentarse a la mesa y los nombres de los objetos.
   Todo emite eventos `restaurante:*` en `document` y se expone en
   `window.restaurante` para que el motor de historias lo use. */

const $ = s => document.querySelector(s);
const HORAS = { '20:00': 'a las ocho', '20:30': 'a las ocho y media', '21:00': 'a las nueve', '21:30': 'a las nueve y media' };
const PERSONAS = ['', 'una persona', 'dos personas', 'tres personas', 'cuatro personas'];
const OBJETOS_ASIENTO = new Set(['la silla', 'el mantel de cuadros', 'la mesa', 'el banco corrido', 'el respaldo de cuero', 'el plato', 'la servilleta', 'la copa de vino', 'el tenedor', 'el cuchillo']);

export function crearInterfaz({ ctx, sentarse, levantarse, ir, estado, ambiente }) {
  const pedidos = new Map();      // mesa → borrador [{ id, cantidad }]
  const servidos = new Map();     // mesa → todo lo pedido y servido (para la cuenta)
  let mesaCarta = null, seccion = 'pasta', temporizador = 0;

  const log = (tipo, detalle) => {
    document.dispatchEvent(new CustomEvent(`restaurante:${tipo}`, { detail: detalle }));
    const pre = $('#eventos'); pre.textContent = `[${tipo}] ${JSON.stringify(detalle)}\n${pre.textContent}`.slice(0, 3000);
  };
  function toast(texto, ms = 2400) {
    const t = $('#toast'); t.textContent = texto; t.hidden = false;
    clearTimeout(temporizador); temporizador = setTimeout(() => { t.hidden = true; }, ms);
  }
  function decir(texto) {
    try {
      const s = window.speechSynthesis; if (!s) return;
      s.cancel(); const u = new SpeechSynthesisUtterance(texto); u.lang = 'es-ES'; u.rate = .92;
      const voz = s.getVoices().find(v => v.lang?.startsWith('es-ES')) || s.getVoices().find(v => v.lang?.startsWith('es'));
      if (voz) u.voice = voz;
      s.speak(u);
    } catch { /* sin síntesis de voz */ }
  }
  const saludo = () => ({ manana: '¡Buenos días!', mediodia: '¡Buenas tardes!', tarde: '¡Buenas tardes!', noche: '¡Buenas noches!' }[ambiente()] || '¡Hola!');

  // ── Modales ──────────────────────────────────────────────────────────
  const abrir = id => { $(id).hidden = false; $(id).querySelector('button')?.focus({ preventScroll: true }); };
  const cerrar = el => { el.hidden = true; };
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-cerrar]')) cerrar(m); });
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach(cerrar); });
  document.querySelectorAll('[data-decir]').forEach(b => { b.onclick = () => decir(b.dataset.decir); });

  // ── Asientos ─────────────────────────────────────────────────────────
  function asientoMasCercano(x, z, mesa = null) {
    let mejor = null;
    for (const m of ctx.mesas) {
      if (mesa && m.numero !== mesa) continue;
      for (const a of m.asientos) { const d = Math.hypot(a.x - x, a.z - z); if (!mejor || d < mejor.d) mejor = { d, mesa: m, asiento: a }; }
    }
    return mejor;
  }

  // ── Carta ────────────────────────────────────────────────────────────
  const secciones = $('#carta-secciones');
  for (const s of SECCIONES) {
    const b = document.createElement('button'); b.dataset.id = s.id;
    b.innerHTML = `${s.titulo} <small>· ${s.es}</small>`;
    b.onclick = () => { seccion = s.id; pintarCarta(); };
    secciones.append(b);
  }
  const borrador = () => pedidos.get(mesaCarta) ?? pedidos.set(mesaCarta, []).get(mesaCarta);
  function cambiar(id, delta) {
    const p = borrador(), linea = p.find(l => l.id === id);
    if (linea) linea.cantidad = Math.max(0, Math.min(9, linea.cantidad + delta)); else if (delta > 0) p.push({ id, cantidad: 1 });
    pedidos.set(mesaCarta, p.filter(l => l.cantidad > 0));
    pintarCarta();
  }
  function pintarCarta() {
    secciones.querySelectorAll('button').forEach(b => b.classList.toggle('activa', b.dataset.id === seccion));
    const p = borrador(), lista = $('#carta-platos'); lista.replaceChildren();
    for (const plato of PLATOS.filter(x => x.seccion === seccion)) {
      const n = p.find(l => l.id === plato.id)?.cantidad || 0;
      const li = document.createElement('li'), b = document.createElement('button');
      b.className = n ? 'elegido' : '';
      b.innerHTML = `<span class="ico">${plato.icono}</span><span><span class="it">${plato.it}${n ? `<span class="n">×${n}</span>` : ''}</span><span class="es">${plato.es}</span></span><span class="pr">${precio(plato.precio)}</span>`;
      b.title = `Añadir ${plato.uno}`;
      b.onclick = () => { cambiar(plato.id, 1); };
      li.append(b); lista.append(li);
    }
    const ul = $('#pedido-lista'); ul.replaceChildren();
    if (!p.length) ul.innerHTML = '<li class="vacio">Pulsa un plato para añadirlo.</li>';
    for (const l of p) {
      const plato = PLATOS.find(x => x.id === l.id), li = document.createElement('li');
      li.innerHTML = `<span>${l.cantidad} × ${plato.it}</span>`;
      const menos = document.createElement('button'); menos.textContent = '−'; menos.title = 'Quitar uno'; menos.onclick = () => cambiar(l.id, -1);
      const mas = document.createElement('button'); mas.textContent = '+'; mas.title = 'Añadir otro'; mas.onclick = () => cambiar(l.id, 1);
      li.append(menos, mas); ul.append(li);
    }
    $('#pedido-total').textContent = precio(totalPedido(p));
    const frase = frasePedido(p);
    $('#pedido-frase').textContent = frase || '—';
    $('#escuchar').disabled = !frase;
    const sentado = estado().sentado;
    $('#confirmar').disabled = !frase || !sentado || mesaCarta === 0;
    $('#confirmar').textContent = sentado && mesaCarta !== 0 ? 'Pedir al camarero' : 'Siéntate en una mesa para pedir';
  }
  function abrirCarta(mesa = estado().sentado?.mesa.numero ?? 0, sec = null) {
    mesaCarta = mesa; if (sec) seccion = sec;
    $('#carta-mesa').textContent = mesa ? `Mesa ${mesa}` : 'Consulta la carta · para pedir, siéntate en una mesa';
    pintarCarta(); abrir('#carta');
    log('carta', { mesa });
  }
  $('#escuchar').onclick = () => decir($('#pedido-frase').textContent);
  $('#vaciar').onclick = () => { pedidos.set(mesaCarta, []); pintarCarta(); };
  $('#confirmar').onclick = () => {
    const p = borrador(); if (!p.length) return;
    const { mesa, asiento } = estado().sentado;
    const frase = frasePedido(p);
    cerrar($('#carta'));
    toast(`Tú: «${frase}»`, 3000); decir(frase);
    const todo = servidos.get(mesa.numero) ?? [];
    for (const l of p) { const t = todo.find(x => x.id === l.id); if (t) t.cantidad += l.cantidad; else todo.push({ ...l }); }
    servidos.set(mesa.numero, todo);
    log('pedido', { mesa: mesa.numero, pedido: p.map(l => ({ ...l })), frase, total: totalPedido(p) });
    pedidos.set(mesa.numero, []);
    const carta = ctx.cartas?.get(mesa.numero); if (carta) setTimeout(() => { carta.visible = false; }, 3100);   // el camarero se lleva la carta
    setTimeout(() => { toast('🤵 Camarero: «¡Muy bien! Enseguida se lo traigo.»', 2600); decir('¡Muy bien! Enseguida se lo traigo.'); }, 3100);
    setTimeout(() => {
      servir(ctx, mesa, asiento, todo);
      toast('🤵 «Aquí tiene. ¡Buen provecho!»', 2800); decir('Aquí tiene. ¡Buen provecho!');
      log('servido', { mesa: mesa.numero, platos: todo.map(l => definido(PLATOS.find(x => x.id === l.id).uno)) });
    }, 6000);
  };
  $('#ver-carta').onclick = () => abrirCarta();

  // ── La cuenta ────────────────────────────────────────────────────────
  function pedirCuenta() {
    const s = estado().sentado; if (!s) return;
    const todo = servidos.get(s.mesa.numero) ?? [];
    if (!todo.length) { toast('🤵 «Todavía no ha pedido nada. ¿Quiere ver la carta?»', 3000); return; }
    toast('Tú: «¿Me trae la cuenta, por favor?»', 2200); decir('¿Me trae la cuenta, por favor?');
    const ul = $('#cuenta-lineas'); ul.replaceChildren();
    for (const l of todo) { const p = PLATOS.find(x => x.id === l.id), li = document.createElement('li'); li.innerHTML = `<span>${l.cantidad} ${p.it}</span><span>${precio(p.precio * l.cantidad)}</span>`; ul.append(li); }
    const total = totalPedido(todo), iva = total - total / 1.1;
    $('#cuenta-mesa').textContent = s.mesa.numero; $('#cuenta-sub').textContent = precio(total - iva); $('#cuenta-iva').textContent = precio(iva); $('#cuenta-total').textContent = precio(total);
    setTimeout(() => abrir('#cuenta'), 900);
    log('cuenta', { mesa: s.mesa.numero, total });
  }
  $('#pedir-cuenta').onclick = pedirCuenta;
  const pagar = modo => {
    cerrar($('#cuenta'));
    const s = estado().sentado;
    toast(modo === 'tarjeta' ? '🤵 «Acerque la tarjeta, por favor… ¡Gracias! Que tengan buena noche.»' : '🤵 «Aquí tiene el cambio. ¡Muchas gracias, hasta pronto!»', 3400);
    decir(modo === 'tarjeta' ? 'Acerque la tarjeta, por favor. ¡Gracias!' : 'Aquí tiene el cambio. ¡Muchas gracias, hasta pronto!');
    if (s) { servidos.delete(s.mesa.numero); const g = ctx.servidos?.get(s.mesa.numero); if (g) g.visible = false; const c = ctx.cartas?.get(s.mesa.numero); if (c) c.visible = true; }
    log('pago', { modo, mesa: s?.mesa.numero });
  };
  $('#pagar-tarjeta').onclick = () => pagar('tarjeta');
  $('#pagar-efectivo').onclick = () => pagar('efectivo');

  // ── Reserva en recepción ─────────────────────────────────────────────
  function fraseReserva(con = true) {
    const n = $('#reserva-nombre').value.trim() || 'García', p = +$('#reserva-personas').value, h = $('#reserva-hora').value;
    return con ? `Sí, tengo una reserva a nombre de ${n} para ${PERSONAS[p]} ${HORAS[h]}.` : `No, no tenemos reserva. ¿Tienen una mesa para ${PERSONAS[p]}?`;
  }
  const actualizarReserva = () => { $('#reserva-frase').textContent = fraseReserva(true); $('#reserva-frase-no').textContent = fraseReserva(false); };
  ['#reserva-nombre', '#reserva-personas', '#reserva-hora'].forEach(s => $(s).addEventListener('input', actualizarReserva));
  function abrirReserva() {
    document.querySelector('#reserva .camarero').textContent = `🤵 «${saludo()} Bienvenidos a La Nonna. ¿Tienen reserva?»`;
    actualizarReserva(); abrir('#reserva'); log('recepcion', {});
  }
  $('#reserva-escuchar').onclick = () => decir($('#reserva-frase').textContent);
  $('#reserva-escuchar-no').onclick = () => decir($('#reserva-frase-no').textContent);
  function acompanar(con) {
    const p = +$('#reserva-personas').value, nombre = $('#reserva-nombre').value.trim() || 'García';
    const frase = fraseReserva(con);
    cerrar($('#reserva')); toast(`Tú: «${frase}»`, 2800); decir(frase);
    log('reserva', { conReserva: con, nombre, personas: p, hora: $('#reserva-hora').value, frase });
    // mesa libre con sitio suficiente (cuatro para 3-4, dos para 1-2)
    const candidatas = ctx.mesas.filter(m => m.asientos.length >= p && !servidos.get(m.numero)?.length);
    const mesa = candidatas.find(m => (p <= 2) === (m.asientos.length === 2)) || candidatas[0] || ctx.mesas[0];
    setTimeout(() => {
      const r = con ? `Perfecto, ${nombre}. Acompáñenme, por favor: su mesa es la ${mesa.numero}.` : `Sí, claro. Síganme, por favor: la mesa ${mesa.numero} está libre.`;
      toast(`🤵 «${r}»`, 3200); decir(r);
    }, 2900);
    setTimeout(() => { sentarse(mesa, mesa.asientos[0]); toast(`Mesa ${mesa.numero} · pulsa «Ver la carta»`, 2600); }, 6200);
  }
  $('#con-reserva').onclick = () => acompanar(true);
  $('#sin-reserva').onclick = () => acompanar(false);

  // ── Objetos pulsados ─────────────────────────────────────────────────
  // ── Vocabulario descubierto (se guarda en este navegador) ─────────────
  const CLAVE_VOCAB = 'restaurante.vocabulario.v1';
  let vocab = []; try { vocab = JSON.parse(localStorage.getItem(CLAVE_VOCAB) || '[]'); } catch { vocab = []; }
  const todas = () => {
    const s = new Set();
    for (const p of ctx.pulsables) { if (p.userData.nombre) s.add(p.userData.nombre); for (const n of p.userData.nombres || []) if (n) s.add(n); }
    return s;
  };
  function pintarVocab() {
    const ul = $('#vocab-lista'); ul.replaceChildren();
    for (const n of [...vocab].sort((a, b) => a.replace(/^(el|la|los|las) /, '').localeCompare(b.replace(/^(el|la|los|las) /, ''), 'es'))) {
      const li = document.createElement('li'); li.textContent = n; li.title = 'Escuchar'; li.onclick = () => decir(n); ul.append(li);
    }
    $('#vocab-cuenta').textContent = `${vocab.length} / ${todas().size}`;
  }
  function aprender(nombre) {
    if (vocab.includes(nombre)) return false;
    vocab.push(nombre); try { localStorage.setItem(CLAVE_VOCAB, JSON.stringify(vocab)); } catch { /* */ }
    pintarVocab(); return true;
  }
  $('#vocab-borrar').onclick = () => { vocab = []; try { localStorage.removeItem(CLAVE_VOCAB); } catch { /* */ } pintarVocab(); };
  setTimeout(pintarVocab, 0);

  function objeto(nombre, datos, punto) {
    if (!nombre) return;
    const nueva = aprender(nombre);
    log('objeto', { nombre, nueva });
    if (datos.accion === 'carta') {
      if (datos.mesa && estado().sentado?.mesa.numero !== datos.mesa) {
        const c = asientoMasCercano(punto.x, punto.z, datos.mesa); if (c) sentarse(c.mesa, c.asiento);
      }
      abrirCarta(datos.mesa ?? 0);
      return;
    }
    if (datos.accion === 'reserva') { abrirReserva(); return; }
    if (datos.accion === 'postres') { toast(nombre); abrirCarta(estado().sentado?.mesa.numero ?? 0, 'postres'); return; }
    if (OBJETOS_ASIENTO.has(nombre) && !estado().sentado) {
      const c = asientoMasCercano(punto.x, punto.z);
      if (c && c.d < 1.3) { sentarse(c.mesa, c.asiento); toast(`${nombre} · te sientas en la mesa ${c.mesa.numero}`); return; }
    }
    toast(nueva ? `✨ ${nombre}` : nombre); decir(nombre);
  }
  function alSentarse(mesa) { log('sentarse', { mesa: mesa.numero }); }
  function cambioDeSala(sala) {
    log('sala', { sala });
    if (sala === 'Recepción' && !sessionStorage.getItem('rest.saludo')) {
      try { sessionStorage.setItem('rest.saludo', '1'); } catch { /* */ }
      setTimeout(() => toast(`🤵 «${saludo()} Pase, pase.» · pulsa el libro de reservas del atril`, 3600), 400);
    }
  }

  // API para el motor de historias
  window.restaurante = {
    abrirCarta, pedirCuenta, abrirReserva, decir, toast,
    sentarse: numero => { const m = ctx.mesas.find(x => x.numero === numero); if (m) sentarse(m, m.asientos[0]); },
    levantarse: () => levantarse(),
    ir: id => { const v = VISTAS.find(x => x.id === id); if (v) ir(v); },
    get pedido() { return mesaCarta != null ? [...(pedidos.get(mesaCarta) || [])] : []; },
    servidos: numero => [...(servidos.get(numero) || [])],
    mesas: () => ctx.mesas.map(m => ({ numero: m.numero, plazas: m.asientos.length })),
    platos: PLATOS, secciones: SECCIONES,
  };
  return { toast, objeto, alSentarse, cambioDeSala, abrirCarta };
}
