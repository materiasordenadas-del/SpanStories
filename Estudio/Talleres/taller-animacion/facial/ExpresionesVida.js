import * as THREE from 'three';
import { aplicarManos } from './ManosVida.js?v=4';

export const NOMBRES = {
  feliz: 'Feliz', muyFeliz: 'Muy feliz', sorprendido: 'Sorprendido', confundido: 'Confundido',
  preocupado: 'Preocupado', molesto: 'Molesto', pensando: 'Pensando', riendo: 'Riendo',
  avergonzado: 'Avergonzado', esceptico: 'Escéptico', guino: 'Guiño', hablandoEl: 'HablandoEl',
  triste: 'Triste', escuchando: 'Escuchando', neutral: 'Neutral'
};

// Los valores pares se refieren al lado anatómico izquierdo y derecho del personaje.
function rostro(simetrico, individual = {}) {
  const valores = { ...individual };
  for (const [nombre, par] of Object.entries(simetrico)) {
    const [izquierda, derecha] = Array.isArray(par) ? par : [par, par];
    valores[nombre + 'Left'] = izquierda;
    valores[nombre + 'Right'] = derecha;
  }
  return valores;
}

// Cabeza: giro, elevación del mentón, ladeo (grados), mirada horizontal y vertical.
// Boca, mejillas y párpados tienen pesos independientes de los movimientos de manos.
export const POSES = {
  feliz: {
    cara: rostro({ mouthSmile: [.79,.84], cheekSquint: [.34,.39], browOuterUp: [.28,.22], mouthUpperUp: .11 }, { jawOpen: .13 }),
    cabeza: [-1, 2, -1.5, 0, 0]
  },
  muyFeliz: { cara: {}, cabeza: [0, 0, 0, 0, 0] },            // animada: ver MUY_FELIZ
  sorprendido: {
    cara: rostro({ eyeWide: 1, browOuterUp: [.82,.88], mouthLowerDown: .15 }, { browInnerUp: 1, jawOpen: .48, mouthFunnel: .56, mouthPucker: .20 }),
    cabeza: [0, -2, 0, 0, .07]
  },
  confundido: {
    cara: rostro({ browDown: [.94,.09], browOuterUp: [.04,.87], eyeSquint: [.32,.05], mouthFrown: [.45,.18] }, { jawOpen: .18, mouthLeft: .32 }),
    cabeza: [5, -3, -10, -.19, .10]
  },
  preocupado: {
    cara: rostro({ browDown: [.13,.18], eyeWide: [.46,.44], mouthFrown: [.83,.76], mouthStretch: .12 }, { browInnerUp: 1, jawOpen: .18, mouthShrugLower: .15 }),
    cabeza: [-2, -4, 2, 0, -.11]
  },
  molesto: {
    cara: rostro({ browDown: 1, eyeSquint: [.68,.61], mouthPress: [.82,.75], mouthFrown: [.83,.78], noseSneer: .12 }, { mouthShrugLower: .25 }),
    cabeza: [0, -7, 0, 0, .18]
  },
  pensando: {
    cara: rostro({ browOuterUp: [.88,.17], browDown: [.02,.34], mouthPress: [.46,.38], eyeSquint: [.05,.16] }, { mouthLeft: .34, mouthPucker: .16 }),
    cabeza: [4, 6, 5, .44, .50]
  },
  riendo: {
    cara: rostro({ mouthSmile: 1, cheekSquint: [.64,.60], eyeBlink: 1, mouthUpperUp: .26, browOuterUp: .38 }, { jawOpen: .43 }),
    cabeza: [-2, 11, 3, 0, 0]
  },
  avergonzado: {
    cara: rostro({ mouthSmile: [.48,.23], mouthPress: [.12,.29], cheekSquint: .20, eyeBlink: [.17,.22], browDown: [.24,.42] }, { browInnerUp: .36 }),
    cabeza: [6, -11, -5, -.39, -.31]
  },
  esceptico: {
    cara: rostro({ browOuterUp: [.99,0], browDown: [0,.95], eyeSquint: [.08,.61], mouthPress: [.58,.34], mouthFrown: [.15,.54] }, { mouthLeft: .40 }),
    cabeza: [5, 2, 7, -.40, .08]
  },
  guino: {
    cara: rostro({ eyeBlink: [1,.03], eyeSquint: [.18,.12], cheekSquint: [.50,.17], mouthSmile: [.79,.4], browOuterUp: [.06,.59] }, { mouthLeft: .18 }),
    cabeza: [-4, -3, 5, 0, 0]
  },
  hablandoEl: {
    cara: rostro({ browOuterUp: [.52,.27], eyeWide: .22, mouthSmile: [.24,.30] }, { browInnerUp: .25 }),
    cabeza: [2, .5, -4, .02, .02]
  },
  triste: {
    cara: rostro({ mouthFrown: [.95,.89], eyeBlink: [.29,.34], browDown: [.12,.16] }, { browInnerUp: 1, mouthShrugUpper: .12, mouthShrugLower: .32 }),
    cabeza: [-2, -16, -3, -.07, -.58]
  },
  escuchando: {
    cara: rostro({ browOuterUp: [.72,.45], eyeWide: [.42,.35], mouthSmile: [.33,.25] }, { browInnerUp: .19 }),
    cabeza: [-8, 1, -8, -.15, .04]
  }
};

