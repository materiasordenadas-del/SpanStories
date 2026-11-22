// Marcas visuales de producción (puntos de aparición y marcadores de personajes). Son ayudas del editor: nunca forman parte del
// escenario que ve el estudiante (overlay, no seleccionables, no exportados).
import * as T from '../../engine/three.js';

const COLORES = { aparicion: 0x2f9c3a, personaje: 0x2f63d6 };

export function crearMarcadores({ scene, doc }) {
  const grupo = new T.Group(); grupo.name = 'ayuda-marcadores'; grupo.userData.ignorarSeleccion = true; scene.add(grupo);
  const materiales = Object.fromEntries(Object.entries(COLORES).map(([k, c]) => [k, new T.MeshBasicMaterial({ color: c, transparent: true, opacity: .85, depthTest: false })]));
  const geoCono = new T.ConeGeometry(.35, 1.1, 14), geoAro = new T.RingGeometry(.45, .6, 24);
  function marcar(o) { o.traverse(n => { n.userData.ignorarSeleccion = true; if (n.isMesh) { n.userData.editorOverlay = true; n.layers.set(31); n.renderOrder = 997; n.raycast = () => {}; } }); }
  function refrescar() {
    for (const h of [...grupo.children]) grupo.remove(h);
    for (const m of doc().marcadores) {
      const g = new T.Group(), cono = new T.Mesh(geoCono, materiales[m.tipo]), aro = new T.Mesh(geoAro, materiales[m.tipo]);
      cono.position.y = 1.2; cono.rotation.x = Math.PI; aro.rotation.x = -Math.PI / 2; aro.position.y = .05;
      g.add(cono, aro); g.position.fromArray(m.position); g.rotation.y = m.giro ?? 0; g.name = 'marcador:' + m.id; marcar(g); grupo.add(g);
    }
  }
  refrescar();
  return { refrescar, set visible(v) { grupo.visible = !!v; }, dispose() { grupo.removeFromParent(); geoCono.dispose(); geoAro.dispose(); for (const m of Object.values(materiales)) m.dispose(); } };
}
