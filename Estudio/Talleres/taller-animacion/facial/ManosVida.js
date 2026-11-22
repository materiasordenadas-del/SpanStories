import * as THREE from 'three';
import { celebrar } from './BrazosMuyFeliz.js?v=2';

// Coordenadas relativas a la cadera, en fracciones de la altura real.
// Cada mano: x hacia su lado, y arriba, z delante; dirección de dedos y palma.
const mano = (x, y, z, dedos, palma, curva = .15, abre = 0) => ({ x, y, z, dedos, palma, curva, abre });
const baja = () => mano(.19, -.23, .055, [0,-1,.05], [-1,0,0], .25);
const cadera = () => mano(.115,.035,.055, [-.3,-1,0], [-1,0,-.2], .2);
const abierta = (x,y,z) => mano(x,y,z,[0,1,.08],[0,0,1],.025,.15);
const junta = (s,y=.015) => mano(.048,y,.13,[-1,.15,0],[0,0,-1],.42);
// Los dos lados son anatómicos: Left (+X) y Right (-X).
export const POSES_MANOS = {
  feliz: [baja(),baja()],
  muyFeliz: [abierta(.14,.23,.12),abierta(.14,.24,.12)],
  sorprendido: [abierta(.125,.145,.16),abierta(.125,.15,.16)],
  confundido: [cadera(),mano(.055,.405,.015,[-.7,.25,0],[0,-1,0],.18)],
  preocupado: [junta(1,.035),junta(-1,.045)],
  molesto: [cadera(),cadera()],
  pensando: [mano(-.045,.05,.13,[-1,.1,0],[0,0,-1],.2),mano(-.025,.165,.13,[.1,1,0],[0,0,-1],.65)],
  riendo: [mano(-.015,.005,.16,[-1,.1,0],[0,0,-1],.22),baja()],
  avergonzado: [mano(.03,-.10,.105,[-.25,-1,0],[0,0,-1],.48),mano(.03,-.105,.108,[-.25,-1,0],[0,0,-1],.48)],
  esceptico: [baja(),cadera()],
  guino: [baja(),mano(.13,.17,.26,[0,.4,1],[1,0,0],.85)],
  hablandoEl: [mano(.16,.025,.23,[-.1,.25,1],[0,1,0],.25,.065),mano(.16,.03,.23,[.1,.25,1],[0,1,0],.25,.065)],
  triste: [baja(),baja()],
  escuchando: [mano(.12,.30,.075,[0,1,0],[0,0,1],.12,.07),baja()],
  neutral: [baja(),baja()],
};
const DEG = Math.PI / 180;
const pos = h => h.getWorldPosition(new THREE.Vector3());
function rotar(h, eje, ang) {
  if (!h || !ang || eje.lengthSq() < 1e-12) return;
  const inv = h.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  h.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(eje.clone().applyQuaternion(inv).normalize(), ang));
  h.updateWorldMatrix(false,true);
}
function marco(dir, normal) {
  const y = dir.clone().normalize();
  const z = normal.clone().addScaledVector(y,-normal.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y,z).normalize();
  z.crossVectors(x,y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
function vector(a, e, signo = 1) {
  return e.lado.clone().multiplyScalar(a[0]*signo).addScaledVector(e.arriba,a[1]).addScaledVector(e.frente,a[2]);
}
function orientarMuneca(L, objetivo, fuerza) {
  // El giro axial pertenece al radio/cúbito, no a una muñeca que da media vuelta.
  const actual = L.mano.getWorldQuaternion(new THREE.Quaternion());
  const eje = pos(L.mano).sub(pos(L.antebrazo)).normalize();
  const delta = objetivo.clone().multiply(actual.clone().invert());
  if (delta.w < 0) delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
  const proyeccion = delta.x*eje.x+delta.y*eje.y+delta.z*eje.z;
  const angulo = Math.max(-85*DEG,Math.min(85*DEG,2*Math.atan2(proyeccion,delta.w)));
  rotar(L.antebrazo,eje,angulo*fuerza);
  const despues = L.mano.getWorldQuaternion(new THREE.Quaternion());
  const distancia = despues.angleTo(objetivo);
  // Flexión/extensión residual limitada; slerp elige siempre el arco más corto.
  despues.slerp(objetivo,distancia > 55*DEG ? 55*DEG/distancia : 1);
  L.mano.quaternion.copy(L.mano.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(despues));
  L.mano.updateWorldMatrix(false,true);
}

// Se invoca después de mirada: no guarda estado ni acumula giros entre frames.
// La envolvente pesos pertenece al selector; su resto conserva la animación viva.
export function aplicarManos(v, pesos = {}, animFeliz = null) {
  // Una pose completa se mezcla en las articulaciones. No se interpola una
  // muñeca levantada como si aún colgara en el espacio de la pose de reposo.
  const alegria = Math.min(1, Math.max(0, pesos.muyFeliz || 0));
  if (!alegria) return aplicarOtrasManos(v, pesos);
  if (!v.activo.postura) return;
  if (alegria < .9999) {
    const resto = {};
    for (const [nombre, peso] of Object.entries(pesos))
      if (nombre !== 'muyFeliz') resto[nombre] = peso / (1 - alegria);
    aplicarOtrasManos(v, resto);
  }
  celebrar(v, alegria, animFeliz);
}

function aplicarOtrasManos(v, pesos) {
  if (!v.activo.postura) return;
  const entradas = Object.entries(pesos).filter(([n,w]) => POSES_MANOS[n] && Number.isFinite(w) && w > 0);
  const suma = entradas.reduce((s,[,w]) => s+w,0);
  if (!suma) return;
  const fuerza = Math.min(1,suma), escala = fuerza/suma;
  const e = v._ejes(), h = v.altura;
  // La inclinación complementa las manos sin tocar la mirada ni las piernas.
  const w = n => Math.max(0,pesos[n] || 0)*escala;
  rotar(v.pecho,e.lado,(w('triste')*5+w('avergonzado')*3-w('muyFeliz')*2+w('riendo')*2)*DEG);
  v.root.updateWorldMatrix(true,true);
  const origen = pos(v.cadera || v.root), cabeza = pos(v.cabeza);
  for (const L of v.lados) {
    if (!L.brazo || !L.antebrazo || !L.mano) continue;
    const ix = L.signo > 0 ? 0 : 1;
    const qBase = L.mano.getWorldQuaternion(new THREE.Quaternion());
    const pBase = pos(L.mano), target = pBase.clone().multiplyScalar(1-fuerza);
    const medio = L.dedos[1]?.[0], palma = v._palma(L);
    if (!medio || !palma) continue;
    const dirBase = pos(medio).sub(pBase).normalize();
    const marcoBase = marco(dirBase,palma);
    let qObjetivo = null, acumulado = 0, curva = 0, abre = 0;
    for (const [n,p] of entradas) {
      const peso = p*escala, d = POSES_MANOS[n][ix];
      const t = origen.clone().addScaledVector(e.lado,d.x*L.signo*h).addScaledVector(e.arriba,d.y*h).addScaledVector(e.frente,d.z*h);
      // Los contactos siguen la cabeza incluso al inclinarse o mirar: la muñeca
      // deja espacio al largo de palma/dedos para no tapar ojos y nariz.
      if (n === 'pensando' && L.signo < 0) t.copy(cabeza).addScaledVector(e.lado,-.018*h).addScaledVector(e.arriba,-.085*h).addScaledVector(e.frente,.085*h);
      if (n === 'confundido' && L.signo < 0) t.copy(cabeza).addScaledVector(e.lado,-.06*h).addScaledVector(e.arriba,.095*h).addScaledVector(e.frente,.012*h);
      if (n === 'escuchando' && L.signo > 0) t.copy(cabeza).addScaledVector(e.lado,.085*h).addScaledVector(e.arriba,-.012*h).addScaledVector(e.frente,.02*h);
      // Oscilación pequeña, exclusiva del habla; contacto y gestos estáticos permanecen estables.
      if (n === 'hablandoEl') t.addScaledVector(e.arriba,Math.sin(v.t*3.1+ix*.8)*.006*h);
      target.addScaledVector(t,peso);
      const q = marco(vector(d.dedos,e,L.signo),vector(d.palma,e,L.signo)).multiply(marcoBase.clone().invert()).multiply(qBase);
      if (!qObjetivo) qObjetivo = q; else qObjetivo.slerp(q,peso/(acumulado+peso));
      acumulado += peso; curva += d.curva*peso; abre += d.abre*peso;
    }
    const q = qBase.clone().slerp(qObjetivo,fuerza);
    // Codo hacia fuera y abajo: evita que atraviese tórax y mantiene flexión humana.
    let px=.38, py=-1, pz=-.25;
    for (const [nombre,peso] of entradas) {
      let ajuste;
      if (nombre==='molesto' || (nombre==='esceptico' && L.signo<0) || (nombre==='confundido' && L.signo>0)) ajuste=[.85,-.65,-.12];
      else if (nombre==='confundido' && L.signo<0) ajuste=[.95,.05,-.25];
      else if (nombre==='escuchando' && L.signo>0) ajuste=[.8,-.3,-.25];
      else if (nombre==='pensando') ajuste=[.3,-1.2,.04];
      if (ajuste) { px+=(ajuste[0]-.38)*peso*escala; py+=(ajuste[1]+1)*peso*escala; pz+=(ajuste[2]+.25)*peso*escala; }
    }
    const polo = e.lado.clone().multiplyScalar(L.signo*px).addScaledVector(e.arriba,py).addScaledVector(e.frente,pz).normalize();
    const A = pos(L.brazo), B = pos(L.antebrazo), C = pos(L.mano);
    const alcance = (A.distanceTo(B)+B.distanceTo(C))*.975;
    // Durante la entrada, primero salir por delante del torso; después cruzar.
    if (fuerza < 1 && target.clone().sub(origen).dot(e.frente) < .11*h) {
      target.addScaledVector(e.frente,Math.sin(Math.PI*fuerza)*.055*h);
    }
    const offset = target.clone().sub(A).clampLength(h*.025,alcance);
    target.copy(A).add(offset);
    const n = C.clone().sub(A).normalize(), actual = B.clone().sub(A);
    actual.addScaledVector(n,-actual.dot(n));
    if (actual.lengthSq() > 1e-10) polo.lerpVectors(actual.normalize(),polo,fuerza).normalize();
    v._ik(L.brazo,L.antebrazo,L.mano,target,qBase,polo);
    orientarMuneca(L,q,fuerza);
    L.mano.updateWorldMatrix(true,true);
    // Restablece cada dedo hacia reposo antes de curvar: no suma el puño al reposo vivo.
    for (const hueso of [...L.dedos.flat(),...L.pulgar]) {
      const reposo = v.reposo.get(hueso);
      if (reposo) hueso.quaternion.slerp(reposo,fuerza);
    }
    L.mano.updateWorldMatrix(true,true);
    const normal = v._palma(L);
    if (!normal) continue;
    L.dedos.forEach((cadena,d) => cadena.forEach((hueso,k) => {
      const hijo = cadena[k+1] || hueso.children.find(c=>c.isBone);
      if (!hijo) return;
      let doblar = curva;
      // Índice en barbilla / pistola del guiño; otros dedos recogidos.
      if (L.signo < 0 && d === 0) doblar -= w('pensando')*.52+w('guino')*.82;
      const direccion = pos(hijo).sub(pos(hueso)).normalize();
      const eje = new THREE.Vector3().crossVectors(direccion,normal).normalize();
      rotar(hueso,eje,Math.max(0,doblar)*(k===1?85:65)*DEG);
      if (k===0) rotar(hueso,normal,[-1.5,-.35,.6,1.5][d]*abre);
    }));
    L.pulgar.forEach((hueso,k) => {
      const hijo = L.pulgar[k+1] || hueso.children.find(c=>c.isBone);
      if (!hijo) return;
      const direccion = pos(hijo).sub(pos(hueso)).normalize();
      const eje = new THREE.Vector3().crossVectors(direccion,normal).normalize();
      const pulgar = Math.max(0,curva*.55-(L.signo<0?w('guino')*.5:0));
      rotar(hueso,eje,pulgar*(k===0?35:45)*DEG);
    });
  }
}
