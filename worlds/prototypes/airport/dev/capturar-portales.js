// Hornea los cuadros de las puertas (assets/portales/<desde>-<hacia>.webp).
// Uso, con el servidor en marcha y `?dev`, más el receptor de herramientas/recibir-portales.py:
//   const m = await import('/Aeropuerto/dev/capturar-portales.js'); await m.capturar(window.__airport);
import * as T from '../engine/three.js';
import { DEPARTURE_ROUTE, ARRIVAL_ROUTE } from '../engine/routes.js';
import { portalGeometry, PORTAL_CAPTURE } from '../engine/PortalPreview.js';
import { luz } from '../engine/Luz25D.js';

const esperar = ms => new Promise(r => setTimeout(r, ms));

export async function capturar(air, { rutas = [DEPARTURE_ROUTE, ARRIVAL_ROUTE], receptor = 'http://127.0.0.1:7150', solo = null } = {}) {
  const { renderer, scene } = air, { width, height, fov, eyeY } = PORTAL_CAPTURE;
  // near justo tras la puerta: el marco y el vidrio de la propia sala vecina no entran en el cuadro (los dibuja la sala activa).
  const cam = new T.PerspectiveCamera(fov, width / height, PORTAL_CAPTURE.back + .45, 80);
  const hechas = [];
  for (const route of rutas) {
    await air.cambiarRuta(route);
    for (let i = 0; i < route.length; i++) {
      if (i > 0) await air.move(route[i].id);
      await esperar(1800);
      for (const j of [i - 1, i + 1]) {
        const viewer = route[j]; if (!viewer) continue;
        const name = `${viewer.id}-${route[i].id}`;
        if (solo && !solo.includes(name)) continue;
        const g = portalGeometry(viewer, route[i]); if (!g) continue;
        const ocultos = scene.children.filter(o => o.isGroup && o.visible && o.name && o.name !== route[i].id);
        ocultos.forEach(o => { o.visible = false; });
        renderer.setPixelRatio(1); renderer.setSize(width, height, false); luz.viewport(width, height, 1);
        cam.position.set(g.eye[0], eyeY, g.eye[1]); cam.lookAt(g.eye[0] + g.dir[0], eyeY, g.eye[1] + g.dir[1]); cam.updateMatrixWorld();
        renderer.render(scene, cam); renderer.render(scene, cam);
        const blob = await new Promise(r => renderer.domElement.toBlob(r, 'image/webp', .82));
        ocultos.forEach(o => { o.visible = true; });
        const ok = await fetch(`${receptor}/${name}.webp`, { method: 'PUT', body: blob }).then(r => r.ok);
        hechas.push([name, blob.size, ok]);
      }
    }
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); air.resize();
  return hechas;
}
