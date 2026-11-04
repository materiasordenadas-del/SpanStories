import * as T from '../three.js';
import { cloneCityAvatar } from '../CityAvatarClone.js';
import { ANIMACIONES } from './Identidades.js';
import { lineasActivas, muestrearPista } from './Ambiente.js';

/**
 * Reproductor de la vida ambiental grabada. No decide nada: la pose de cada NPC
 * es una función pura del tiempo de la escena, por lo que el tutor, el
 * estudiante y cada nueva reproducción ven exactamente lo mismo.
 * Presupuesto por nivel de calidad (PerformanceController): los `nearNPC` más
 * cercanos se animan en cada fotograma, los `backgroundNPC` siguientes cada
 * pocos fotogramas, y el resto se oculta.
 */
const enSitio = clip => {
  const copia = clip.clone();
  for (const track of copia.tracks) if (/(hips|root).*\.position$/i.test(track.name) && track.getValueSize() === 3)
    for (let i = 3; i < track.values.length; i += 3) { track.values[i] = track.values[0]; track.values[i + 2] = track.values[2]; }
  return copia;
};
const PERFIL_POR_DEFECTO = { nearNPC: 6, backgroundNPC: 12 };

export function crearReproductorVida({ scene, camera, cargarPersonaje, perfil = () => PERFIL_POR_DEFECTO, contenedor = null, lienzo = null, hablar = null }) {
  let npcs = [], revision = 0, ambiente = null, fotograma = 0;
  const clipsPorPlantilla = new WeakMap(), burbujas = new Map(), pose = {}, cabeza = new T.Vector3();

  function clipsDe(gltf) {
    let mapa = clipsPorPlantilla.get(gltf); if (mapa) return mapa;
    const clips = gltf.animations.filter(c => !/facial/i.test(c.name)).map(enSitio);
    mapa = { boca: gltf.animations.find(c => /facial.*mouth/i.test(c.name)) || null };
    const reposo = clips.find(c => c.name === gltf.studioIdleClip);
    for (const [anim, patrones] of Object.entries(ANIMACIONES)) {
      mapa[anim] = (anim === 'idle' && reposo) || patrones.map(r => clips.find(c => r.test(c.name))).find(Boolean) || null;
    }
    mapa.idle ||= clips[0] || null;
    clipsPorPlantilla.set(gltf, mapa); return mapa;
  }

  function desmontar() {
    revision++;
    for (const npc of npcs) { npc.mixer.stopAllAction(); npc.mixer.uncacheRoot(npc.clon.root); npc.raiz.removeFromParent(); npc.clon.dispose(); }
    npcs = []; ambiente = null;
    for (const b of burbujas.values()) b.remove(); burbujas.clear();
  }

  async function montar(datos) {
    desmontar(); const actual = revision;
    const creados = [];
    for (const miembro of datos.cast) {
      const gltf = await cargarPersonaje(miembro.characterId);
      if (actual !== revision) { for (const n of creados) { n.raiz.removeFromParent(); n.clon.dispose(); } return false; }
      const clon = cloneCityAvatar(gltf.scene), raiz = new T.Group(), portador = new T.Group();
      portador.add(clon.root); raiz.add(portador); raiz.name = 'VidaNPC:' + miembro.id;
      raiz.traverse(o => { o.userData.ignorarSeleccion = true; });
      clon.root.updateMatrixWorld(true);
      const caja = new T.Box3().setFromObject(clon.root), tam = caja.getSize(new T.Vector3()), escala = miembro.height / (tam.y || 1);
      portador.scale.setScalar(escala);
      portador.position.set(-(caja.min.x + caja.max.x) * .5 * escala, -caja.min.y * escala, -(caja.min.z + caja.max.z) * .5 * escala);
      const mixer = new T.AnimationMixer(clon.root), clips = clipsDe(gltf), acciones = new Map();
      const accion = anim => {
        const clip = clips[anim] || clips.idle; if (!clip) return null;
        let a = acciones.get(clip); if (!a) { a = mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); acciones.set(clip, a); }
        return a;
      };
      const pista = datos.recording.tracks.find(t => t.npcId === miembro.id);
      raiz.visible = false; scene.add(raiz);
      creados.push({ id: miembro.id, raiz, clon, mixer, clips, accion, pista, altura: miembro.height, activas: new Set(), boca: clips.boca ? mixer.clipAction(clips.boca) : null });
    }
    npcs = creados; ambiente = datos; return true;
  }

  function animar(npc) {
    const actual = npc.accion(pose.anim), previa = pose.animPrevia ? npc.accion(pose.animPrevia) : null, nuevas = new Set();
    if (actual) { actual.setEffectiveWeight(previa && previa !== actual ? pose.mezcla : 1); actual.time = pose.animTiempo % Math.max(actual.getClip().duration, .001); nuevas.add(actual); }
    if (previa && previa !== actual) { previa.setEffectiveWeight(1 - pose.mezcla); previa.time = pose.animPreviaTiempo % Math.max(previa.getClip().duration, .001); nuevas.add(previa); }
    // Sin clip propio de hablar, la boca se mueve sobre la postura de espera.
    if (npc.boca && pose.anim === 'talk' && !npc.clips.talk) { npc.boca.play(); npc.boca.setEffectiveWeight(1); npc.boca.time = pose.animTiempo % Math.max(npc.boca.getClip().duration, .001); nuevas.add(npc.boca); }
    for (const a of npc.activas) if (!nuevas.has(a)) a.setEffectiveWeight(0);
    npc.activas = nuevas; npc.mixer.update(0);
  }

  function actualizarBurbujas(tiempo, cercanos) {
    if (!contenedor || !lienzo || typeof document === 'undefined') return;
    const vivas = new Set();
    for (const linea of lineasActivas(ambiente.recording.lines, ambiente.recording.loop, tiempo)) {
      const npc = cercanos.get(linea.npcId); if (!npc) continue;
      cabeza.copy(npc.raiz.position); cabeza.y += npc.altura + .25; cabeza.project(camera);
      if (cabeza.z > 1 || Math.abs(cabeza.x) > 1.1 || Math.abs(cabeza.y) > 1.1) continue;
      let b = burbujas.get(linea.id);
      if (!b) {
        b = document.createElement('button'); b.type = 'button'; b.className = 'vida-burbuja'; b.textContent = linea.text;
        b.title = 'Escuchar'; b.setAttribute('aria-label', 'Escuchar: ' + linea.text);
        Object.assign(b.style, { position: 'absolute', transform: 'translate(-50%,-100%)', maxWidth: '220px', padding: '5px 9px', borderRadius: '10px', border: '1px solid #0002', background: '#fffffff0', color: '#172634', font: '13px/1.35 system-ui,sans-serif', boxShadow: '0 2px 10px #0003', cursor: 'pointer', zIndex: 5, pointerEvents: 'auto' });
        b.addEventListener('click', () => hablar?.(linea.text));
        contenedor.append(b); burbujas.set(linea.id, b);
      }
      const r = lienzo.getBoundingClientRect(), c = contenedor.getBoundingClientRect();
      b.style.left = (r.left - c.left + (cabeza.x + 1) / 2 * r.width) + 'px';
      b.style.top = (r.top - c.top + (1 - cabeza.y) / 2 * r.height) + 'px';
      vivas.add(linea.id);
    }
    for (const [id, b] of burbujas) if (!vivas.has(id)) { b.remove(); burbujas.delete(id); }
  }

  function actualizar(tiempo) {
    if (!ambiente || !Number.isFinite(tiempo)) return;
    fotograma++;
    const { loop } = ambiente.recording, presupuesto = perfil() || PERFIL_POR_DEFECTO;
    for (const npc of npcs) {
      muestrearPista(npc.pista, loop, tiempo, pose);
      npc.raiz.position.set(pose.x, pose.y, pose.z); npc.raiz.rotation.y = pose.yaw;
      npc.distancia = npc.raiz.position.distanceToSquared(camera.position);
      npc.pose = { ...pose };
    }
    const orden = [...npcs].sort((a, b) => a.distancia - b.distancia), cercanos = new Map();
    orden.forEach((npc, rango) => {
      const cerca = rango < presupuesto.nearNPC, fondo = !cerca && rango < presupuesto.nearNPC + presupuesto.backgroundNPC;
      npc.raiz.visible = cerca || fondo;
      if (cerca) cercanos.set(npc.id, npc);
      // El fondo se anima con menos frecuencia; su pose sigue siendo la del tiempo actual.
      if (cerca || (fondo && (fotograma + rango) % 3 === 0) || (fondo && !npc.animado)) { Object.assign(pose, npc.pose); animar(npc); npc.animado = true; }
    });
    actualizarBurbujas(tiempo, cercanos);
  }

  return { montar, desmontar, actualizar, raices: () => npcs.map(n => n.raiz), get montado() { return !!ambiente; } };
}