// ------------------------------------------------------------------ muyFeliz animada
// Pistas [segundo, valor] en un bucle de DUR s. La curva pasa por cada clave sin
// rebasarla (Hermite monótona): las claves son los extremos, como en un dope sheet.
// 0–0.4 sonrisa y anticipación · 0.4–0.85 sube las manos · 0.85–1.1 máximo ·
// 1.1–2.1 dos rebotes · 2.1–3.1 vuelve suave · 3.1–3.4 sonrisa de partida.
const DUR = 3.4;
function tangente(p, i) {
  const n = p.length, c = p[i];
  const a = i > 0 ? p[i - 1] : [p[n - 2][0] - DUR, p[n - 2][1]];
  const b = i < n - 1 ? p[i + 1] : [p[1][0] + DUR, p[1][1]];
  const d0 = (c[1] - a[1]) / (c[0] - a[0]), d1 = (b[1] - c[1]) / (b[0] - c[0]);
  if (d0 * d1 <= 0) return 0;
  const h0 = c[0] - a[0], h1 = b[0] - c[0];
  return 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
}
export function curva(p, t) {
  t = ((t % DUR) + DUR) % DUR;
  let i = 0; while (i < p.length - 2 && t > p[i + 1][0]) i++;
  const [t0, v0] = p[i], [t1, v1] = p[i + 1], h = t1 - t0;
  const u = Math.min(1, Math.max(0, (t - t0) / h)), u2 = u * u, u3 = u2 * u;
  return (2*u3 - 3*u2 + 1) * v0 + (u3 - 2*u2 + u) * tangente(p, i) * h + (3*u2 - 2*u3) * v1 + (u3 - u2) * tangente(p, i + 1) * h;
}
const MUY_FELIZ = {
  // Solo ARKit. Ojos en arco = párpado cerrado + mejilla arriba (sin huesos de párpado).
  // browInnerUp de el personaje es débil (1.0 ≈ 3 mm): su límite sube a 2.5; la sonrisa a 1.2.
  cara: {
    mouthSmile:   [[0,.60],[.35,.86],[.80,1.18],[2.25,1.15],[3.0,.66],[3.4,.60]],
    jawOpen:      [[0,.08],[.35,.14],[.82,.42],[1.32,.34],[1.52,.44],[1.78,.34],[2.02,.42],[2.6,.20],[3.1,.08],[3.4,.08]],
    mouthUpperUp: [[0,.05],[.82,.18],[2.25,.17],[3.0,.06],[3.4,.05]],
    mouthStretch: [[0,.04],[.82,.45],[2.25,.42],[3.0,.06],[3.4,.04]],
    mouthDimple:  [[0,.08],[.82,.30],[2.25,.28],[3.0,.10],[3.4,.08]],
    // Párpados como el muyFeliz que ya se veía limpio: cierre completo y mejilla moderada.
    // eyeBlink < 1 deja asomar el iris; eyeSquint o mejilla > .6 dentan la línea cerrada.
    cheekSquint:  [[0,.28],[.82,.58],[2.25,.56],[3.0,.30],[3.4,.28]],
    eyeBlink:     [[0,0],[.50,.06],[.86,1],[2.3,1],[2.7,.20],[3.0,0],[3.4,0]],
    browOuterUp:  [[0,.08],[.82,.32],[2.25,.28],[3.0,.10],[3.4,.08]],
    browInnerUp:  [[0,.80],[.82,2.2],[2.25,2.0],[3.0,.85],[3.4,.80]],
  },
  // Grados: cabeza + = barbilla arriba; ladeo + = hacia su izquierda; pecho + = sacar pecho.
  cabeza:  [[0,0],[.32,-2],[.88,5],[1.32,3],[1.52,5],[1.78,3],[2.02,4.5],[2.9,1],[3.4,0]],
  ladeo:   [[0,0],[.88,-3.5],[1.5,-1.5],[2.02,-3],[3.0,0],[3.4,0]],
  pecho:   [[0,0],[.30,-2.5],[.85,5],[2.15,4],[3.0,0],[3.4,0]],
  hombros: [[0,0],[.30,-1],[.85,5],[1.32,3],[1.52,5],[1.78,3],[2.02,4.5],[2.9,0],[3.4,0]],
  // Cadera en fracciones de la altura (− = flexiona rodillas; los pies siguen plantados).
  cadera:  [[0,0],[.30,-.006],[.62,0],[1.0,-.002],[1.32,-.011],[1.52,-.001],[1.78,-.010],[2.02,0],[3.4,0]],
  brazos: {
    peso:   [[0,0],[.38,0],[.55,.6],[.80,1],[2.15,1],[3.05,0],[3.4,0]],
    // muñeca respecto al hombro, en fracciones de altura: x hacia fuera, y arriba, z delante
    x:      [[0,.045],[.5,.055],[.80,.078],[2.15,.078],[2.9,.055],[3.4,.045]],
    y:      [[0,-.07],[.45,-.05],[.70,.035],[.82,.05],[1.0,.042],[2.15,.042],[2.6,.0],[3.0,-.05],[3.4,-.07]],
    z:      [[0,.10],[.6,.12],[.85,.105],[2.15,.105],[2.8,.11],[3.4,.10]],
    abrir:  [[0,.2],[.5,.2],[.85,1],[2.15,1],[2.9,.3],[3.4,.2]],
    // extensión de muñeca (+ = dedos hacia atrás): al subir los dedos van detrás y luego rematan
    muneca: [[0,0],[.45,-16],[.70,-6],[.86,9],[1.05,3],[2.15,3],[2.5,-5],[3.0,-10],[3.4,0]],
    ondear: [[0,0],[1.0,0],[1.2,1],[2.0,1],[2.3,0],[3.4,0]],
  },
  desfase: .05,                                                // la mano derecha va un pelo detrás
};
function muestraBrazos(t) {
  const b = MUY_FELIZ.brazos, m = { t };
  for (const k in b) m[k] = curva(b[k], t);
  return m;
}

