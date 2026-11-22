// Miniaturas de objetos GLB. Un solo renderizador pequeño compartido (128×96) y una cola: nunca compite con el visor.
// Usa materiales del propio GLB con luz simple; no pasa por el compositor de estilos (es solo una vista previa).
import * as T from '../../engine/three.js';

export const TAM_MINIATURA = { ancho: 192, alto: 144 };

export function crearMiniaturas({ loader }) {
  let renderer = null, escena = null, camara = null, cola = Promise.resolve();
  function preparar() {
    if (renderer) return;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(TAM_MINIATURA.ancho, TAM_MINIATURA.alto, false); renderer.outputColorSpace = T.SRGBColorSpace;
    escena = new T.Scene();
    escena.add(new T.HemisphereLight(0xffffff, 0xb9bfb0, 1.6));
    const sol = new T.DirectionalLight(0xfff1d6, 2.2); sol.position.set(-3, 5, 4); escena.add(sol);
    camara = new T.PerspectiveCamera(32, TAM_MINIATURA.ancho / TAM_MINIATURA.alto, .05, 2000);
  }

  /** Mide un modelo: dimensiones en metros y número de triángulos. */
  function medir(raiz) {
    raiz.updateMatrixWorld(true);
    const caja = new T.Box3().setFromObject(raiz), tam = caja.getSize(new T.Vector3());
    let triangulos = 0; raiz.traverse(o => { if (o.isMesh && o.geometry) triangulos += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position?.count ?? 0) / 3; });
    return { dimensiones: [tam.x, tam.y, tam.z].map(v => +v.toFixed(3)), triangulos: Math.round(triangulos) };
  }

  /** Renderiza un GLB (Blob) y devuelve { dataUrl, png (base64), dimensiones, triangulos }. */
  function generar(blob) {
    const trabajo = async () => {
      preparar();
      const gltf = await loader.parseAsync(await blob.arrayBuffer(), '');
      const raiz = gltf.scene; raiz.traverse(o => { if (o.isMesh && !o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals(); });
      const medidas = medir(raiz), caja = new T.Box3().setFromObject(raiz), centro = caja.getCenter(new T.Vector3()), tam = caja.getSize(new T.Vector3());
      raiz.position.sub(centro); escena.add(raiz);
      const radio = Math.max(tam.x, tam.y, tam.z, .01) * .62, d = radio / Math.tan(T.MathUtils.degToRad(camara.fov / 2));
      camara.position.set(d * .75, d * .45, d * .9); camara.near = d / 100; camara.far = d * 20; camara.updateProjectionMatrix(); camara.lookAt(0, 0, 0);
      renderer.setClearColor(0x000000, 0); renderer.render(escena, camara);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      escena.remove(raiz);
      raiz.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); for (const m of [].concat(o.material)) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose?.(); } } });
      return { dataUrl, png: dataUrl.split(',')[1], ...medidas };
    };
    const siguiente = cola.then(trabajo, trabajo); cola = siguiente.catch(() => {}); return siguiente;
  }
  return { generar, medir, dispose() { renderer?.dispose(); renderer = null; } };
}
