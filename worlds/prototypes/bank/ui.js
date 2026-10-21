import { VISTAS, KIOSCO, INFORMACION, ASESORES, FILA, FILA_PREF, MOSTRADOR as M, centroCaja, EDIFICIO } from './engine/config.js';
import * as R from './engine/Rotulos.js';

/* ── Interacción del estudiante ───────────────────────────────────────────
   · Nombres: pulsar un objeto muestra (y dice) su nombre con artículo.
   · Turnos: el kiosco da un tique A (atención al cliente) o P (caja
     preferencial); la pantalla llama con timbre y voz, y tu número llega.
   · La fila: quien hace la fila y se para en «Espere aquí» es llamado a una
     caja libre («Siguiente ► Caja 3»).  Sin fila, el cajero te pide hacerla.
   · Diálogos con frases para decir (🔊): ventanilla, información, asesor.
   · Cajero automático con NIP, retiro, consulta, depósito y comprobante.
   Todo emite eventos `banco:*` y se expone en `window.banco`. */

const $ = s => document.querySelector(s);
const NOMBRES_CAJA = { 2: 'Marta Ruiz', 3: 'Jorge Salinas', 4: 'Ana Beltrán', 5: 'Sofía Paredes' };
const ASESOR = { 1: 'Lic. Patricia Núñez', 2: 'Lic. Ricardo Vega', 3: 'Lic. Elena Castro' };
const ZATM = [-.85, -1.85, -2.85];
const pesos = n => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── Números en letras (español de México) ───────────────────────────── */
const U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function cientos(n) {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100;
  let t = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ` y ${U[r % 10]}` : '');
  return [C[c], t].filter(Boolean).join(' ');
}
export function enLetras(n) {
  n = Math.floor(n);
  if (n === 0) return 'cero';
  const miles = Math.floor(n / 1000), resto = n % 1000;
  const m = miles === 0 ? '' : miles === 1 ? 'mil' : `${cientos(miles).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')} mil`;
  return [m, cientos(resto)].filter(Boolean).join(' ');
}
// «un peso», «veintiún pesos», «cuatrocientos treinta y ocho pesos con cincuenta centavos»
export function dinero(n, moneda = 'pesos') {
  const ent = Math.floor(n + 1e-6), cent = Math.round((n - ent) * 100);
  let t = enLetras(ent).replace(/uno$/, ent % 100 === 21 ? 'ún' : 'un').replace(/veintiun$/, 'veintiún');
  if (ent === 1) t = 'un';
  const s = `${t} ${ent === 1 ? moneda.replace(/s$/, '') : moneda}`;
  return cent ? `${s} con ${enLetras(cent)} centavos` : s;
}