const RAD = Math.PI / 180;
function girar(h, eje, ang) {
  if (!h || !ang) return;
  h.parent.updateWorldMatrix(true, false);
  const qp = h.parent.getWorldQuaternion(new THREE.Quaternion());
  const qm = new THREE.Quaternion().setFromAxisAngle(eje, ang).multiply(h.getWorldQuaternion(new THREE.Quaternion()));
  h.quaternion.copy(qp.invert().multiply(qm));
  h.updateWorldMatrix(false, true);
}

export class ExpresionesVida {
  constructor(vida) {
    this.vida = vida;
    this.nombre = 'neutral';
    this.fuerza = 1;
    this.pesos = {};
    this.cab = { yaw: 0, pitch: 0, roll: 0, mx: 0, my: 0 };
    this.total = this.sBrazos = this.tiempo = this.dt = 0;
    this.tFeliz = 0;                                            // reloj del bucle de muyFeliz
    this.ojosCerrados = 0;
    // morphs débiles de el personaje: pueden pasar de 1 sin romper la malla (medido en captura)
    Object.assign(vida.limiteMorph, { browInnerUp: 2.5, mouthSmileLeft: 1.2, mouthSmileRight: 1.2 });
  }

  poner(nombre = 'neutral') {
    nombre ??= 'neutral';
    if (!Object.hasOwn(NOMBRES, nombre)) return false;
    if (this.nombre !== nombre) {
      this.tiempo = 0;
      // si muyFeliz ya se había ido, vuelve a empezar desde la sonrisa
      if (nombre === 'muyFeliz' && (this.pesos.muyFeliz || 0) < .05) this.tFeliz = 0;
    }
    this.nombre = nombre;
    return true;
  }

