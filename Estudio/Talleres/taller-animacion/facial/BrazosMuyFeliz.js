import * as THREE from 'three';

const RAD = Math.PI / 180;
const datos = new WeakMap();
const pos = h => h.getWorldPosition(new THREE.Vector3());
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function marco(direccion, normal) {
  const y = direccion.clone().normalize();
  const z = normal.clone().addScaledVector(y, -normal.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function ponerMundo(hueso, q) {
  hueso.parent.updateWorldMatrix(true, false);
  hueso.quaternion.copy(hueso.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
  hueso.updateWorldMatrix(false, true);
}

function anatomia(v, L) {
  let d = datos.get(L.brazo);
  if (d) return d;
  // Ejes en los espacios LOCALES del rig exportado, sin asumir que su X/Z
  // corresponden a flexión/pronación ni que ambos lados están espejados igual.
  const antebrazoQ = (v.reposo.get(L.antebrazo) || L.antebrazo.quaternion).clone();
  const arriba = L.antebrazo.position.clone().normalize();
  const abajo = L.mano.position.clone().normalize();
  const abajoEnBrazo = abajo.clone().applyQuaternion(antebrazoQ);
  const bisagra = new THREE.Vector3().crossVectors(arriba, abajoEnBrazo);
  if (bisagra.lengthSq() < 1e-8) {
    // Solo para un rig completamente recto: X local perpendicular a la caña.
    bisagra.set(1, 0, 0).addScaledVector(arriba, -arriba.x);
    if (bisagra.lengthSq() < 1e-8) bisagra.set(0, 0, 1).addScaledVector(arriba, -arriba.z);
  }
  bisagra.normalize();
  const bisagraAbajo = bisagra.clone().applyQuaternion(antebrazoQ.clone().invert());
  d = {
    brazoMarcoInv: marco(arriba, bisagra).invert(),
    antebrazoMarcoInv: marco(abajo, bisagraAbajo).invert(),
    munecaReposo: (v.reposo.get(L.mano) || L.mano.quaternion).clone(),
    bisagra
  };
  datos.set(L.brazo, d);
  return d;
}

// Sustituye v._ik(..., qBase, polo) + orientarMuneca(...).
// qObjetivo es la orientación mundial calculada por las poses usando el marco
// REAL dedos/palma; ya contiene la mezcla de entrada del selector.
function resolverBrazo(v, L, objetivo, qObjetivo, polo, fuerza = 1) {
  if (!L.brazo || !L.antebrazo || !L.mano || fuerza <= 0) return;
  const d = anatomia(v, L);
  L.brazo.updateWorldMatrix(true, true);
  const A = pos(L.brazo), B = pos(L.antebrazo), C = pos(L.mano);
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  if (l1 < 1e-6 || l2 < 1e-6) return;
  const dir = objetivo.clone().sub(A);
  if (dir.lengthSq() < 1e-12) return;
  const distancia = clamp(dir.length(), Math.abs(l1 - l2) + 1e-5, (l1 + l2) * .9995);
  dir.normalize();
  const T = A.clone().addScaledVector(dir, distancia);
  const proyeccion = (l1*l1 - l2*l2 + distancia*distancia) / (2*distancia);
  const radio = Math.sqrt(Math.max(0, l1*l1 - proyeccion*proyeccion));
  const lateral = polo.clone().addScaledVector(dir, -polo.dot(dir));
  if (lateral.lengthSq() < 1e-10) {
    lateral.copy(B).sub(A).addScaledVector(dir, -B.clone().sub(A).dot(dir));
    if (lateral.lengthSq() < 1e-10) lateral.copy(v._ejes().frente).addScaledVector(dir, -v._ejes().frente.dot(dir));
  }
  lateral.normalize();
  const K = A.clone().addScaledVector(dir, proyeccion).addScaledVector(lateral, radio);
  const superior = K.clone().sub(A).normalize();
  const inferior = T.clone().sub(K).normalize();
  const bisagraMundo = new THREE.Vector3().crossVectors(superior, inferior).normalize();

  // El húmero gira axialmente ANTES de doblar el codo: así la flexión queda
  // en su bisagra anatómica, en lugar de resolverla con desviación lateral.
  ponerMundo(L.brazo, marco(superior, bisagraMundo).multiply(d.brazoMarcoInv));
  ponerMundo(L.antebrazo, marco(inferior, bisagraMundo).multiply(d.antebrazoMarcoInv));

  // La orientación neutral viaja con el antebrazo; no queda anclada al mundo.
  const localAnimada = L.mano.quaternion.clone();
  L.mano.quaternion.copy(localAnimada.slerp(d.munecaReposo, Math.min(1, fuerza)));
  L.mano.updateWorldMatrix(false, true);
  if (!qObjetivo) return;
  const neutral = L.mano.getWorldQuaternion(new THREE.Quaternion());
  const delta = qObjetivo.clone().multiply(neutral.clone().invert()).normalize();
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
  const proy = delta.x*inferior.x + delta.y*inferior.y + delta.z*inferior.z;
  // La torsión se reparte en el antebrazo (radio/cúbito), nunca en dedos.
  const torsion = clamp(2*Math.atan2(proy, delta.w), -85*RAD, 85*RAD);
  const qAnte = L.antebrazo.getWorldQuaternion(new THREE.Quaternion());
  const qTorsion = new THREE.Quaternion().setFromAxisAngle(inferior, torsion);
  ponerMundo(L.antebrazo, qTorsion.multiply(qAnte));
  const despues = L.mano.getWorldQuaternion(new THREE.Quaternion());
  const distanciaQ = despues.angleTo(qObjetivo);
  // Ahora 55° se mide desde una muñeca neutral LOCAL anatómicamente correcta.
  despues.slerp(qObjetivo, distanciaQ > 55*RAD ? 55*RAD/distanciaQ : 1);
  ponerMundo(L.mano, despues);
}

export function celebrar(v, peso, anim = null) {
  const {lado, arriba, frente} = v._ejes();
  const altura = v.altura;
  let muelles = estadoMuelles.get(v);
  if (!muelles) estadoMuelles.set(v, muelles = []);
  v.lados.forEach((L, i) => {
    if (!L.mano || !L.dedos[1]?.[0]) return;
    // anim: muestra animada por lado (pistas de ExpresionesVida); sin ella, la pose fija de antes
    const s = anim?.lados?.[i] || { peso: 1, x: .061, y: .026, z: .112, abrir: 1, muneca: 0, ondear: 0, t: 0 };
    const w = peso * s.peso;
    const lateral = lado.clone().multiplyScalar(L.signo);
    const articulaciones = [L.brazo, L.antebrazo, L.mano, ...L.dedos.flat(), ...L.pulgar];
    const entrada = articulaciones.map(h => h.quaternion.clone());
    const palma = v._palma(L);
    if (!palma) return;
    const direccion = pos(L.dedos[1][0]).sub(pos(L.mano));
    const base = marco(direccion, palma);
    const dedosArriba = arriba.clone().addScaledVector(lateral,.23).addScaledVector(frente,.06);
    const palmaDelante = frente.clone().addScaledVector(lateral,-.12);
    const qMano = marco(dedosArriba, palmaDelante).multiply(base.invert())
      .multiply(L.mano.getWorldQuaternion(new THREE.Quaternion()));
    const hombro = pos(L.brazo);
    const objetivo = hombro.clone().addScaledVector(lateral,s.x*altura)
      .addScaledVector(arriba,s.y*altura)
      .addScaledVector(frente,s.z*altura);

    // Muelle en el espacio del personaje: la mano se retrasa, rebasa un poco y se
    // asienta; cuando el cuerpo rebota, las manos llegan tarde (no van pegadas).
    const local = v.root.worldToLocal(objetivo.clone());
    let m = muelles[i];
    const dt = anim?.dt || 0;
    if (!m || !dt || dt > .1 || m.reiniciar) muelles[i] = m = { x: local.clone(), v: new THREE.Vector3(), reiniciar: false };
    else {
      const W = 2 * Math.PI * 3.2, Z = .5, pasos = Math.max(1, Math.ceil(dt * 240)), h = dt / pasos;
      for (let k = 0; k < pasos; k++) {
        const acel = local.clone().sub(m.x).multiplyScalar(W * W).addScaledVector(m.v, -2 * Z * W);
        m.v.addScaledVector(acel, h); m.x.addScaledVector(m.v, h);
      }
    }
    m.reiniciar = w < .001;                                    // fuera del gesto, el muelle vuelve a partir de cero
    const objetivoMuelle = v.root.localToWorld(m.x.clone());
    const velocidad = v.root.localToWorld(m.x.clone().add(m.v)).sub(objetivoMuelle);   // m/s en mundo

    // codos flexionados y abiertos hacia los lados
    const polo = arriba.clone().negate().addScaledVector(lateral,.12).addScaledVector(frente,-.1);
    resolverBrazo(v,L,objetivoMuelle,qMano,polo);
    for (const h of [...L.dedos.flat(), ...L.pulgar]) h.quaternion.copy(v.reposo.get(h));
    L.mano.updateWorldMatrix(false,true);
    let normal = v._palma(L);
    // Muñeca viva: extensión de la pista + arrastre (los dedos van detrás del movimiento).
    {
      const dedos = pos(L.dedos[1][0]).sub(pos(L.mano)).normalize();
      const arrastre = Math.max(-16, Math.min(16, velocidad.dot(normal) / altura * 20));
      const eje = new THREE.Vector3().crossVectors(normal, dedos).normalize();   // + = dedos hacia el dorso
      const q = new THREE.Quaternion().setFromAxisAngle(eje, (s.muneca + arrastre) * RAD);
      ponerMundo(L.mano, q.multiply(L.mano.getWorldQuaternion(new THREE.Quaternion())));
      normal = v._palma(L);
    }
    // Separar los dedos hacia su lado real de la palma, sin invertir el abanico.
    const haciaIndice = pos(L.dedos[0][0]).sub(pos(L.dedos[3][0])).normalize();
    const medio = pos(L.dedos[1][0]).sub(pos(L.mano)).normalize();
    const signoAbre = Math.sign(normal.clone().cross(medio).dot(haciaIndice));
    const fase = 2 * Math.PI * 3.2 * s.t;
    L.dedos.forEach((cadena,d) => {
      const falange = cadena[0];
      if (!falange) return;
      const abanico = ([13,4,-5,-17][d] * s.abrir + Math.sin(fase + d * 1.3) * 3 * s.ondear) * RAD * signoAbre;
      const giro = new THREE.Quaternion().setFromAxisAngle(normal, abanico);
      ponerMundo(falange, giro.multiply(falange.getWorldQuaternion(new THREE.Quaternion())));
      // flexión relajada (garra suave), más en el meñique; ondea durante el rebote
      cadena.forEach((hueso, k) => {
        const hijo = cadena[k + 1] || hueso.children.find(c => c.isBone);
        if (!hijo) return;
        const dir = pos(hijo).sub(pos(hueso)).normalize();
        const eje = new THREE.Vector3().crossVectors(dir, normal).normalize();
        const ang = ((9 + d * 2) + Math.sin(fase + d * 1.1 + k * .6) * 6 * s.ondear) * [1, 1.2, .8][k] * RAD;
        ponerMundo(hueso, new THREE.Quaternion().setFromAxisAngle(eje, ang).multiply(hueso.getWorldQuaternion(new THREE.Quaternion())));
      });
    });
    articulaciones.forEach((h,k) => h.quaternion.slerp(entrada[k], 1-w));
    L.brazo.updateWorldMatrix(true,true);
  });
}
const estadoMuelles = new WeakMap();
