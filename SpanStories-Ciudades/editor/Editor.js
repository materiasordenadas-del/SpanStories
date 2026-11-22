// Orquestador de la interfaz del Editor: crea el registro de acciones, el shell y cada panel, y los conecta con el motor
// (escena, cámara, registro de objetos, fachada CityEditor). No contiene lógica de ningún panel: cada uno vive en su archivo
// (ver editor/EDITOR.md). main.js solo llama a montarEditorVisual() y a los métodos de lo que devuelve.
import * as T from '../engine/three.js';
import { RegistroAcciones } from './core/Acciones.js';
import { Seleccion } from './core/Seleccion.js';
import { Capas } from './core/Capas.js';
import { Portapapeles } from './core/Portapapeles.js';
import { montarAtajos } from './core/Atajos.js';
import { registrarAccionesBase } from './acciones-base.js';
import { crearPreferencias, el, svg, rango } from './ui/componentes.js';
import { crearShell } from './ui/Shell.js';
import { montarMenus } from './ui/Menus.js';
import { montarHerramientas } from './ui/Herramientas.js';
import { montarMenuContextual } from './ui/MenuContextual.js';
import { montarPaleta } from './ui/Paleta.js';
import { montarJerarquia } from './ui/Jerarquia.js';
import { montarPanelCapas } from './ui/PanelCapas.js';
import { montarInspector } from './ui/Inspector.js';
import { montarBiblioteca } from './ui/Biblioteca.js';
import { montarInventario } from './ui/Inventario.js';
import { montarEstado } from './ui/Estado.js';
import { montarNavEjes } from './ui/NavEjes.js';
import { montarGizmo } from './herramientas/Gizmo.js';
import { montarInteraccion } from './herramientas/Interaccion.js';
import { montarColocacion } from './herramientas/Colocacion.js';
import { crearVista } from './herramientas/Vista.js';
import { crearCuadricula } from './herramientas/Cuadricula.js';
import { crearBiblioteca } from './biblioteca/Registro.js';
import { crearMiniaturas } from './biblioteca/Miniaturas.js';
import { aplicarColores } from './adaptadores/Materiales.js';
import { capturarObjeto } from '../engine/CityProject.js';
import { crearCambios } from './ambiente/Entorno.js';
import { validarAmbiente } from './ambiente/SceneEnvironment.js';
import { montarCieloPanel } from './ambiente/cielo/CieloPanel.js';
import { montarEstiloPanel } from './ambiente/estilo/EstiloPanel.js';
import { montarCespedPanel } from './ambiente/cesped/CespedPanel.js';
import { montarPincel } from './herramientas/Pincel.js';
import { montarTerrenoPanel } from './ambiente/terreno/TerrenoPanel.js';
import { Variantes } from './variantes/Variantes.js';
import { crearRuntimeVariante } from './variantes/Runtime.js';
import { montarPanelEscena } from './variantes/PanelEscena.js';
import { crearMarcadores } from './herramientas/Marcadores.js';
import { generarPuntos, variacion, aleatorio } from './herramientas/Dispersion.js';
import { resolverMovimiento, cajaDeRaiz } from './herramientas/Colision.js';
import { montarPanelPrefabs } from './ui/PanelPrefabs.js';
import { nuevoId } from './core/EscenarioDoc.js';
import { urlEditarEnGenerador, adaptadorDe } from './core/Adaptadores.js';
import { encontrarHuerfanos } from './core/Huerfanos.js';