  cuerpo(dt, postura) {
    this.tiempo += dt; this.dt = dt;
    const cab = this.cab;
    cab.yaw = cab.pitch = cab.roll = cab.mx = cab.my = 0;
    this.total = 0;
    for (const [nombre, pose] of Object.entries(POSES)) {
      // la animada entra y sale más despacio: sus brazos no deben caer de golpe
      const mezcla = 1 - Math.exp(-dt / (nombre === 'muyFeliz' ? .3 : .15));
      const objetivo = nombre === this.nombre ? this.fuerza : 0;
      const previo = this.pesos[nombre] || 0;
      const peso = previo + (objetivo - previo) * mezcla;
      if (peso < .0005) { delete this.pesos[nombre]; continue; }
      this.pesos[nombre] = peso;
      this.total += peso;
      const [yaw, pitch, roll, mx, my] = pose.cabeza;
      cab.yaw += yaw * RAD * peso;
      cab.pitch += pitch * RAD * peso;
      cab.roll += roll * RAD * peso;
      cab.mx += mx * peso;
      cab.my += my * peso;
    }
    this.sBrazos = postura ? this.total : 0;
    const risa = this.pesos.riendo || 0;
    cab.pitch += risa * 1.5 * RAD * Math.sin(this.tiempo * 12);
    const f = this.pesos.muyFeliz || 0;
    if (f) { this.tFeliz += dt; if (postura) this._troncoFeliz(f); }
    // cuánto cierran los ojos las expresiones (LifeCharacter relaja la mirada en proporción)
    let cerrados = f * curva(MUY_FELIZ.cara.eyeBlink, this.tFeliz);
    for (const [nombre, peso] of Object.entries(this.pesos)) {
      const c = POSES[nombre].cara;
      cerrados = Math.max(cerrados, peso * Math.min(c.eyeBlinkLeft || 0, c.eyeBlinkRight || 0));
    }
    this.ojosCerrados = cerrados;
  }

  // Pecho que se eleva, hombros arriba y rebote flexionando rodillas. Va antes
  // de respiración y peso: LifeCharacter vuelve a plantar los pies con IK.
  _troncoFeliz(w) {
    const v = this.vida, t = this.tFeliz, M = MUY_FELIZ;
    const { lado, arriba, frente } = v._ejes();
    v.root.updateMatrixWorld(true);
    const baja = curva(M.cadera, t) * v.altura * w;
    if (v.cadera && baja) {
      const p = v.cadera.getWorldPosition(new THREE.Vector3()).addScaledVector(arriba, baja);
      v.cadera.position.copy(p.applyMatrix4(v.cadera.parent.matrixWorld.clone().invert()));
      v.cadera.updateWorldMatrix(false, true);
    }
    const pecho = -curva(M.pecho, t) * RAD * w;                 // girar + sobre el eje lateral = encorvarse
    girar(v.lumbar, lado, pecho * .3);
    girar(v.espalda, lado, pecho * .35);
    girar(v.pecho, lado, pecho * .35);
    const hombros = curva(M.hombros, t) * RAD * w;
    for (const L of v.lados) girar(L.hombro, frente, L.signo * hombros);
  }

  despuesMirada() {
    const v = this.vida, f = this.pesos.muyFeliz || 0;
    let anim = null;
    if (f) {
      // cabeza directa al cuello (cabeza rígida): el rebote no pasa por el muelle lento de la mirada
      const { lado, frente } = v._ejes();
      girar(v.giroCabeza, lado, -curva(MUY_FELIZ.cabeza, this.tFeliz) * RAD * f);
      girar(v.giroCabeza, frente, curva(MUY_FELIZ.ladeo, this.tFeliz) * RAD * f);
      anim = { dt: this.dt, lados: [muestraBrazos(this.tFeliz), muestraBrazos(this.tFeliz - MUY_FELIZ.desfase)] };
    }
    if (this.sBrazos) aplicarManos(v, this.pesos, anim);
  }

  cara() {
    const v = this.vida;
    for (const [nombre, peso] of Object.entries(this.pesos)) {
      if (nombre === 'muyFeliz') {
        for (const [morph, pista] of Object.entries(MUY_FELIZ.cara)) {
          const valor = curva(pista, this.tFeliz);
          const cedeAlHabla = v.habla && /^(mouth|jaw)/.test(morph) ? .24 : 1;
          if (morph + 'Left' in v.vm) { v._sumar(morph + 'Left', peso * valor * cedeAlHabla); v._sumar(morph + 'Right', peso * valor * cedeAlHabla); }
          else v._sumar(morph, peso * valor * cedeAlHabla);
        }
        continue;
      }
      for (const [morph, valor] of Object.entries(POSES[nombre].cara)) {
        const cedeAlHabla = v.habla && /^(mouth|jaw)/.test(morph) ? .24 : 1;
        v._sumar(morph, peso * valor * cedeAlHabla);
      }
    }
    if (!v.habla) {
      const fase = this.tiempo;
      if (this.pesos.riendo) v._sumar('jawOpen', this.pesos.riendo * (.10 + .09 * Math.sin(fase*12)));
      if (this.pesos.hablandoEl) {
        const voz = this.pesos.hablandoEl;
        const pulso = Math.max(0, Math.sin(fase*8.2) + .32*Math.sin(fase*3.1));
        v._sumar('vis_A', voz * (.12 + .49 * Math.min(1, pulso)));
        v._sumar('vis_E', voz * .33 * Math.max(0,Math.sin(fase*6.3 + 1.1)));
      }
    }
  }
}
