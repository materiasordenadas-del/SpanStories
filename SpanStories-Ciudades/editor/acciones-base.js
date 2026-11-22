// Acciones base del editor. Aquí vive TODO lo que el usuario puede hacer con el escenario: menús, barra, clic derecho,
// atajos y paleta salen de este listado (core/Acciones.js). El contexto `ctx` lo arma Editor.js.
import * as T from '../engine/three.js';
import { capturarObjeto } from '../engine/CityProject.js';
import { resolverMovimiento, cajaDeRaiz } from './herramientas/Colision.js';
import { VISTAS } from './herramientas/Vista.js';
import { alinear, distribuir } from './herramientas/Alinear.js';
import { adaptadorDe, ADAPTADORES } from './core/Adaptadores.js';

const hay = ctx => ctx.seleccion.cantidad > 0;
const sinOcupar = ctx => ctx.editor.activo && !ctx.editor.ocupado;
const editables = ctx => ctx.seleccion.raices().filter(r => r.parent && (!r.userData.atlasBounds || r.userData.atlasEditable) && !ctx.capas.bloqueado(r.userData.id));
const anadidos = ctx => ctx.seleccion.raices().filter(r => adaptadorDe(r, ctx.editor.state).puedeDuplicar);
const itemsCajas = ctx => editables(ctx).map(r => ({ id: r.userData.id, raiz: r, caja: cajaDeRaiz(r, new T.Box3()).clone() }));
function moverPorDeltas(ctx, deltas, nombre) {
  const porId = new Map(itemsCajas(ctx).map(i => [i.id, i.raiz]));
  ctx.editor.applyMany(deltas.map(({ id, delta }) => ({ id, data: { position: porId.get(id).position.toArray().map((v, i) => v + delta[i]) } })), nombre);
}
const recuento = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Posición válida (sin hundirse ni chocar) para una copia de `fuente` colocada en `destino`. */
function posicionValida(ctx, fuente, destino) {
  const caja = cajaDeRaiz(fuente, new T.Box3()).clone(), d = new T.Vector3(...destino).sub(fuente.position);
  caja.translate(d);
  const r = resolverMovimiento({ caja, ground: ctx.ground, obstaculos: ctx.obstaculos(), apoyar: ctx.gizmo.estado.apoyo, chocar: ctx.gizmo.estado.colision });
  return new T.Vector3(...destino).add(r.delta).toArray();
}