export function crearInterfaz({ ctx, ir, jugador, ambiente, sonido, mirar }) {
  let saldo = 8450;
  let temporizadorToast = 0, temporizadorNombre = 0;

  const log = (tipo, detalle) => {
    document.dispatchEvent(new CustomEvent(`banco:${tipo}`, { detail: detalle }));
    const pre = $('#eventos'); pre.textContent = `[${tipo}] ${JSON.stringify(detalle)}\n${pre.textContent}`.slice(0, 3000);
  };
  function toast(texto, ms = 2600, clase = '') {
    const t = $('#toast'); t.textContent = texto; t.className = clase; t.hidden = false;
    clearTimeout(temporizadorToast); temporizadorToast = setTimeout(() => { t.hidden = true; }, ms);
  }
  let voces = [];
  const cargarVoces = () => { try { voces = speechSynthesis.getVoices(); } catch { voces = []; } };
  try { cargarVoces(); speechSynthesis.onvoiceschanged = cargarVoces; } catch { /* sin voz */ }
  function decir(texto, { forzar = false } = {}) {
    if (!forzar && !sonido()) return;
    try {
      const s = window.speechSynthesis; if (!s) return;
      s.cancel(); const u = new SpeechSynthesisUtterance(texto); u.lang = 'es-MX'; u.rate = .92;
      const voz = voces.find(v => v.lang?.startsWith('es-MX')) || voces.find(v => v.lang?.startsWith('es-US')) || voces.find(v => v.lang?.startsWith('es'));
      if (voz) u.voice = voz;
      s.speak(u);
    } catch { /* sin síntesis de voz */ }
  }
  let audio = null;
  function timbre() {
    if (!sonido()) return;
    try {
      audio ??= new AudioContext();
      const t0 = audio.currentTime;
      for (const [f, t] of [[659.3, 0], [523.3, .42]]) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0, t0 + t); g.gain.linearRampToValueAtTime(.22, t0 + t + .02); g.gain.exponentialRampToValueAtTime(.001, t0 + t + 1.1);
        o.start(t0 + t); o.stop(t0 + t + 1.2);
      }
    } catch { /* sin audio */ }
  }
  const saludo = () => ({ manana: 'Buenos días', mediodia: 'Buenas tardes', tarde: 'Buenas tardes', noche: 'Buenas noches' }[ambiente()] || 'Hola');
  const actualizarSaldo = () => { $('#saldo').textContent = pesos(saldo); };
  actualizarSaldo();

  /* ── Modales ─────────────────────────────────────────────────────── */
  const abrir = id => { $(id).hidden = false; };
  const cerrar = el => { el.hidden = true; el.dispatchEvent(new Event('cerrado')); };
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-cerrar]')) cerrar(m); }));
  addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach(cerrar); });

  function comprobante(titulo, lineas, pie = '¡Gracias por su preferencia!') {
    const ahora = new Date();
    $('#comp-sub').textContent = `${titulo} · ${ahora.toLocaleDateString('es-MX')} ${ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · Folio ${Math.floor(100000 + Math.random() * 899999)}`;
    $('#comp-lineas').innerHTML = '';
    for (const [a, b, cl] of lineas) { const li = document.createElement('li'); if (cl) li.className = cl; li.innerHTML = `<span>${a}</span><span>${b}</span>`; $('#comp-lineas').append(li); }
    $('#comp-pie').textContent = pie;
    abrir('#comprobante');
  }

  /* ── Motor de diálogo ────────────────────────────────────────────── */
  const dlg = {
    abrir(titulo, sub = '') { $('#dialogo-titulo').textContent = titulo; $('#dialogo-sub').textContent = sub; $('#conversacion').innerHTML = ''; $('#opciones').innerHTML = ''; abrir('#dialogo'); },
    burbuja(texto, clase, quien) {
      const b = document.createElement('div'); b.className = `burbuja ${clase}`;
      b.innerHTML = `<span class="quien"></span><span class="txt"></span>`;
      b.querySelector('.quien').textContent = quien; b.querySelector('.txt').textContent = texto;
      const oir = document.createElement('button'); oir.textContent = '🔊'; oir.title = 'Escuchar'; oir.onclick = () => decir(texto, { forzar: true });
      b.append(oir); $('#conversacion').append(b); b.scrollIntoView({ block: 'end' });
    },
    ellos(texto, quien) { dlg.burbuja(texto, 'ellos', quien); decir(texto); },
    yo(texto) { dlg.burbuja(texto, 'yo', 'Tú'); },
    opciones(lista) {
      const o = $('#opciones'); o.innerHTML = '';
      for (const it of lista) {
        const b = document.createElement('button'); b.textContent = it.texto; if (it.clase) b.className = it.clase;
        b.onclick = it.accion; o.append(b);
      }
    },
    /** Frase que el estudiante debe decir: se lee, se escucha y se «dice». */
    frase(texto, siguiente, extra = []) {
      const o = $('#opciones'); o.innerHTML = '';
      const caja = document.createElement('div'); caja.className = 'frase';
      caja.innerHTML = `<span class="etiqueta">Para responder, di:</span><p></p>`;
      caja.querySelector('p').textContent = texto; o.append(caja);
      const oir = document.createElement('button'); oir.textContent = '🔊 Escuchar'; oir.onclick = () => decir(texto, { forzar: true });
      const ok = document.createElement('button'); ok.className = 'primario'; ok.textContent = 'Decirlo ▸';
      ok.onclick = () => { dlg.yo(texto); decir(texto); setTimeout(siguiente, 650); };
      o.append(...extra.map(it => { const b = document.createElement('button'); b.textContent = it.texto; b.onclick = it.accion; return b; }), oir, ok);
    },
    /** Varias frases posibles: cada botón es una respuesta distinta. */
    frases(lista) {
      const o = $('#opciones'); o.innerHTML = '';
      const caja = document.createElement('div'); caja.className = 'frase';
      caja.innerHTML = '<span class="etiqueta">Elige qué decir:</span>'; o.append(caja);
      for (const it of lista) {
        const b = document.createElement('button'); b.textContent = it.texto; if (it.clase) b.className = it.clase;
        b.onclick = () => { if (!it.sinDecir) { dlg.yo(it.texto); decir(it.texto); } setTimeout(it.accion, it.sinDecir ? 0 : 650); };
        o.append(b);
      }
    },
    cerrar() { cerrar($('#dialogo')); },
  };
  const tras = (ms, fn) => setTimeout(fn, ms);

  /* ── Turnos (kiosco y pantalla) ──────────────────────────────────── */
  const turnos = {
    emitidos: { A: 14, P: 5 }, atendidos: { A: 11, P: 4 },
    llamados: [{ codigo: 'A-011', destino: 'Módulo 2' }, { codigo: 'P-004', destino: 'Caja 5' }, { codigo: 'A-010', destino: 'Módulo 1' }, { codigo: 'A-009', destino: 'Módulo 3' }],
    mio: null, proximo: 7, parpadeo: 0,
  };
  const codigo = (l, n) => `${l}-${String(n).padStart(3, '0')}`;
  function pintarPantalla() {
    const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    ctx.pantallaTurnos.userData.redibujar(R.pantallaTurnos({ llamados: turnos.llamados, parpadeo: turnos.parpadeo > 0 && Math.floor(turnos.parpadeo * 2.5) % 2 === 0, hora }));
  }
  function pintarMiTurno() {
    const t = turnos.mio, card = $('#mi-turno');
    if (!t) { card.hidden = true; return; }
    card.hidden = false; $('#mi-turno-codigo').textContent = t.codigo;
    const delante = t.n - turnos.atendidos[t.letra] - 1;
    $('#mi-turno-estado').textContent = t.destino ? `▶ Pase a: ${t.destino}` : delante > 0 ? `${delante} turno${delante > 1 ? 's' : ''} antes de usted` : 'Es el siguiente…';
    card.classList.toggle('llamado', !!t.destino);
  }
  function llamar(letra, n, destino, mio = false) {
    turnos.atendidos[letra] = Math.max(turnos.atendidos[letra], n);
    const c = codigo(letra, n);
    turnos.llamados.unshift({ codigo: c, destino, mio }); turnos.llamados.length = Math.min(turnos.llamados.length, 5);
    turnos.parpadeo = 4;
    const numero = destino.replace(/\D/g, ''), dentro = jugador.z < 0;
    if (dentro || mio) timbre();
    if (mio) tras(900, () => decir(`Turno ${letra}, ${enLetras(n)}. ${destino.startsWith('Caja') ? 'Caja' : 'Módulo'} ${enLetras(+numero)}.`));
    if (destino.startsWith('Caja')) encender(+numero, c, mio);
    log('llamada', { codigo: c, destino, mio });
    pintarPantalla(); pintarMiTurno();
  }
  function sacarTurno(letra) {
    if (turnos.mio && !turnos.mio.atendido) { toast(`Ya tiene un turno: ${turnos.mio.codigo}`); return turnos.mio; }
    const n = ++turnos.emitidos[letra];
    const servicio = letra === 'A' ? 'Atención al cliente' : 'Caja preferencial';
    turnos.mio = { letra, n, codigo: codigo(letra, n), servicio, destino: null, atendido: false };
    turnos.proximo = Math.min(turnos.proximo, 5);
    const delante = n - turnos.atendidos[letra] - 1;
    ctx.kiosco.pantalla.userData.redibujar(R.pantallaKiosco({ pulsado: letra, mensaje: `Su turno: ${turnos.mio.codigo}. Retire su tique.` }));
    tras(3500, () => ctx.kiosco.pantalla.userData.redibujar(R.pantallaKiosco()));
    toast(`🎫 Su turno es ${turnos.mio.codigo} · ${servicio} · ${delante} antes de usted`, 4200);
    comprobante('Tique de turno', [['Su turno', `<b style="font-size:28px">${turnos.mio.codigo}</b>`], ['Servicio', servicio], ['Turnos antes de usted', String(delante)]],
      letra === 'A' ? 'Espere en las sillas. Le llamarán en la pantalla.' : 'Espere cerca de la caja 5. Le llamarán en la pantalla.');
    $('#comp-titulo').textContent = 'Banco Horizonte';
    log('turno', { ...turnos.mio, delante });
    pintarMiTurno();
    return turnos.mio;
  }
  function avanzarTurnos() {
    const t = turnos.mio;
    if (t && !t.destino && !t.atendido && t.n === turnos.atendidos[t.letra] + 1) {
      const destino = t.letra === 'A' ? `Módulo ${1 + Math.floor(Math.random() * 3)}` : 'Caja 5';
      t.destino = destino; llamar(t.letra, t.n, destino, true);
      toast(`🔔 ¡Es su turno! ${t.codigo} · Pase a ${destino.replace('Caja', 'la caja').replace('Módulo', 'el módulo')}`, 6000, 'llamada');
      return;
    }
    // Llamadas de otros clientes (el banco sigue funcionando).
    const letra = Math.random() < .72 ? 'A' : 'P';
    if (turnos.atendidos[letra] >= turnos.emitidos[letra]) turnos.emitidos[letra] += 1 + Math.floor(Math.random() * 2);
    if (t && !t.atendido && letra === t.letra && turnos.atendidos[letra] + 1 >= t.n) return avanzarTurnos();
    llamar(letra, turnos.atendidos[letra] + 1, letra === 'A' ? `Módulo ${1 + Math.floor(Math.random() * 3)}` : 'Caja 5');
  }
  document.querySelectorAll('#kiosco [data-servicio]').forEach(b => { b.onclick = () => { cerrar($('#kiosco')); sacarTurno(b.dataset.servicio); }; });

  /* ── Cajas: número iluminado y letrero de llamada ────────────────── */
  const cajas = { llamada: null, ambiente: 9, hizoFila: false, preferente: false, enEspera: 0 };
  function pintarNumero(i, llama) {
    const n = ctx.numerosCaja[i - 1]; if (!n) return;
    n.userData.redibujar(R.numeroCaja(i, { llama, cerrada: i === M.cerrada, preferente: i === M.preferente }));
  }
  function pintarLlamada(parpadeo = false) {
    const l = cajas.llamada;
    ctx.panelLlamada.userData.redibujar(R.panelLlamada(l ? { caja: l.caja, codigo: l.codigo, parpadeo } : {}));
  }
  function encender(caja, cod = 'Siguiente', mio = false, duracion = mio ? 90 : 6) {
    if (cajas.llamada) pintarNumero(cajas.llamada.caja, false);
    cajas.llamada = { caja, codigo: cod, mio, t: duracion };
    pintarNumero(caja, true); pintarLlamada(true);
  }
  function apagar() { if (cajas.llamada) pintarNumero(cajas.llamada.caja, false); cajas.llamada = null; pintarLlamada(); }
  function llamarAlJugador() {
    const libres = [2, 3, 4];
    const caja = cajas.preferente ? 5 : libres[Math.floor(Math.random() * libres.length)];
    encender(caja, 'Siguiente', true); timbre();
    tras(800, () => decir(`Siguiente, por favor. Caja ${enLetras(caja)}.`));
    toast(`🔔 Le llaman: pase a la caja ${caja}`, 5000, 'llamada');
    log('llamada', { codigo: 'fila', destino: `Caja ${caja}`, mio: true });
  }

  /* ── Ventanilla ──────────────────────────────────────────────────── */
  function ventanilla(caja) {
    const cajero = NOMBRES_CAJA[caja], quien = `${cajero} · Caja ${caja}`;
    if (caja === M.cerrada) { toast('Esta caja está cerrada. Pase a otra ventanilla.'); decir('Esta caja está cerrada.'); return; }
    const llamadoAqui = cajas.llamada?.mio && cajas.llamada.caja === caja;
    const turnoP = turnos.mio?.letra === 'P' && turnos.mio.destino === 'Caja 5' && caja === 5 && !turnos.mio.atendido;
    dlg.abrir(`Caja ${caja}`, `Le atiende ${cajero}`);
    if (!llamadoAqui && !turnoP && cajas.llamada?.mio) {
      dlg.ellos(`${saludo()}. Disculpe, a usted le llamaron en la caja ${cajas.llamada.caja}. Es aquella, la del número verde.`, quien);
      dlg.opciones([{ texto: 'Gracias', clase: 'primario', accion: () => dlg.cerrar() }]);
      return;
    }
    if (!llamadoAqui && !turnoP) {
      dlg.ellos(`${saludo()}. Disculpe, por favor haga la fila y espere a que le llamen. ¡Enseguida le atendemos!`, quien);
      dlg.opciones([{ texto: 'Ir al inicio de la fila', clase: 'primario', accion: () => { dlg.cerrar(); ir(VISTAS.find(v => v.id === 'fila')); } },
        { texto: 'De acuerdo', accion: () => dlg.cerrar() }]);
      return;
    }
    if (cajas.llamada) cajas.llamada.t = 999;           // la caja espera mientras le atienden
    dlg.ellos(`${saludo()}, bienvenido a Banco Horizonte. ¿En qué le puedo ayudar?`, quien);
    menuVentanilla(caja, quien);
  }
  function menuVentanilla(caja, quien) {
    dlg.opciones([
      { texto: '💵 Depositar dinero', accion: () => operacion('deposito', caja, quien) },
      { texto: '💸 Retirar dinero', accion: () => operacion('retiro', caja, quien) },
      { texto: '🧾 Pagar un servicio', accion: () => operacion('pago', caja, quien) },
      { texto: '💱 Cambiar dólares', accion: () => operacion('cambio', caja, quien) },
      { texto: '📄 Consultar el saldo', accion: () => operacion('saldo', caja, quien) },
    ]);
  }
  function despedida(caja, quien) {
    dlg.opciones([
      { texto: 'Otra operación', accion: () => { dlg.frase('Sí, también quisiera hacer otra operación.', () => { dlg.ellos('Claro, dígame.', quien); menuVentanilla(caja, quien); }); } },
      { texto: 'Terminar', clase: 'primario', accion: () => dlg.frase('No, eso es todo. Muchas gracias.', () => {
        dlg.ellos('A usted. ¡Que tenga un buen día!', quien);
        dlg.opciones([{ texto: 'Salir de la ventanilla', clase: 'primario', accion: () => dlg.cerrar() }]);
        if (turnos.mio?.letra === 'P' && caja === 5) { turnos.mio.atendido = true; turnos.mio = null; pintarMiTurno(); }
        cajas.hizoFila = false; cajas.preferente = false; apagar();
        log('operacion', { caja, fin: true });
      }) },
    ]);
  }
  function operacion(tipo, caja, quien) {
    const cajero = NOMBRES_CAJA[caja];
    const cerrarCon = (titulo, lineas) => tras(900, () => { comprobante(titulo, [...lineas, ['Caja', String(caja)], ['Le atendió', cajero]]); despedida(caja, quien); });
    if (tipo === 'deposito' && ficha) {
      const m = ficha.importe, f = ficha;
      dlg.frase(`Quisiera depositar ${dinero(m)} en mi cuenta. Aquí tiene mi ficha.`, () => {
        dlg.ellos(`Gracias, veo que ya llenó su ficha, ${f.nombre.split(' ')[0]}. ¿Me da el efectivo, por favor?`, quien);
        dlg.frase('Sí, aquí tiene.', () => {
          saldo += m; actualizarSaldo(); ficha = null; log('operacion', { tipo, monto: m, caja, saldo, ficha: true });
          dlg.ellos(`Son ${dinero(m)}, correcto. Le sello su ficha y aquí tiene su comprobante. ¿Algo más?`, quien);
          cerrarCon('Depósito en efectivo', [['Titular', f.nombre], ['Cuenta', '•••• 4821'], ['Importe', pesos(m), 'total'], ['Saldo disponible', pesos(saldo)]]);
        });
      });
    } else if (tipo === 'deposito') {
      dlg.opciones([200, 500, 1000, 2500].map(m => ({ texto: pesos(m), clase: 'monto', accion: () => {
        dlg.frase(`Quisiera depositar ${dinero(m)} en mi cuenta, por favor.`, () => {
          dlg.ellos('Con gusto. ¿Me permite su identificación y el efectivo, por favor?', quien);
          dlg.frase('Sí, aquí tiene.', () => {
            saldo += m; actualizarSaldo(); log('operacion', { tipo, monto: m, caja, saldo });
            dlg.ellos(`Muy bien, son ${dinero(m)}. Ya quedaron en su cuenta. Aquí tiene su comprobante. ¿Algo más?`, quien);
            cerrarCon('Depósito en efectivo', [['Cuenta', '•••• 4821'], ['Importe', pesos(m), 'total'], ['Saldo disponible', pesos(saldo)]]);
          });
        });
      } })));
    } else if (tipo === 'retiro') {
      dlg.opciones([300, 500, 1000, 2000].map(m => ({ texto: pesos(m), clase: 'monto', accion: () => {
        dlg.frase(`Quisiera retirar ${dinero(m)} de mi cuenta, por favor.`, () => {
          if (m > saldo) { dlg.ellos(`Lo siento, su saldo no alcanza. Tiene ${dinero(saldo)} disponibles.`, quien); tras(700, () => menuVentanilla(caja, quien)); return; }
          dlg.ellos('Claro. ¿Me permite su identificación, por favor? Y firme aquí.', quien);
          dlg.frase('Sí, aquí tiene.', () => {
            saldo -= m; actualizarSaldo(); log('operacion', { tipo, monto: m, caja, saldo });
            dlg.ellos(`Aquí tiene sus ${dinero(m)}. Por favor, cuéntelos antes de retirarse de la ventanilla.`, quien);
            dlg.frase('Están completos. Gracias.', () => {
              dlg.ellos('Perfecto. Aquí tiene su comprobante. ¿Algo más?', quien);
              cerrarCon('Retiro en ventanilla', [['Cuenta', '•••• 4821'], ['Importe', pesos(m), 'total'], ['Saldo disponible', pesos(saldo)]]);
            });
          });
        });
      } })));
    } else if (tipo === 'pago') {
      const recibos = [['la luz', 438.5], ['el agua', 186], ['el teléfono', 399], ['el internet', 549]];
      dlg.opciones(recibos.map(([s, m]) => ({ texto: `Recibo de ${s.split(' ')[1]}`, accion: () => {
        dlg.frase(`Quisiera pagar el recibo de ${s}, por favor.`, () => {
          dlg.ellos(`Claro, ¿me da su recibo? … Son ${dinero(m)}. ¿Paga en efectivo o con cargo a su cuenta?`, quien);
          const pagar = cargo => {
            if (cargo) { saldo -= m; actualizarSaldo(); }
            log('operacion', { tipo, servicio: s, monto: m, cargo, caja, saldo });
            dlg.ellos('Listo, su pago quedó registrado. Aquí tiene su comprobante. ¿Algo más?', quien);
            cerrarCon('Pago de servicio', [['Servicio', `Recibo de ${s.split(' ')[1]}`], ['Forma de pago', cargo ? 'Cargo a cuenta' : 'Efectivo'], ['Importe', pesos(m), 'total']]);
          };
          dlg.frases([{ texto: 'En efectivo.', accion: () => pagar(false) }, { texto: 'Con cargo a mi cuenta, por favor.', accion: () => pagar(true) }]);
        });
      } })));
    } else if (tipo === 'cambio') {
      const tc = 17.85;
      dlg.opciones([50, 100, 200].map(d => ({ texto: `${d} dólares`, clase: 'monto', accion: () => {
        dlg.frase(`Quisiera cambiar ${enLetras(d)} dólares a pesos, por favor.`, () => {
          const total = Math.round(d * tc * 100) / 100;
          dlg.ellos(`Con gusto. Hoy le compramos el dólar a diecisiete pesos con ochenta y cinco centavos. Serían ${dinero(total)}. ¿Está bien?`, quien);
          dlg.frase('Sí, está bien.', () => {
            dlg.ellos('¿Me permite una identificación y los dólares, por favor?', quien);
            dlg.frase('Aquí tiene.', () => {
              log('operacion', { tipo, dolares: d, pesos: total, caja });
              dlg.ellos(`Aquí tiene sus ${dinero(total)}. Cuéntelos, por favor. ¿Algo más?`, quien);
              cerrarCon('Compra de divisas', [['Divisa', `USD ${d}.00`], ['Tipo de cambio', '17.85'], ['Entregado', pesos(total), 'total']]);
            });
          });
        });
      } })));
    } else {
      dlg.frase('Quisiera consultar el saldo de mi cuenta, por favor.', () => {
        dlg.ellos('Con gusto. ¿Me permite su tarjeta o su identificación?', quien);
        dlg.frase('Aquí tiene.', () => {
          dlg.ellos(`Su saldo disponible es de ${dinero(saldo)}. Aquí tiene la impresión. ¿Algo más?`, quien);
          log('operacion', { tipo, caja, saldo });
          cerrarCon('Consulta de saldo', [['Cuenta', '•••• 4821'], ['Saldo disponible', pesos(saldo), 'total']]);
        });
      });
    }
  }

  /* ── Ficha de depósito (mesa de formularios) ─────────────────────── */
  let ficha = null;
  function llenarFicha() {
    dlg.abrir('Ficha de depósito', 'Llénela aquí y llévela a la caja. El importe se escribe con número y con letra.');
    const o = $('#opciones'); o.innerHTML = '';
    const form = document.createElement('form'); form.className = 'ficha';
    form.innerHTML = `
      <label>Nombre del titular <input name="nombre" required maxlength="40" placeholder="Por ejemplo: Ana López"></label>
      <label>Número de cuenta <input name="cuenta" value="0482 1136 4821" readonly></label>
      <label>Importe (con número) <span class="pesos">$ <input name="importe" type="number" min="100" max="9900" step="100" required placeholder="500"></span></label>
      <label>Importe (con letra) <input name="letra" required placeholder="quinientos pesos"></label>
      <label>Firma <input name="firma" required maxlength="30" placeholder="Escriba su nombre como firma"></label>
      <p class="aviso" aria-live="polite"></p>
      <div class="botones"><button type="button" class="ayuda">Ver cómo se escribe</button><button class="primario">Guardar la ficha</button></div>`;
    o.append(form);
    const aviso = form.querySelector('.aviso');
    const normal = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').replace(/ (m\.?n\.?|pesos?|00\/100)/g, '').trim();
    form.querySelector('.ayuda').onclick = () => {
      const m = +form.importe.value;
      aviso.textContent = m ? `${pesos(m)} se escribe: «${dinero(m)}».` : 'Primero escriba el importe con número.';
    };
    form.onsubmit = e => {
      e.preventDefault();
      const m = +form.importe.value;
      if (!(m >= 100 && m % 100 === 0)) { aviso.textContent = 'El importe debe ser de cien en cien pesos (100, 200, 500…).'; return; }
      if (normal(form.letra.value) !== normal(enLetras(m))) { aviso.textContent = `Revise el importe con letra: ${pesos(m)} no se escribe «${form.letra.value}».`; return; }
      ficha = { nombre: form.nombre.value.trim(), importe: m, firma: form.firma.value.trim() };
      log('ficha', ficha);
      dlg.ellos(`¡Ficha lista! Depósito de ${dinero(m)} a nombre de ${ficha.nombre}. Ahora haga la fila para las cajas.`, 'Ficha de depósito');
      dlg.opciones([{ texto: 'Ir a la fila', clase: 'primario', accion: () => { dlg.cerrar(); ir(VISTAS.find(v => v.id === 'fila')); } }, { texto: 'Cerrar', accion: () => dlg.cerrar() }]);
    };
    form.nombre.focus();
  }

  /* ── Información ─────────────────────────────────────────────────── */
  function informacion() {
    const quien = 'Información';
    dlg.abrir('Módulo de información', 'Aquí le orientan: a qué fila ir, qué turno sacar');
    log('informacion', {});
    dlg.ellos(`¡${saludo()}! Bienvenido a Banco Horizonte. ¿En qué le puedo ayudar?`, quien);
    const preguntas = () => dlg.frases([
      { texto: 'Quiero hacer un depósito.', accion: () => { dlg.ellos('Para depósitos, retiros y pagos, haga la fila única para las cajas. El inicio de la fila está ahí, a su izquierda.', quien); otra([{ texto: 'Ir a la fila', accion: () => { dlg.cerrar(); ir(VISTAS.find(v => v.id === 'fila')); } }]); } },
      { texto: 'Quiero abrir una cuenta.', accion: () => { dlg.ellos('¡Con gusto! Saque un turno de Atención al cliente en el kiosco y espere en las sillas. Le llamarán en la pantalla.', quien); otra([{ texto: 'Sacar turno', accion: () => { dlg.cerrar(); abrir('#kiosco'); } }]); } },
      { texto: '¿Dónde están los cajeros automáticos?', accion: () => { dlg.ellos('Están en el vestíbulo, junto a la entrada. Funcionan las veinticuatro horas.', quien); otra(); } },
      { texto: '¿A qué hora cierran?', accion: () => { dlg.ellos('Abrimos de lunes a viernes de ocho y media a cuatro de la tarde, y los sábados de nueve a una.', quien); otra(); } },
      { texto: '¿A cuánto está el dólar?', accion: () => { dlg.ellos('Hoy compramos el dólar a diecisiete ochenta y cinco y lo vendemos a dieciocho sesenta y dos. Lo ve en la pantalla, junto a la fila.', quien); otra(); } },
    ]);
    const otra = (extra = []) => tras(500, () => dlg.opciones([...extra, { texto: 'Otra pregunta', accion: preguntas },
      { texto: 'Gracias', clase: 'primario', accion: () => dlg.frase('Muchas gracias, muy amable.', () => { dlg.ellos('¡Para servirle!', quien); tras(1400, () => dlg.cerrar()); }) }]));
    preguntas();
  }

  /* ── Módulo de atención al cliente ───────────────────────────────── */
  function modulo(n) {
    const quien = `${ASESOR[n]} · Módulo ${n}`;
    dlg.abrir(`Atención al cliente · Módulo ${n}`, `Le atiende ${ASESOR[n]}`);
    const t = turnos.mio;
    if (!t || t.letra !== 'A' || t.destino !== `Módulo ${n}`) {
      dlg.ellos(t?.letra === 'A' && !t.destino ? `Hola. Todavía no es su turno: espere en las sillas a que aparezca el ${t.codigo} en la pantalla.`
        : t?.destino && t.letra === 'A' ? `Hola. Su turno es en el ${t.destino.toLowerCase()}, por favor.`
        : 'Hola. Para ser atendido, saque un turno de Atención al cliente en el kiosco, por favor.', quien);
      dlg.opciones([{ texto: 'De acuerdo', clase: 'primario', accion: () => dlg.cerrar() }]);
      return;
    }
    dlg.ellos(`${saludo()}, tome asiento, por favor. ¿En qué le puedo ayudar?`, quien);
    const fin = () => tras(700, () => dlg.opciones([{ texto: 'Terminar', clase: 'primario', accion: () => dlg.frase('Muchas gracias por su ayuda.', () => {
      dlg.ellos('Con mucho gusto. ¡Hasta luego!', quien); t.atendido = true; turnos.mio = null; pintarMiTurno(); tras(1500, () => dlg.cerrar());
    }) }]));
    dlg.frases([
      { texto: 'Quiero abrir una cuenta de ahorro.', accion: () => {
        dlg.ellos('¡Perfecto! Necesito su identificación oficial, un comprobante de domicilio y su CURP. El depósito mínimo es de quinientos pesos.', quien);
        dlg.frase('Aquí tiene mis documentos.', () => { dlg.ellos('Muy bien. Firme aquí y aquí… ¡Listo! Su cuenta ya está abierta. Su tarjeta llega en cinco días hábiles.', quien); log('operacion', { tipo: 'apertura', modulo: n }); fin(); });
      } },
      { texto: 'Quiero solicitar una tarjeta de crédito.', accion: () => {
        dlg.ellos('Claro. ¿Tiene un comprobante de ingresos? Con eso revisamos su solicitud hoy mismo.', quien);
        dlg.frase('Sí, traigo mis recibos de nómina.', () => { dlg.ellos('Excelente. Su solicitud quedó registrada; le llamaremos en tres días para darle la respuesta.', quien); log('operacion', { tipo: 'tarjeta', modulo: n }); fin(); });
      } },
      { texto: 'Tengo un cargo que no reconozco.', accion: () => {
        dlg.ellos('Vamos a levantar una aclaración. ¿Me dice la fecha y el monto del cargo?', quien);
        dlg.frase('Fue el lunes pasado, por trescientos pesos.', () => { dlg.ellos('Listo. Su número de folio es cuatro, ocho, dos, uno, tres. Le responderemos en diez días hábiles.', quien); log('operacion', { tipo: 'aclaracion', modulo: n }); fin(); });
      } },
    ]);
  }

  /* ── Cajero automático ───────────────────────────────────────────── */
  const atm = { paso: 'inicio', nip: '', numero: 1, otra: '' };
  function pantallaATM(html, vocab = '') { $('#atm-cuerpo').innerHTML = html; $('#atm-vocab').textContent = vocab; }
  function botonesATM(lista) {
    const d = document.createElement('div'); d.className = 'atm-menu';
    for (const [t, fn] of lista) { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; d.append(b); }
    $('#atm-cuerpo').append(d);
  }
  function cajero(numero = 1) {
    atm.numero = numero; atm.nip = ''; abrir('#atm'); pasoATM('inicio');
    log('cajero', { numero, paso: 'inicio' });
  }
  function pasoATM(paso, dato) {
    atm.paso = paso;
    if (paso === 'inicio') {
      pantallaATM('<h3>Bienvenido</h3><p>Inserte su tarjeta</p>', 'insertar la tarjeta = meterla en la ranura');
      botonesATM([['💳 Insertar tarjeta', () => pasoATM('nip')]]);
    } else if (paso === 'nip') {
      atm.nip = '';
      pantallaATM('<h3>Digite su NIP</h3><p class="nip" id="nip">_ _ _ _</p><p>Cubra el teclado con la mano</p>', 'el NIP = el número de identificación personal (su clave secreta)');
    } else if (paso === 'menu') {
      pantallaATM('<h3>Seleccione una operación</h3>', 'la operación = lo que quiere hacer');
      botonesATM([['Retiro de efectivo', () => pasoATM('retiro')], ['Consulta de saldo', () => pasoATM('saldo')], ['Depósito en efectivo', () => pasoATM('deposito')],
        ['Cambio de NIP', () => { pantallaATM('<h3>Operación no disponible</h3><p>Acuda a una ventanilla.</p>', 'no disponible = no se puede hacer aquí'); botonesATM([['Volver', () => pasoATM('menu')]]); }]]);
    } else if (paso === 'retiro') {
      pantallaATM('<h3>¿Cuánto desea retirar?</h3>', 'retirar = sacar dinero de la cuenta');
      botonesATM([...[200, 500, 1000, 2000].map(m => [pesos(m), () => pasoATM('comprobante?', m)]), ['Otra cantidad', () => pasoATM('otra')], ['Cancelar', () => pasoATM('tarjeta')]]);
    } else if (paso === 'otra') {
      atm.otra = '';
      pantallaATM('<h3>Escriba la cantidad</h3><p class="nip" id="nip">$0</p><p>Múltiplos de $100 · Pulse Aceptar</p>', 'la cantidad = cuánto dinero');
    } else if (paso === 'comprobante?') {
      pantallaATM(`<h3>¿Desea imprimir su comprobante?</h3><p>Retiro de ${pesos(dato)}</p>`, 'imprimir = sacar en papel');
      botonesATM([['Sí', () => retirar(dato, true)], ['No', () => retirar(dato, false)]]);
    } else if (paso === 'saldo') {
      pantallaATM(`<h3>Su saldo disponible</h3><p class="nip">${pesos(saldo)}</p>`, 'el saldo = el dinero que tiene en su cuenta');
      botonesATM([['Otra operación', () => pasoATM('menu')], ['Terminar', () => pasoATM('tarjeta')]]);
      log('cajero', { numero: atm.numero, paso: 'saldo', saldo });
    } else if (paso === 'deposito') {
      pantallaATM('<h3>Depósito en efectivo</h3><p>Coloque sus billetes en la bandeja</p>', 'la bandeja = donde se ponen los billetes');
      botonesATM([200, 500, 1000].map(m => [`Depositar ${pesos(m)}`, () => {
        saldo += m; actualizarSaldo(); log('cajero', { numero: atm.numero, paso: 'deposito', monto: m, saldo });
        pantallaATM(`<h3>Depósito recibido</h3><p>${pesos(m)} · Saldo: ${pesos(saldo)}</p>`, 'recibido = el banco ya lo tiene');
        botonesATM([['Otra operación', () => pasoATM('menu')], ['Terminar', () => pasoATM('tarjeta')]]);
      }]));
    } else if (paso === 'tarjeta') {
      pantallaATM('<h3>Retire su tarjeta</h3><p>No olvide su tarjeta</p>', 'retirar la tarjeta = sacarla del cajero');
      botonesATM([['💳 Retirar la tarjeta', () => { pantallaATM('<h3>Gracias por usar Banco Horizonte</h3><p>¡Que tenga un buen día!</p>'); tras(1600, () => cerrar($('#atm'))); }]]);
    }
  }
  function retirar(m, conComprobante) {
    if (m > saldo) { pantallaATM(`<h3>Fondos insuficientes</h3><p>Saldo disponible: ${pesos(saldo)}</p>`, 'fondos insuficientes = no tiene bastante dinero'); botonesATM([['Volver', () => pasoATM('retiro')]]); return; }
    saldo -= m; actualizarSaldo(); log('cajero', { numero: atm.numero, paso: 'retiro', monto: m, saldo });
    pantallaATM('<h3>Retire su tarjeta</h3><p>Su efectivo saldrá a continuación</p>', 'el efectivo = los billetes');
    botonesATM([['💳 Retirar la tarjeta', () => {
      pantallaATM(`<h3>Retire su efectivo</h3><p class="nip">${pesos(m)}</p>`, 'retire su efectivo = tome los billetes');
      botonesATM([['💵 Tomar el dinero', () => {
        pantallaATM('<h3>Gracias por usar Banco Horizonte</h3><p>¡Que tenga un buen día!</p>');
        tras(1200, () => { cerrar($('#atm')); if (conComprobante) comprobante(`Cajero automático ${atm.numero}`, [['Operación', 'Retiro de efectivo'], ['Tarjeta', '•••• 4821'], ['Importe', pesos(m), 'total'], ['Saldo disponible', pesos(saldo)]], 'Guarde este comprobante.'); });
      }]]);
    }]]);
  }
  // teclado físico del cajero
  {
    const tec = $('#atm-teclado');
    const teclas = ['1', '2', '3', 'Cancelar', '4', '5', '6', 'Borrar', '7', '8', '9', 'Aceptar', '', '0', '', ''];
    for (const k of teclas) {
      const b = document.createElement('button'); b.textContent = k; if (!k) { b.disabled = true; b.style.visibility = 'hidden'; }
      if (k === 'Cancelar') b.className = 'cancelar'; if (k === 'Borrar') b.className = 'borrar'; if (k === 'Aceptar') b.className = 'aceptar';
      b.onclick = () => teclaATM(k); tec.append(b);
    }
  }
  function teclaATM(k) {
    if (k === 'Cancelar') { pasoATM(atm.paso === 'inicio' || atm.paso === 'nip' ? 'inicio' : 'tarjeta'); if (atm.paso === 'inicio') cerrar($('#atm')); return; }
    if (atm.paso === 'nip') {
      if (k === 'Borrar') atm.nip = atm.nip.slice(0, -1);
      else if (k === 'Aceptar') { if (atm.nip.length === 4) pasoATM('menu'); return; }
      else if (/\d/.test(k) && atm.nip.length < 4) atm.nip += k;
      const n = $('#nip'); if (n) n.textContent = ('•'.repeat(atm.nip.length) + '____'.slice(atm.nip.length)).split('').join(' ');
      if (atm.nip.length === 4) $('#atm-vocab').textContent = 'Pulse Aceptar (verde) para continuar';
    } else if (atm.paso === 'otra') {
      if (k === 'Borrar') atm.otra = atm.otra.slice(0, -1);
      else if (k === 'Aceptar') { const m = +atm.otra; if (m >= 100 && m % 100 === 0 && m <= 9000) pasoATM('comprobante?', m); else $('#atm-vocab').textContent = 'La cantidad debe ser múltiplo de $100 (máximo $9,000).'; return; }
      else if (/\d/.test(k) && atm.otra.length < 4) atm.otra += k;
      const n = $('#nip'); if (n) n.textContent = `$${atm.otra || 0}`;
    }
  }

  /* ── Botón de acción según dónde estás ───────────────────────────── */
  let accionActual = null;
  function calcularAccion() {
    const { x, z } = jugador;
    const d = (a, b) => Math.hypot(x - a, z - b);
    if (d(KIOSCO.x + Math.sin(KIOSCO.ry) * .6, KIOSCO.z + Math.cos(KIOSCO.ry) * .6) < 1.0) return { clave: 'kiosco', texto: '🎫 Sacar turno', fn: () => abrir('#kiosco') };
    if (d(INFORMACION.x - .55, INFORMACION.z + .75) < 1.25) return { clave: 'info', texto: '💬 Preguntar en Información', fn: () => { mirar(INFORMACION.x, INFORMACION.z); informacion(); } };
    if (z < M.z + 1.3 && z > M.z - .1) for (let i = 1; i <= M.n; i++) if (Math.abs(x - centroCaja(i)) < M.ancho / 2 - .15)
      return { clave: `caja${i}`, texto: i === M.cerrada ? '🚫 Caja 1 cerrada' : `💬 Hablar con el cajero · Caja ${i}`, fn: () => { mirar(centroCaja(i), M.z - 1); ventanilla(i); } };
    if (x < EDIFICIO.x0 + 1.6 && z > -3.5 && z < 0) for (let k = 0; k < 3; k++) if (Math.abs(z - ZATM[k]) < .5)
      return { clave: `atm${k}`, texto: `🏧 Usar el cajero automático ${k + 1}`, fn: () => { mirar(EDIFICIO.x0, ZATM[k]); cajero(k + 1); } };
    if (Math.abs(x - .9) < 1.5 && Math.abs(z + 2) < 1.3)
      return { clave: 'ficha', texto: ficha ? '✍️ Llenar otra ficha de depósito' : '✍️ Llenar una ficha de depósito', fn: () => { mirar(.9, -2); llenarFicha(); } };
    for (const { z: zm, modulo: n } of ASESORES) if (x > EDIFICIO.x1 - 3.2 && Math.abs(z - zm) < .9)
      return { clave: `mod${n}`, texto: `💬 Hablar con el asesor · Módulo ${n}`, fn: () => { mirar(EDIFICIO.x1 - 1, zm); modulo(n); } };
    return null;
  }
  $('#accion').onclick = () => accionActual?.fn();

  /* ── Nombres de los objetos ──────────────────────────────────────── */
  function objeto(nombre, malla, golpe) {
    if (malla?.userData?.kiosco && golpe?.uv) {
      const { x: u, y: v } = golpe.uv;
      if (u > .08 && u < .92) {
        if (v > .5 && v < .71) return sacarTurno('A');
        if (v > .25 && v < .46) return sacarTurno('P');
      }
    }
    if (!nombre) return;
    const n = $('#nombre'); n.innerHTML = ''; n.append(nombre); n.hidden = false;
    clearTimeout(temporizadorNombre); temporizadorNombre = setTimeout(() => { n.hidden = true; }, 2600);
    decir(nombre);
    log('objeto', { nombre });
    if (/cajero automático/.test(nombre) && jugador.x < -3.4 && jugador.z > -3.6 && jugador.z < 0) {
      const k = ZATM.reduce((b, zz, i) => Math.abs(golpe.point.z - zz) < Math.abs(golpe.point.z - ZATM[b]) ? i : b, 0);
      cajero(k + 1);
    }
  }

  /* ── Cuadro a cuadro ─────────────────────────────────────────────── */
  let relojTurnos = 6, relojPantalla = 0, relojAccion = 0, relojReloj = 0, relojParpadeo = 0;
  pintarPantalla(); pintarLlamada();
  function cuadro(dt) {
    const modal = !!document.querySelector('.modal:not([hidden])');
    // pantalla de turnos: una llamada cada 9–15 s
    relojTurnos -= dt;
    if (relojTurnos <= 0 && !modal) { avanzarTurnos(); relojTurnos = 9 + Math.random() * 6; }
    if (turnos.parpadeo > 0) {
      turnos.parpadeo -= dt; relojPantalla -= dt;
      if (relojPantalla <= 0) { pintarPantalla(); relojPantalla = .2; }
      if (turnos.parpadeo <= 0) pintarPantalla();
    }
    // fila: se marca al pasar por los carriles; «Espere aquí» llama al jugador
    const { x, z } = jugador;
    if (x > FILA.x0 && x < FILA.x1 && z < FILA.cintas[0] && z > FILA.cintas[3]) cajas.hizoFila = true;
    if (x > FILA_PREF.x0 && x < FILA_PREF.x1 && z < FILA_PREF.z0 && z > FILA_PREF.z1) { cajas.hizoFila = true; cajas.preferente = true; }
    const enEspera = x > -.9 && x < 1.9 && z < FILA.cintas[3] + .05 && z > FILA.esperaZ - .55;
    if (enEspera && !(cajas.llamada?.mio)) {
      cajas.enEspera += dt;
      if (!cajas.hizoFila && cajas.enEspera > 1.2 && cajas.enEspera - dt <= 1.2) toast('Primero haga la fila: el inicio está junto a la entrada.', 3600);
      if (cajas.hizoFila && cajas.enEspera > 2.5) { llamarAlJugador(); cajas.enEspera = 0; }
    } else if (!enEspera) cajas.enEspera = 0;
    // llamadas de ambiente a las cajas (otros clientes) y parpadeo del letrero
    if (cajas.llamada) {
      cajas.llamada.t -= dt; relojParpadeo -= dt;
      if (relojParpadeo <= 0) { relojParpadeo = .45; pintarLlamada(Math.floor(performance.now() / 450) % 2 === 0); }
      if (cajas.llamada.t <= 0) apagar();
    } else if ((cajas.ambiente -= dt) <= 0 && !modal) {
      cajas.ambiente = 11 + Math.random() * 8;
      encender([2, 3, 4][Math.floor(Math.random() * 3)]);
    }
    // botón de acción
    relojAccion -= dt;
    if (relojAccion <= 0) {
      relojAccion = .15;
      accionActual = modal ? null : calcularAccion();
      const b = $('#accion');
      if (!accionActual) b.hidden = true; else { b.hidden = false; if (b.dataset.clave !== accionActual.clave) { b.textContent = `${accionActual.texto}  (E)`; b.dataset.clave = accionActual.clave; } }
    }
    // reloj de pared
    relojReloj -= dt;
    if (relojReloj <= 0 && ctx.reloj) { relojReloj = 1; ctx.reloj.userData.redibujar(R.reloj(new Date())); }
  }

  /* ── Misiones: lo que un cliente hace en el banco ────────────────── */
  const MISIONES = [
    { id: 'info', texto: 'Pregunta algo en Información', evento: 'informacion' },
    { id: 'ficha', texto: 'Llena una ficha de depósito', evento: 'ficha' },
    { id: 'deposito', texto: 'Haz la fila y deposita en caja', evento: 'operacion', si: d => d.tipo === 'deposito' },
    { id: 'cambio', texto: 'Cambia dólares en ventanilla', evento: 'operacion', si: d => d.tipo === 'cambio' },
    { id: 'turno', texto: 'Saca un turno en el kiosco', evento: 'turno' },
    { id: 'asesor', texto: 'Habla con un asesor cuando te llamen', evento: 'operacion', si: d => d.modulo },
    { id: 'atm', texto: 'Retira dinero en el cajero automático', evento: 'cajero', si: d => d.paso === 'retiro' },
  ];
  const CLAVE_MISIONES = 'banco.misiones.v1';
  let hechas = new Set();
  try { hechas = new Set(JSON.parse(localStorage.getItem(CLAVE_MISIONES) || '[]')); } catch { hechas = new Set(); }
  function pintarMisiones() {
    const ul = $('#misiones'); if (!ul) return;
    ul.innerHTML = '';
    for (const m of MISIONES) { const li = document.createElement('li'); li.textContent = m.texto; if (hechas.has(m.id)) li.className = 'hecha'; ul.append(li); }
    $('#misiones-cuenta').textContent = `${hechas.size} / ${MISIONES.length}`;
  }
  for (const m of MISIONES) document.addEventListener(`banco:${m.evento}`, e => {
    if (hechas.has(m.id) || (m.si && !m.si(e.detail || {}))) return;
    hechas.add(m.id); pintarMisiones();
    try { localStorage.setItem(CLAVE_MISIONES, JSON.stringify([...hechas])); } catch { /* sin almacenamiento */ }
    tras(1200, () => toast(`✅ Misión cumplida: ${m.texto}`, 3200));
  });
  $('#misiones-reiniciar')?.addEventListener('click', () => { hechas.clear(); try { localStorage.removeItem(CLAVE_MISIONES); } catch { /* */ } pintarMisiones(); });
  pintarMisiones();

  const api = {
    ir: id => ir(VISTAS.find(v => v.id === id) || VISTAS[0]), sacarTurno, llamar: () => llamarAlJugador(), ventanilla, cajero, informacion, modulo,
    get saldo() { return saldo; }, set saldo(v) { saldo = +v || 0; actualizarSaldo(); }, turnos, cajas, decir, enLetras, dinero,
  };
  window.banco = api;
  return { objeto, cuadro, toast, api };
}