export function montarEditorVisual({ scene, camera, renderer, viewport, objetos, editor, navigation, target, ground, obstaculos, manifest, zone, loader, status = () => {}, bounds = null,
  contribuciones = {}, alEntrarEnJuego = () => {}, studioMode = false, entorno = null, estilos = null, clima = null, cesped = null, terreno = null, atlasId = null, existeId = () => true }) {
  const canvas = renderer.domElement;
  const preferencias = crearPreferencias('spanstories.editor.ui.v1');
  const acciones = new RegistroAcciones(); registrarAccionesBase(acciones);

  const seleccion = new Seleccion(objetos);
  const capas = new Capas({ state: editor.state, objetos, alCambiar: () => { window.dispatchEvent(new Event('spanstories-editor-capas')); } });
  const portapapeles = new Portapapeles();
  // Variantes: diferencias sobre el escenario base (ambiente + objetos ocultos). Con una activa, ocultar y el ambiente se guardan en ella.
  const variantes = new Variantes({ doc: () => editor.state.escenario, alAplicar: v => runtimeVariante?.aplicar(v), alCambiar: () => { editor.state.dirty = true; } });
  capas.fuenteVariante = () => variantes.ocultosActivos();
  capas.alRestaurar = () => runtimeVariante?.aplicar(variantes.activa);
  let runtimeVariante = null;
  const shell = crearShell({ viewport, preferencias });
  if (studioMode) shell.desacoplar();

  const colisionesActivas = () => obstaculos();
  const gizmo = montarGizmo({ scene, camera, canvas, objetos, seleccion, editor, ground, obstaculos: colisionesActivas, capas, status, preferencias: { leer: (k, v) => preferencias.leer('gizmo:' + k, v), escribir: (k, v) => preferencias.escribir('gizmo:' + k, v) } });
  const vista = crearVista({ camera, target, navigation, objetos, seleccion });
  // Lo seleccionado es el centro de la pantalla y de la órbita en todo momento (CityNavigation.setPivot).
  const cajaPivote = new T.Box3(), cajaUna = new T.Box3();
  navigation?.setPivot?.('editor', out => {
    if (!modoEditor || studioMode) return null;
    const raices = seleccion.raices(); if (!raices.length) return null;
    cajaPivote.makeEmpty(); for (const r of raices) cajaPivote.union(cajaDeRaiz(r, cajaUna));
    return cajaPivote.isEmpty() ? null : cajaPivote.getCenter(out);
  }, () => { try { return gizmo.estado.arrastrando || !!interaccion.arrastrando; } catch { return true; } }); // interaccion se crea más abajo
  const cuadricula = crearCuadricula({ scene, ground, target });
  const miniaturas = crearMiniaturas({ loader });
  const biblioteca = crearBiblioteca({ miniaturas, baseUrl: location.href, estado: t => estado(t) });
  const colocacion = montarColocacion({ host: viewport, canvas, camera, scene, loader, editor, ground, obstaculos: colisionesActivas,
    ajustes: { colision: () => gizmo.estado.colision, apoyo: () => gizmo.estado.apoyo }, alCambiar: () => { barra?.refrescar(); bib?.refrescar(); }, estado: t => estado(t) });

  let pincel = null, panelCesped = null, panelTerreno = null, marcadores = null;
  const dispersion = { activo: false, radio: 6, separacion: 3, escalaMin: .85, escalaMax: 1.2, girar: true };
  let acumulados = [];
  let herramientaActiva = 'mover', modoEditor = true, disposed = false, barra = null, bib = null, menus = null, inv = null, inspector = null, estadoBarra = null;
  function estado(texto) { status(texto); estadoBarra?.mensaje(texto); }

  // -- Contexto compartido por todas las acciones ---------------------------------------------------------------------
  const contextoBase = {
    editor, seleccion, capas, objetos, gizmo, portapapeles, shell, vista, biblioteca, colocacion, cuadricula, ground, estado, variantes, atlasId,
    obstaculos: colisionesActivas,
    get herramientaActiva() { return herramientaActiva; },
    elegirHerramienta(id, modo) { herramientaActiva = id; if (modo) gizmo.setModo(modo); aplicarGizmo(); barra?.refrescar(); },
    copiar() {
      const rs = seleccion.raices().filter(r => r.userData.cityImportId && editor.state.imports.has(r.userData.cityImportId));
      portapapeles.guardar(rs.map(r => ({ id: r.userData.id, posicion: r.position.toArray(), rotacion: [r.rotation.x, r.rotation.y, r.rotation.z], escala: r.scale.toArray() })));
      return rs.length;
    },
    renombrar() { shell.area.izq.querySelector('[data-primaria]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); },
    abrirBiblioteca(pestana) { if (shell.panelOculto('inf')) shell.alternar('inf', true); pestanasInf.elegir(pestana); },
    elegirArchivosGlb() { entradaGlb.click(); },
    elegirArchivoProyecto() { entradaProyecto.click(); },
    vistaGeneral() { if (bounds) vista.encuadrarTodo(bounds); },
    probar() { navigation.setMode('first'); },
    paleta: null, dispersion,
    alternarDispersion() { dispersion.activo ? apagarDispersion() : encenderDispersion(); },
    /** Cambia los objetos añadidos seleccionados por el objeto elegido en la biblioteca (misma posición, giro y escala). */
    async reemplazar() {
      const rs = seleccion.raices().filter(r => adaptadorDe(r, editor.state).puedeDuplicar), item = colocacion.item; if (!rs.length || !item) return;
      const blob = await biblioteca.blobDe(item), destinos = rs.map(r => ({ posicion: r.position.toArray(), rotacion: [r.rotation.x, r.rotation.y, r.rotation.z], escala: r.scale.toArray(), etiqueta: item.nombre }));
      const ids = rs.map(r => r.userData.id);
      editor.state.transaccion('Reemplazar', () => { editor.eliminar(ids); });
      seleccion.limpiar(); const nuevos = await editor.colocarCopias(blob, item.nombre + '.glb', destinos, 'Reemplazar'); seleccion.poner(nuevos, nuevos.at(-1));
      estado(`${rs.length} objeto${rs.length === 1 ? '' : 's'} reemplazado${rs.length === 1 ? '' : 's'} por «${item.nombre}».`);
    },
    /** Guarda la selección (objetos añadidos) como prefab: posiciones relativas al primero. */
    guardarPrefab() {
      const rs = seleccion.raices().filter(r => adaptadorDe(r, editor.state).puedeDuplicar); if (!rs.length) throw new Error('Selecciona objetos añadidos para crear el prefab.');
      const origen = rs[0].position.clone(), items = rs.map(r => { const rec = editor.state.imports.get(r.userData.cityImportId); return { archivo: rec.filename, sha: rec.blob.sha ?? null, position: r.position.toArray().map((v, i) => v - origen.toArray()[i]), rotation: [r.rotation.x, r.rotation.y, r.rotation.z], scale: r.scale.toArray(), etiqueta: r.userData.label }; });
      const nombre = 'Prefab ' + ((editor.state.escenario.prefabs?.length ?? 0) + 1);
      capas.cambiar('Guardar prefab', e => { (e.prefabs ??= []).push({ id: nuevoId('prefab'), nombre, items }); });
      contextoBase.abrirBiblioteca('prefabs'); estado(`«${nombre}» guardado con ${items.length} piezas.`);
    },
    abrirGenerador() { const id = seleccion.ids[0]; window.open(urlEditarEnGenerador(atlasId, id), '_blank', 'noopener'); },
  };
  const contexto = () => contextoBase;

  // -- Entradas de archivo ocultas -----------------------------------------------------------------------------------
  const entradaGlb = el('input', { type: 'file', accept: '.glb', multiple: true, hidden: true });
  const entradaProyecto = el('input', { type: 'file', accept: '.json', hidden: true });
  shell.raiz.append(entradaGlb, entradaProyecto);
  entradaGlb.addEventListener('change', async () => { const l = [...entradaGlb.files]; entradaGlb.value = ''; if (l.length) await importarArchivos(l); });
  entradaProyecto.addEventListener('change', async () => { const f = entradaProyecto.files[0]; entradaProyecto.value = ''; if (!f) return; try { await editor.importProject(await f.text()); } catch (error) { estado(error.message); } });

  /** Archivos GLB soltados o elegidos: se registran UNA vez en la biblioteca y se coloca una copia en `punto` (o en el centro de la vista). */
  async function importarArchivos(archivos, punto = null) {
    const ids = [];
    for (const archivo of archivos) {
      try {
        if (!/\.glb$/i.test(archivo.name)) throw new Error('Solo se admiten archivos .glb.');
        estado('Registrando ' + archivo.name + '…');
        let item = null; try { item = await biblioteca.registrarArchivo(archivo); } catch (error) { estado('No se pudo guardar en la biblioteca (' + error.message + '); se coloca igualmente.'); }
        const blob = item ? await biblioteca.blobDe(item) : archivo;
        const posicion = punto ?? target.toArray().map((v, i) => i === 1 ? ground(target.x, target.z) : v);
        ids.push(...await editor.colocarCopias(blob, archivo.name, [{ posicion, etiqueta: archivo.name.replace(/\.glb$/i, '') }], 'Añadir ' + archivo.name));
      } catch (error) { estado(archivo.name + ': ' + error.message); }
    }
    return ids;
  }

  /** Coloca una copia de un prefab en el centro de la vista, con una sola entrada de historial. */
  async function colocarPrefab(p) {
    const centro = target.toArray().map((v, i) => i === 1 ? ground(target.x, target.z) : v), nuevos = [];
    const blobDe = async it => {
      const rec = [...editor.state.imports.values()].find(r => r.filename === it.archivo); if (rec) return rec.blob;
      const item = biblioteca.todos().find(x => it.sha && x.sha === it.sha); if (!item) throw new Error('Falta el archivo «' + it.archivo + '» de este prefab.'); return biblioteca.blobDe(item);
    };
    const porArchivo = new Map(); for (const it of p.items) { if (!porArchivo.has(it.archivo)) porArchivo.set(it.archivo, []); porArchivo.get(it.archivo).push(it); }
    const preparados = []; for (const [archivo, lista] of porArchivo) preparados.push([archivo, await blobDe(lista[0]), lista]);
    for (const [archivo, blob, lista] of preparados) nuevos.push(...await editor.colocarCopias(blob, archivo, lista.map(it => ({ posicion: it.position.map((v, i) => v + centro[i]), rotacion: it.rotation, escala: it.scale, etiqueta: it.etiqueta })), 'Colocar prefab ' + p.nombre));
    seleccion.poner(nuevos, nuevos.at(-1)); estado(`Prefab «${p.nombre}» colocado (${nuevos.length} piezas).`);
  }

  // -- Pincel de dispersión: reparte copias del objeto armado en la biblioteca; un trazo = una entrada de historial ----
  function encenderDispersion() {
    if (!colocacion.armado || !pincel) { estado('Elige primero un objeto en la biblioteca.'); return; }
    dispersion.activo = true; colocacion.pausar(true); estado('Pincel de dispersión: arrastra sobre el suelo para repartir «' + colocacion.item.nombre + '». Esc para salir.');
    pincel.tomar('dispersion', {
      activo: () => dispersion.activo, radio: () => dispersion.radio,
      alEmpezar() { acumulados = []; },
      alPintar(p) {
        const item = colocacion.item; if (!item || acumulados.length >= 60) return;     // tope por trazo: cada copia se prepara por separado
        const semilla = Math.floor(p.x * 131 + p.z * 71 + acumulados.length * 17), r = aleatorio(semilla);
        const dims = item.dimensiones?.some(Boolean) ? item.dimensiones : [1, 1, 1], mitad = Math.max(.2, Math.max(dims[0], dims[2]) / 2);
        const existentes = acumulados.map(a => [a.posicion[0], a.posicion[2]]);
        for (const [x, z] of generarPuntos({ x: p.x, z: p.z, radio: dispersion.radio, separacion: dispersion.separacion, existentes, semilla, maximo: 12 })) {
          const y = ground(x, z);
          if (gizmo.estado.colision) {
            const caja = new T.Box3(new T.Vector3(x - mitad, y, z - mitad), new T.Vector3(x + mitad, y + Math.max(.5, dims[1]), z + mitad));
            if (resolverMovimiento({ caja, ground, obstaculos: colisionesActivas(), apoyar: false, chocar: true }).choca.length) continue;
          }
          acumulados.push({ posicion: [x, y, z], ...variacion(r, dispersion), etiqueta: item.nombre });
        }
      },
      async alTerminar() {
        const item = colocacion.item, lista = acumulados; acumulados = []; if (!item || !lista.length) return;
        try { await editor.colocarCopias(await biblioteca.blobDe(item), item.nombre + '.glb', lista, 'Dispersar ' + item.nombre); estado(lista.length + ' copias de «' + item.nombre + '» repartidas.'); } catch (error) { estado(error.message); }
      },
    }, () => { dispersion.activo = false; colocacion.pausar(false); menus?.dibujar(); });
    barra?.refrescar(); menus?.dibujar();
  }
  function apagarDispersion() { dispersion.activo = false; colocacion.pausar(false); pincel?.soltar('dispersion'); barra?.refrescar(); menus?.dibujar(); }
  contribuciones.Herramientas = [...(contribuciones.Herramientas ?? []), () => {
    const fila = (t, k, min, max, paso) => el('div', { class: 'ed-campo', style: 'padding:0 10px' }, el('span', { class: 'ed-etiqueta' }, t), rango({ min, max, paso, valor: dispersion[k], titulo: t, alCambiar: v => { dispersion[k] = v; } }));
    return el('div', {}, el('div', { class: 'ed-hub-grupo' }, 'Pincel de dispersión'), fila('Radio (m)', 'radio', 1, 30, 1), fila('Separación (m)', 'separacion', .5, 15, .5), fila('Escala mínima', 'escalaMin', .3, 1.5, .05), fila('Escala máxima', 'escalaMax', .5, 2.5, .05));
  }];

  // -- Interfaz -----------------------------------------------------------------------------------------------------
  const paleta = montarPaleta({ raiz: shell.raiz, acciones, contexto }); contextoBase.paleta = paleta;
  const contextual = montarMenuContextual({ raiz: shell.raiz, acciones, contexto });
  const izq = shell.pestanas(shell.area.izq, [{ id: 'jerarquia', titulo: 'Jerarquía', icono: () => svg('capas', { tam: 14 }) }, { id: 'capas', titulo: 'Capas', icono: () => svg('capas', { tam: 14 }) }], { clave: 'izq' });
  const pestanasInf = shell.pestanas(shell.area.inf, [{ id: 'biblioteca', titulo: 'Biblioteca de objetos', icono: () => svg('caja', { tam: 14 }) }, { id: 'prefabs', titulo: 'Prefabs', icono: () => svg('agrupar', { tam: 14 }) }, { id: 'inventario', titulo: 'Inventario de la historia', icono: () => svg('estrella', { tam: 14 }) }], { clave: 'inf' });
  const jerarquia = montarJerarquia({ contenedor: izq.cuerpo('jerarquia'), objetos, seleccion, capas, editor, preferencias, mostrarMenu: datos => contextual.mostrar(datos), estado });
  const panelCapas = montarPanelCapas({ contenedor: izq.cuerpo('capas'), capas, seleccion, estado });
  const panelPrefabs = montarPanelPrefabs({ contenedor: pestanasInf.cuerpo('prefabs'), capas, estado, colocarPrefab: p => colocarPrefab(p) });
  bib = montarBiblioteca({ contenedor: pestanasInf.cuerpo('biblioteca'), biblioteca, colocacion, preferencias, estado, registrarArchivos: lista => importarArchivos(lista) });
  inv = montarInventario({ contenedor: pestanasInf.cuerpo('inventario'), objetos, seleccion, capas, zonaId: zone?.id, vocabularioUrl: zone?.lexiconUrl, estado, enfocar: () => vista.encuadrar() });
  inspector = montarInspector({ contenedor: shell.vistaInspector, objetos, seleccion, capas, editor, gizmo, preferencias, ground, obstaculos: colisionesActivas, acciones, contexto, estado, existeId });
  menus = montarMenus({ shell, acciones, contexto, contribuciones, abrirPaleta: () => paleta.abrir(), alElegirEspacio: id => { inspector.elegirEspacio(id); shell.verDerecha('inspector'); menus.cerrar?.(); } });
  // Espacios de trabajo de ambiente: cielo e iluminación, estilo visual (el resto de espacios se registran igual).
  const paneles = [];
  if (entorno) {
    const cambios = crearCambios(entorno, editor.state);
    paneles.push(montarCieloPanel({ entorno, cambios, preferencias, ESTACIONES: clima.ESTACIONES, CLIMAS: clima.CLIMAS }));
    inspector.registrarEspacio('cielo', paneles.at(-1));
    pincel = montarPincel({ host: viewport, canvas, camera, scene, ground });
    marcadores = crearMarcadores({ scene, doc: () => editor.state.escenario });
    runtimeVariante = crearRuntimeVariante({ objetos, entorno, doc: () => editor.state.escenario, capas });
    entorno.destinoAmbiente = perfil => variantes.guardarAmbiente(perfil);
    const panelEscena = montarPanelEscena({ capas, variantes, vista, ground, target, marcadores, preferencias, estado }); paneles.push(panelEscena); inspector.registrarEspacio('escena', panelEscena);
    const partes = [];
    if (cesped) { panelCesped = montarCespedPanel({ entorno, cambios, cesped, pincel, preferencias, estado }); partes.push(panelCesped); }
    if (terreno) { panelTerreno = montarTerrenoPanel({ entorno, cambios, terreno, pincel, preferencias, estado }); partes.push(panelTerreno); }
    paneles.push(...partes);
    inspector.registrarEspacio('terreno', partes.length
      ? { nodo: el('div', {}, ...partes.map(p => p.nodo)), titulo: 'Terreno y vegetación', icono: 'cesped', alMostrar: () => partes.forEach(p => p.alMostrar?.()) }
      : { nodo: el('div', { class: 'ed-vacio' }, 'El césped y el terreno no están disponibles: reinicia el motor (npm run dev:visor) para cargar los módulos del Generador.'), titulo: 'Terreno y vegetación', icono: 'cesped' });
    if (estilos) { paneles.push(montarEstiloPanel({ entorno, cambios, estilos, preferencias, estado })); inspector.registrarEspacio('estilo', paneles.at(-1)); }
  }
  barra = montarHerramientas({ shell, acciones, contexto, gizmo });
  estadoBarra = montarEstado({ shell, editor, seleccion, objetos, gizmo });
  const navEjes = montarNavEjes({ visor: shell.area.visor, camera, vista });
  shell.area.menu.querySelector('[data-accion="probar"]').addEventListener('click', () => navigation.setMode('first'));
  const volver = el('button', { type: 'button', class: 'ed-btn ed-primario', style: 'position:absolute;z-index:8;left:50%;top:12px;transform:translateX(-50%);display:none', onclick: () => navigation.setMode('editor') }, svg('cerrar', { tam: 14 }), el('span', {}, 'Volver al editor (Esc)'));
  shell.area.visor.append(volver);
  const interaccion = montarInteraccion({ host: viewport, canvas, camera, scene, objetos, seleccion, editor, capas, ground, obstaculos: colisionesActivas, gizmo,
    activo: () => modoEditor && !colocacion.armado && !(panelCesped?.pincelActivo() || panelTerreno?.pincelActivo()) && editor.activo && !editor.ocupado, mostrarMenu: datos => contextual.mostrar(datos),
    expandir: ids => capas.expandirSeleccion(ids), ajustes: { colision: () => gizmo.estado.colision, apoyo: () => gizmo.estado.apoyo }, status: estado });
  const atajos = montarAtajos({ acciones, contexto, activo: () => modoEditor && !studioMode && shell.acoplado, alEscape: () => { if (dispersion.activo) apagarDispersion(); else if (colocacion.armado) colocacion.desarmar(); else if (capas.aislando) capas.salirDeAislamiento(); else seleccion.limpiar(); } });

  // Los ajustes antiguos del panel «Opciones» (zona, calidad, diagnóstico, vegetación del Atlas) viven ahora en el menú Vista.
  const panelAntiguo = document.querySelector('#panel');
  const seccionesAntiguas = panelAntiguo ? [...panelAntiguo.querySelectorAll(':scope > section')] : [];
  if (panelAntiguo) panelAntiguo.hidden = false;
  contribuciones.Vista = [...(contribuciones.Vista ?? []), () => {
    const caja = el('div', { class: 'ed-seccion-antigua', style: 'padding:6px 10px 12px' });
    for (const s of seccionesAntiguas) caja.append(s);
    return caja;
  }];
  document.querySelector('#panel-toggle') && (document.querySelector('#panel-toggle').style.display = 'none');

  // -- Reacciones ----------------------------------------------------------------------------------------------------
  function aplicarGizmo() { gizmo.enabled(modoEditor && !studioMode && herramientaActiva !== 'seleccionar'); }
  const refrescarTodo = () => { barra.refrescar(); menus.dibujar(); };
  const bajas = [seleccion.alCambiar(refrescarTodo), capas.alCambiar(refrescarTodo), gizmo.alCambiar(() => barra.refrescar()),
    editor.alCambiar(t => { if (t === 'refresco' && (variantes.activa || capas.aislando || capas.e.capas.some(c => !c.visible))) capas.aplicarVisibilidad(); if (t === 'objeto' || t === 'refresco' || t === 'restaurado' || t === 'ocupado') { refrescarTodo(); if (t === 'restaurado') { restaurarDerivados(); entorno?.cargar(validarAmbiente(editor.state.escenario.ambiente)); } } })];
  /** Tras abrir un proyecto: colores de materiales y visibilidad por capas vuelven a aplicarse. */
  function restaurarDerivados() {
    for (const [id, p] of Object.entries(editor.state.escenario.objetos)) { const r = objetos.obtener(id); if (r && p.colores) aplicarColores(r, p.colores); }
    capas.aplicarVisibilidad(); seleccion.depurar(); marcadores?.refrescar();
  }
  setTimeout(() => { restaurarDerivados(); runtimeVariante?.aplicar(variantes.activa); }, 0);
  biblioteca.cargar();

  const redibujar = () => { navEjes.actualizar(); cuadricula.actualizar(); };
  let marco = 0; const bucle = () => { if (disposed) return; redibujar(); marco = requestAnimationFrame(bucle); }; marco = requestAnimationFrame(bucle);

  return {
    gizmo, seleccion, capas, acciones, shell, vista, biblioteca, colocacion, inspector, menus, paleta, interaccion, portapapeles, cuadricula, contexto: contextoBase,
    importarArchivos,
    /** Modo de navegación del motor: en Editor se ven los paneles; al probar caminando el visor ocupa toda la pantalla. */
    modoCambiado(modo) {
      modoEditor = modo === 'editor'; aplicarGizmo();
      if (shell.acoplado) { shell.pantallaCompleta(!modoEditor); volver.style.display = modoEditor ? 'none' : ''; }
      if (!modoEditor) { apagarDispersion(); colocacion.desarmar(); contextual.cerrar(); panelCesped?.apagarPincel(); panelTerreno?.apagarPincel(); }
      barra.refrescar();
    },
    /** El Estudio ocupa la pantalla: el editor devuelve el visor a su sitio. */
    entrarEstudio() { studioMode = true; entorno?.suspender(); colocacion.desarmar(); contextual.cerrar(); shell.desacoplar(); aplicarGizmo(); },
    salirEstudio() { studioMode = false; entorno?.reanudar(); shell.acoplar(); aplicarGizmo(); },
    sync() { gizmo.sync(); },
    /** Story Studio: muestra una variante sin cambiar la que está guardada como activa. */
    verVariante(id) { runtimeVariante?.aplicar(id ? variantes.porId(id) : null); },
    dispose() {
      disposed = true; cancelAnimationFrame(marco); bajas.forEach(b => b()); navigation?.setPivot?.('editor', null);
      atajos.dispose(); interaccion.dispose(); colocacion.dispose(); contextual.dispose(); paleta.dispose(); estadoBarra.dispose(); navEjes.dispose();
      inv.dispose(); bib.dispose(); inspector.dispose(); panelCapas.dispose(); jerarquia.dispose(); menus.dispose(); biblioteca.dispose(); miniaturas.dispose();
      paneles.forEach(p => p.dispose?.()); marcadores?.dispose(); panelPrefabs.dispose(); pincel?.dispose(); cuadricula.dispose(); gizmo.dispose(); seleccion.dispose(); shell.dispose();
    },
  };
}