export function registrarAccionesBase(acciones) {
  const A = (a) => acciones.registrar(a);

  // ---------------------------------------------------------------- Archivo
  A({ id: 'archivo.guardar', nombre: 'Guardar edición', icono: 'guardar', menu: 'Archivo', grupo: 'Proyecto', atajo: 'Ctrl+S', ayuda: 'Escribe una revisión en disco, con los GLB incluidos',
    habilitada: sinOcupar, ejecutar: async ctx => { await ctx.editor.save(); } });
  A({ id: 'archivo.exportar', nombre: 'Exportar proyecto portátil…', icono: 'exportar', menu: 'Archivo', grupo: 'Proyecto', ayuda: 'Descarga un .json con todo el trabajo y los GLB',
    habilitada: sinOcupar, ejecutar: async ctx => { const texto = await ctx.editor.exportProject(), url = URL.createObjectURL(new Blob([texto], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = ctx.editor.cityId.replace(/[^\w.-]+/g, '_') + '.spanstories.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); ctx.estado('Proyecto portátil exportado, incluidos los GLB importados.'); } });
  A({ id: 'archivo.abrir', nombre: 'Abrir proyecto…', icono: 'abrir', menu: 'Archivo', grupo: 'Proyecto', ayuda: 'Abre un .json exportado (antes guarda una recuperación)', habilitada: sinOcupar, ejecutar: ctx => ctx.elegirArchivoProyecto() });
  A({ id: 'archivo.recuperar', nombre: 'Recuperar proyecto anterior', icono: 'recuperar', menu: 'Archivo', grupo: 'Proyecto', habilitada: ctx => sinOcupar(ctx) && ctx.editor.recuperable, ejecutar: async ctx => { await ctx.editor.recuperarAnterior(); } });
  A({ id: 'archivo.probar', nombre: 'Probar caminando', icono: 'jugar', menu: 'Archivo', grupo: 'Escenario', ayuda: 'Pasa a primera persona en el punto de inicio', ejecutar: ctx => ctx.probar() });

  // ---------------------------------------------------------------- Editar
  A({ id: 'editar.deshacer', nombre: 'Deshacer', icono: 'deshacer', menu: 'Editar', grupo: 'Historial', atajo: 'Ctrl+Z', habilitada: ctx => sinOcupar(ctx) && ctx.editor.state.undoStack.length > 0, ejecutar: ctx => { ctx.editor.undo(); } });
  A({ id: 'editar.rehacer', nombre: 'Rehacer', icono: 'rehacer', menu: 'Editar', grupo: 'Historial', atajo: 'Ctrl+Y', habilitada: ctx => sinOcupar(ctx) && ctx.editor.state.redoStack.length > 0, ejecutar: ctx => { ctx.editor.redo(); } });
  A({ id: 'editar.rehacer2', nombre: 'Rehacer (alternativa)', icono: 'rehacer', atajo: 'Ctrl+Shift+Z', habilitada: ctx => sinOcupar(ctx) && ctx.editor.state.redoStack.length > 0, ejecutar: ctx => { ctx.editor.redo(); } });
  A({ id: 'editar.cortar', nombre: 'Cortar', icono: 'cortar', menu: 'Editar', grupo: 'Portapapeles', atajo: 'Ctrl+X', contextos: ['objeto', 'multi'], habilitada: ctx => sinOcupar(ctx) && anadidos(ctx).length > 0, ayuda: 'Solo objetos añadidos',
    ejecutar: async ctx => { ctx.copiar(); ctx.editor.eliminar(anadidos(ctx).map(r => r.userData.id)); } });
  A({ id: 'editar.copiar', nombre: 'Copiar', icono: 'copiar', menu: 'Editar', grupo: 'Portapapeles', atajo: 'Ctrl+C', contextos: ['objeto', 'multi'], habilitada: ctx => anadidos(ctx).length > 0, ayuda: 'Solo objetos añadidos (los originales se mueven, no se copian)', ejecutar: ctx => { const n = ctx.copiar(); ctx.estado(recuento(n, 'objeto copiado', 'objetos copiados') + '.'); } });
  A({ id: 'editar.pegar', nombre: 'Pegar', icono: 'pegar', menu: 'Editar', grupo: 'Portapapeles', atajo: 'Ctrl+V', contextos: ['objeto', 'multi', 'vacio'], habilitada: ctx => sinOcupar(ctx) && !ctx.portapapeles.vacio,
    etiquetaContexto: ctx => ctx.punto ? 'Pegar aquí' : 'Pegar',
    ejecutar: async ctx => {
      const destinos = ctx.portapapeles.destinos(ctx.punto ?? null), porRecurso = new Map();
      for (const d of destinos) {
        const fuente = ctx.objetos.obtener(d.origen), registro = fuente && ctx.editor.state.imports.get(fuente.userData.cityImportId); if (!registro) continue;
        const clave = registro.id; if (!porRecurso.has(clave)) porRecurso.set(clave, { registro, items: [] });
        porRecurso.get(clave).items.push({ posicion: posicionValida(ctx, fuente, d.posicion), rotacion: d.rotacion, escala: d.escala, etiqueta: fuente.userData.label });
      }
      let total = 0, ids = [];
      for (const { registro, items } of porRecurso.values()) { ids.push(...await ctx.editor.colocarCopias(registro.blob, registro.filename, items, 'Pegar')); total += items.length; }
      if (ids.length) ctx.seleccion.poner(ids, ids.at(-1));
      ctx.estado(total ? recuento(total, 'objeto pegado', 'objetos pegados') + '.' : 'No se pudo pegar: los originales ya no están en el escenario.');
    } });
  A({ id: 'editar.duplicar', nombre: 'Duplicar', icono: 'duplicar', menu: 'Editar', grupo: 'Portapapeles', atajo: 'Ctrl+D', contextos: ['objeto', 'multi'], habilitada: ctx => sinOcupar(ctx) && anadidos(ctx).length > 0, ayuda: 'Solo objetos añadidos',
    ejecutar: async ctx => { const ids = await ctx.editor.duplicar(anadidos(ctx).map(r => r.userData.id)); ctx.seleccion.poner(ids, ids.at(-1)); } });
  A({ id: 'editar.eliminar', nombre: 'Eliminar', icono: 'papelera', menu: 'Editar', grupo: 'Portapapeles', atajo: 'Delete', contextos: ['objeto', 'multi'], habilitada: ctx => sinOcupar(ctx) && editables(ctx).length > 0, ayuda: 'Los objetos añadidos desaparecen; los originales se ocultan',
    ejecutar: ctx => { const ids = editables(ctx).map(r => r.userData.id); ctx.seleccion.limpiar(); ctx.editor.eliminar(ids); } });
  A({ id: 'editar.renombrar', nombre: 'Renombrar', icono: 'texto', menu: 'Editar', grupo: 'Organizar', atajo: 'F2', contextos: ['objeto'], habilitada: ctx => ctx.seleccion.cantidad === 1, ejecutar: ctx => ctx.renombrar() });
  A({ id: 'editar.agrupar', nombre: 'Agrupar', icono: 'agrupar', menu: 'Editar', grupo: 'Organizar', atajo: 'Ctrl+G', contextos: ['multi'], habilitada: ctx => sinOcupar(ctx) && ctx.seleccion.cantidad > 1, ejecutar: ctx => { ctx.capas.agrupar(ctx.seleccion.ids, 'Grupo ' + (ctx.capas.e.grupos.length + 1)); ctx.estado('Grupo creado · al elegir uno se eligen todos.'); } });
  A({ id: 'editar.desagrupar', nombre: 'Desagrupar', icono: 'desagrupar', menu: 'Editar', grupo: 'Organizar', atajo: 'Ctrl+Shift+G', contextos: ['objeto', 'multi'], habilitada: ctx => sinOcupar(ctx) && ctx.seleccion.ids.some(i => ctx.capas.grupoDe(i)), ejecutar: ctx => { for (const g of new Set(ctx.seleccion.ids.map(i => ctx.capas.grupoDe(i)).filter(Boolean))) ctx.capas.desagrupar(g); } });
  A({ id: 'editar.aislar', nombre: 'Aislar selección', icono: 'aislar', menu: 'Editar', grupo: 'Organizar', atajo: 'Shift+H', contextos: ['objeto', 'multi'], marcada: ctx => ctx.capas.aislando, habilitada: ctx => ctx.capas.aislando || hay(ctx), ayuda: 'Oculta todo lo demás para trabajar con la selección',
    ejecutar: ctx => { if (ctx.capas.aislando) ctx.capas.salirDeAislamiento(); else ctx.capas.aislar(ctx.seleccion.ids); } });
  A({ id: 'editar.bloquear', nombre: 'Bloquear / desbloquear', icono: 'candado', menu: 'Editar', grupo: 'Organizar', atajo: 'Ctrl+L', contextos: ['objeto', 'multi'], habilitada: ctx => sinOcupar(ctx) && hay(ctx), ejecutar: ctx => { const ids = ctx.seleccion.ids, todos = ids.every(i => ctx.capas.propiedades(i).bloqueado); ctx.capas.bloquear(ids, !todos); } });
  A({ id: 'editar.ocultar', nombre: 'Ocultar / mostrar', icono: 'ojo', menu: 'Editar', grupo: 'Organizar', atajo: 'H', contextos: ['objeto', 'multi'], habilitada: ctx => sinOcupar(ctx) && editables(ctx).length > 0, ayuda: 'Con una variante activa solo la oculta en esa variante',
    ejecutar: ctx => {
      const rs = editables(ctx), ids = rs.map(r => r.userData.id);
      if (ctx.variantes.activa) {          // dentro de una variante: se oculta SOLO en ella, el escenario base no cambia
        const oculto = !ids.every(i => ctx.variantes.ocultosActivos().has(i));
        ctx.capas.cambiar('Ocultar en variante', () => { for (const i of ids) if (ctx.variantes.ocultosActivos().has(i) !== oculto) ctx.variantes.alternarOculto(i); });
        if (oculto) ctx.seleccion.limpiar(); return;
      }
      const oculto = !rs.every(r => r.userData.ocultoUsuario); ctx.editor.applyMany(rs.map(r => ({ id: r.userData.id, data: { hidden: oculto } }))); ctx.capas.aplicarVisibilidad(ids); if (oculto) ctx.seleccion.limpiar();
    } });
  A({ id: 'editar.mostrarTodo', nombre: 'Mostrar todo lo oculto', icono: 'ojo', menu: 'Editar', grupo: 'Organizar', contextos: ['vacio'], habilitada: ctx => sinOcupar(ctx) && [...ctx.objetos.entries.values()].some(e => e.raiz.userData.ocultoUsuario), ejecutar: ctx => { const n = ctx.capas.mostrarTodo(); ctx.estado(recuento(n, 'objeto vuelve a verse', 'objetos vuelven a verse') + '.'); } });
  A({ id: 'editar.seleccionarTodo', nombre: 'Seleccionar todo', icono: 'seleccionar', menu: 'Editar', grupo: 'Organizar', atajo: 'Ctrl+A', contextos: ['vacio'], ejecutar: ctx => { const ids = [...ctx.objetos.entries.keys()].filter(i => ctx.objetos.obtener(i).visible && !ctx.capas.bloqueado(i)); ctx.seleccion.poner(ids); } });
  A({ id: 'transformar.alSuelo', nombre: 'Al suelo', icono: 'suelo', menu: 'Editar', grupo: 'Colocación', contextos: ['objeto', 'multi'], habilitada: ctx => sinOcupar(ctx) && editables(ctx).length > 0, ayuda: 'Apoya la selección sobre el terreno',
    ejecutar: ctx => { const rs = editables(ctx), caja = new T.Box3(); for (const r of rs) caja.union(cajaDeRaiz(r, new T.Box3()).clone()); const resultado = resolverMovimiento({ caja, ground: ctx.ground, apoyar: true, chocar: false }); const base = Math.max(...[caja.min.x, caja.max.x].flatMap(x => [caja.min.z, caja.max.z].map(z => ctx.ground(x, z)))); const dy = base - caja.min.y;
      ctx.editor.applyMany(rs.map(r => ({ id: r.userData.id, data: { position: r.position.toArray().map((v, i) => i === 1 ? v + dy : v) } }))); void resultado; } });
  A({ id: 'transformar.restaurar', nombre: 'Restaurar original', icono: 'restaurar', menu: 'Editar', grupo: 'Colocación', contextos: ['objeto', 'multi'], habilitada: ctx => sinOcupar(ctx) && editables(ctx).some(r => ctx.editor.state.baseline.has(r.userData.id)), ayuda: 'Devuelve el objeto a su posición, giro y escala originales',
    ejecutar: ctx => { const items = editables(ctx).filter(r => ctx.editor.state.baseline.has(r.userData.id)).map(r => { const b = ctx.editor.state.baseline.get(r.userData.id); return { id: r.userData.id, data: { position: b.position, rotation: b.rotation, scale: b.scale, hidden: b.hidden } }; }); ctx.editor.applyMany(items); ctx.capas.aplicarVisibilidad(items.map(i => i.id)); } });


  // ---- Alinear y distribuir (varios objetos)
  const NOMBRE_EJE = { x: 'X', y: 'Y (altura)', z: 'Z' }, NOMBRE_DONDE = { min: 'al mínimo', centro: 'al centro', max: 'al máximo' };
  for (const eje of ['x', 'y', 'z']) for (const donde of ['min', 'centro', 'max'])
    A({ id: `editar.alinear.${eje}.${donde}`, nombre: `Alinear ${NOMBRE_EJE[eje]} ${NOMBRE_DONDE[donde]}`, icono: 'ortografica', menu: 'Editar', grupo: 'Alinear y distribuir', contextos: [], habilitada: ctx => sinOcupar(ctx) && editables(ctx).length > 1, ejecutar: ctx => moverPorDeltas(ctx, alinear(itemsCajas(ctx), eje, donde), 'Alinear') });
  for (const eje of ['x', 'y', 'z'])
    A({ id: `editar.distribuir.${eje}`, nombre: `Distribuir en ${NOMBRE_EJE[eje]}`, icono: 'cuadricula', menu: 'Editar', grupo: 'Alinear y distribuir', habilitada: ctx => sinOcupar(ctx) && editables(ctx).length > 2, ayuda: 'Huecos iguales entre los objetos; los extremos no se mueven', ejecutar: ctx => moverPorDeltas(ctx, distribuir(itemsCajas(ctx), eje), 'Distribuir') });
  A({ id: 'editar.reemplazar', nombre: 'Reemplazar por el objeto elegido en la biblioteca', icono: 'duplicar', menu: 'Editar', grupo: 'Colocación', contextos: ['objeto', 'multi'], habilitada: ctx => sinOcupar(ctx) && anadidos(ctx).length > 0 && ctx.colocacion.armado, ayuda: 'Elige primero un objeto en la biblioteca; conserva posición, giro y escala', ejecutar: ctx => ctx.reemplazar() });
  A({ id: 'editar.prefab', nombre: 'Guardar selección como prefab', icono: 'agrupar', menu: 'Editar', grupo: 'Colocación', contextos: ['multi'], habilitada: ctx => sinOcupar(ctx) && anadidos(ctx).length > 0, ayuda: 'Un conjunto reutilizable en la pestaña Prefabs', ejecutar: ctx => ctx.guardarPrefab() });
  A({ id: 'editar.generador', nombre: 'Editar en el Generador', icono: 'abrir', menu: 'Editar', grupo: 'Colocación', contextos: ['objeto'], habilitada: ctx => !!ctx.atlasId && ctx.seleccion.cantidad === 1 && adaptadorDe(ctx.seleccion.raices()[0], ctx.editor.state).editarEnGenerador, ayuda: 'Abre el elemento en su origen para cambiar sus parámetros', ejecutar: ctx => ctx.abrirGenerador() });

  // ---------------------------------------------------------------- Añadir
  A({ id: 'anadir.biblioteca', nombre: 'Abrir la biblioteca de objetos', icono: 'caja', menu: 'Añadir', grupo: 'Objetos', contextos: ['vacio'], ejecutar: ctx => ctx.abrirBiblioteca('biblioteca') });
  A({ id: 'anadir.glb', nombre: 'Añadir archivo GLB…', icono: 'mas', menu: 'Añadir', grupo: 'Objetos', habilitada: sinOcupar, ayuda: 'Lo registra en la biblioteca y lo coloca', ejecutar: ctx => ctx.elegirArchivosGlb() });
  A({ id: 'anadir.prefabs', nombre: 'Ver los prefabs guardados', icono: 'agrupar', menu: 'Añadir', grupo: 'Objetos', ejecutar: ctx => ctx.abrirBiblioteca('prefabs') });
  A({ id: 'anadir.inventario', nombre: 'Ver inventario de la historia', icono: 'estrella', menu: 'Añadir', grupo: 'Objetos', ejecutar: ctx => ctx.abrirBiblioteca('inventario') });

  // ---------------------------------------------------------------- Vista
  A({ id: 'vista.encuadrar', nombre: 'Encuadrar selección', icono: 'encuadrar', menu: 'Vista', grupo: 'Cámara', atajo: 'F', contextos: ['objeto', 'multi'], habilitada: hay, ejecutar: ctx => ctx.vista.encuadrar() });
  A({ id: 'vista.general', nombre: 'Vista general del escenario', icono: 'global', menu: 'Vista', grupo: 'Cámara', contextos: ['vacio'], ejecutar: ctx => ctx.vistaGeneral() });
  for (const [id, v] of Object.entries(VISTAS)) A({ id: 'vista.alinear.' + id, nombre: 'Vista ' + v.nombre.toLowerCase(), icono: 'ortografica', menu: 'Vista', grupo: 'Vistas alineadas', ayuda: 'Vista alineada con campo estrecho (aproxima una ortográfica)', ejecutar: ctx => ctx.vista.alinear(id) });
  A({ id: 'vista.ortografica', nombre: 'Vista superior', icono: 'ortografica', ayuda: 'Vista superior alineada', ejecutar: ctx => ctx.vista.alinear('superior') });
  A({ id: 'vista.perspectiva', nombre: 'Volver a perspectiva', icono: 'camara', menu: 'Vista', grupo: 'Vistas alineadas', habilitada: ctx => ctx.vista.alineada, ejecutar: ctx => ctx.vista.restaurar() });
  A({ id: 'vista.cuadricula', nombre: 'Cuadrícula del suelo', icono: 'cuadricula', menu: 'Vista', grupo: 'Ayudas', marcada: ctx => ctx.cuadricula.visible, ejecutar: ctx => ctx.cuadricula.alternar() });
  A({ id: 'vista.pantallaCompleta', nombre: 'Pantalla completa del visor', icono: 'pantallaCompleta', menu: 'Vista', grupo: 'Paneles', atajo: 'Shift+F', marcada: ctx => ctx.shell.enPantallaCompleta, ejecutar: ctx => ctx.shell.pantallaCompleta() });
  A({ id: 'vista.panelIzq', nombre: 'Panel de jerarquía', icono: 'capas', menu: 'Vista', grupo: 'Paneles', marcada: ctx => !ctx.shell.panelOculto('izq'), ejecutar: ctx => ctx.shell.alternar('izq') });
  A({ id: 'vista.panelDer', nombre: 'Panel de propiedades', icono: 'ajustes', menu: 'Vista', grupo: 'Paneles', marcada: ctx => !ctx.shell.panelOculto('der'), ejecutar: ctx => ctx.shell.alternar('der') });
  A({ id: 'vista.panelInf', nombre: 'Biblioteca e inventario', icono: 'caja', menu: 'Vista', grupo: 'Paneles', marcada: ctx => !ctx.shell.panelOculto('inf'), ejecutar: ctx => ctx.shell.alternar('inf') });
  A({ id: 'vista.tema', nombre: 'Tema oscuro', icono: 'luna', menu: 'Vista', grupo: 'Paneles', marcada: ctx => ctx.shell.raiz.dataset.tema === 'oscuro', ejecutar: ctx => ctx.shell.tema(ctx.shell.raiz.dataset.tema === 'oscuro' ? 'claro' : 'oscuro') });

  // ---------------------------------------------------------------- Herramientas
  const herramienta = (id, nombre, icono, modo, atajo) => A({ id: 'herramienta.' + id, nombre, icono, menu: 'Herramientas', grupo: 'Manipulador', atajo, marcada: ctx => ctx.herramientaActiva === id, ejecutar: ctx => ctx.elegirHerramienta(id, modo) });
  herramienta('seleccionar', 'Seleccionar', 'seleccionar', null, 'V');
  herramienta('mover', 'Mover', 'mover', 'translate', 'W');
  herramienta('girar', 'Girar', 'girar', 'rotate', 'E');
  herramienta('escalar', 'Escalar', 'escalar', 'scale', 'R');
  A({ id: 'herramienta.orientacion', nombre: 'Ejes locales / globales', icono: 'local', menu: 'Herramientas', grupo: 'Manipulador', atajo: 'X', marcada: ctx => ctx.gizmo.estado.espacio === 'local', ejecutar: ctx => ctx.gizmo.setEspacio(ctx.gizmo.estado.espacio === 'local' ? 'world' : 'local') });
  A({ id: 'ajuste.iman', nombre: 'Imán (pasos fijos)', icono: 'iman', menu: 'Herramientas', grupo: 'Ajustes', atajo: 'Ctrl+M', ayuda: 'Mueve de 0,5 en 0,5 m, gira de 15° en 15° (o mantén Ctrl al arrastrar)', marcada: ctx => ctx.gizmo.estado.iman, ejecutar: ctx => ctx.gizmo.setImanado(!ctx.gizmo.estado.iman) });
  A({ id: 'ajuste.colision', nombre: 'Colisión con otros objetos', icono: 'colision', menu: 'Herramientas', grupo: 'Ajustes', ayuda: 'El objeto no atraviesa otros objetos (Alt lo suspende mientras arrastras)', marcada: ctx => ctx.gizmo.estado.colision, ejecutar: ctx => ctx.gizmo.setColision(!ctx.gizmo.estado.colision) });
  A({ id: 'ajuste.apoyo', nombre: 'Apoyar en el suelo', icono: 'suelo', menu: 'Herramientas', grupo: 'Ajustes', ayuda: 'El objeto no se hunde en el terreno. Apágalo para objetos flotantes', marcada: ctx => ctx.gizmo.estado.apoyo, ejecutar: ctx => ctx.gizmo.setApoyo(!ctx.gizmo.estado.apoyo) });
  A({ id: 'herramienta.dispersar', nombre: 'Pincel de dispersión (árboles, rocas…)', icono: 'arbol', menu: 'Herramientas', grupo: 'Pincel', marcada: ctx => ctx.dispersion.activo, habilitada: ctx => ctx.dispersion.activo || ctx.colocacion.armado, ayuda: 'Elige un objeto en la biblioteca y pinta para repartir copias', ejecutar: ctx => ctx.alternarDispersion() });
  A({ id: 'herramienta.paleta', nombre: 'Buscar una acción…', icono: 'buscar', menu: 'Herramientas', grupo: 'Ayuda', atajo: 'Ctrl+K', ejecutar: ctx => ctx.paleta.abrir() });
}
