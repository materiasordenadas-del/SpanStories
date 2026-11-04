"""Añadir puntos manualmente: el usuario elige vértices en modo edición y esos son los puntos de movimiento de un párpado.

Se admiten de 3 a 6 puntos por párpado (parpado_<sup|inf>_<1..6>_<L|R>, numerados a lo largo del borde); cada cara
guarda los que tiene en aj_anclas. Todo el cálculo posterior (máscaras, correctivas, respaldo) es el de
«Regenerar influencias palpebrales».
"""
import json

import bpy
import numpy as np

from . import editor as E

_pendiente = {}   # nombre de la cara -> {'lab': 'sup'|'inf', 'lado': 'L'|'R'}


def pendiente(cara):
    return _pendiente.get(cara.name) if cara is not None else None


def _borde(cara, lab, lado):
    from . import mascaras_parpados as MP
    from . import ajustes_ojos as AO
    me = cara.data
    bordes = json.loads(cara.get('rlb_borde_parpado', '{}'))
    ids = bordes.get(f'{lab}_{lado}')
    if not ids:
        raise RuntimeError(f'No hay borde palpebral {lab}_{lado}; crea los párpados primero')
    P = AO._co(me.shape_keys.reference_key)
    adj = [[] for _ in range(len(me.vertices))]
    for e in me.edges:
        a, b = e.vertices; d = float(np.linalg.norm(P[a] - P[b]))
        adj[a].append((b, d)); adj[b].append((a, d))
    arco, largo = MP._arco(P, adj, ids)
    return P, arco


def _ordenar(elegidos, P, arco):
    """Ordena por la posición a lo largo del borde (la del vértice más cercano); exige posiciones distintas."""
    cerca = {v: int(np.argmin(np.linalg.norm(P[arco] - P[v], axis=1))) for v in elegidos}
    orden = sorted(elegidos, key=lambda v: (cerca[v], v))
    if any(v in (int(arco[0]), int(arco[-1])) for v in orden):
        raise RuntimeError('Las esquinas del ojo no pueden ser puntos; elige vértices entre ellas')
    if len({cerca[v] for v in orden}) < len(orden):
        raise RuntimeError('Hay puntos demasiado juntos a lo largo del párpado; sepáralos para que queden ordenados')
    return orden


def _espejo(cara, P, elegidos, lab, lado):
    """Pareja de cada punto en el otro ojo: el vértice más cercano a su posición reflejada respecto al centro de cada ojo."""
    otro = 'R' if lado == 'L' else 'L'
    bordes = json.loads(cara.get('rlb_borde_parpado', '{}'))
    def centro(l):
        ids = bordes.get(f'sup_{l}', []) + bordes.get(f'inf_{l}', [])
        return P[ids].mean(axis=0), float(np.ptp(P[ids, 0])) or 1.
    c0, a0 = centro(lado); c1, a1 = centro(otro)
    _, arco = _borde(cara, lab, otro)
    res = []
    for v in elegidos:
        q = c1 + (P[v] - c0) * np.array([-1., 1., 1.]) * (a1 / a0)
        d = np.linalg.norm(P - q, axis=1); cand = int(np.argmin(d))
        if float(d[cand]) > .25 * a1:
            return otro, None
        res.append(cand)
    cerca = {v: int(np.argmin(np.linalg.norm(P[arco] - P[v], axis=1))) for v in res}
    res = sorted(res, key=lambda v: (cerca[v], v))
    return otro, (res if len({cerca[v] for v in res}) == len(res) and len(set(res)) == len(res) else None)


def _crear_keys(cara, shapes, anclas, nombres, referencia):
    """Crea las keys (con su control y driver) de los puntos nuevos, con la intensidad de un punto ya existente."""
    from . import ajustes_ojos as AO, biblioteca as BI
    from .construir import poner_key
    ctrl = BI.control(cara); kb = cara.data.shape_keys.key_blocks; base = AO._co(kb.get('Basis') or cara.data.shape_keys.reference_key)
    creadas = []
    for n in nombres:
        if n in kb:
            continue
        delta = shapes[n]
        ref = referencia.get(n)
        if ref:
            punto = n[3:].rsplit('_', 1)[0]
            normal = float(np.linalg.norm(delta[int(anclas[punto])]))
            if normal > 1e-12:
                delta = delta * (ref / normal)
        poner_key(cara, n, delta, 0., (-1., 1.))
        creadas.append(n)
        prop = 'v_' + n
        if prop not in ctrl:
            ctrl[prop] = 0.
        ctrl.id_properties_ui(prop).update(min=-1., max=1., soft_min=-1., soft_max=1.)
        dr = kb[n].driver_add('value').driver
        dr.type = 'SCRIPTED'
        var = dr.variables.new(); var.name = 'v'; var.type = 'SINGLE_PROP'
        var.targets[0].id_type = 'OBJECT'; var.targets[0].id = ctrl
        var.targets[0].data_path = f'["{prop}"]'
        dr.expression = 'v'
    return creadas


def _quitar_keys(cara, puntos):
    """Borra keys, controles, drivers y correctivas de puntos que ya no existen (índices por encima del nuevo total)."""
    from . import ajustes_ojos as AO, biblioteca as BI
    import re
    sk = cara.data.shape_keys; kb = sk.key_blocks; ctrl = BI.control(cara)
    registro = AO._registro(cara)
    patron = re.compile(r'apc_(' + '|'.join(map(re.escape, puntos)) + r')_')
    nombres = [k.name for k in kb if (k.name.startswith('aj_') and k.name[3:].rsplit('_', 1)[0] in puntos)
               or (k.name in registro and patron.match(k.name))]
    ad = sk.animation_data
    for n in nombres:
        path = kb[n].path_from_id('value')
        if ad:
            for fc in [f for f in ad.drivers if f.data_path == path]:
                ad.drivers.remove(fc)
        cara.shape_key_remove(kb[n])
        registro.pop(n, None)
        if ctrl is not None and 'v_' + n in ctrl:
            del ctrl['v_' + n]
    cara['aj_ojos_helpers'] = json.dumps(registro, sort_keys=True)
    cara['facs_keys'] = [k for k in cara.get('facs_keys', []) if k not in nombres]
    return nombres


def _neutra(context, ed, cara):
    """Forma base de la malla sin ninguna expresión: controles a cero y Basis como clave activa (la que se ve en edición)."""
    if ed.activo:
        E._poner_en_cara(context, ed, {}, (0., 0.))
    if cara.data.shape_keys:
        cara.active_shape_key_index = 0
    context.view_layer.update()


def _terminar(context, cara):
    """Devuelve la expresión que estaba puesta y la clave activa de antes."""
    estado = _pendiente.pop(cara.name, None) or {}
    if cara.data.shape_keys and 'clave_activa' in estado:
        cara.active_shape_key_index = min(estado['clave_activa'], len(cara.data.shape_keys.key_blocks) - 1)
    ed = context.scene.rlb_editor
    if ed.activo:
        E._refrescar(context, ed, guardar=False)


def _ganancias_actuales(cara, puntos, anclas):
    """Intensidad que tiene hoy cada punto en su ancla anterior: es la que conserva el punto nuevo."""
    from . import ajustes_ojos as AO
    kb = cara.data.shape_keys.key_blocks; base = AO._co(cara.data.shape_keys.reference_key)
    res = {}
    for p in puntos:
        if p not in anclas:
            continue
        for d in AO.DIRECCIONES:
            n = f'aj_{p}_{d}'
            if n in kb:
                res[n] = float(np.linalg.norm((AO._co(kb[n]) - base)[int(anclas[p])]))
    return res


def _valores_por_defecto(cara, puntos):
    """Estado de pesos sin ajustes manuales de estos puntos (máscara automática, extensiones e intensidad 1)."""
    from . import pesos_parpados as PP
    estado = PP.datos(cara)
    for clave in ('puntos', 'manuales'):
        for p in puntos:
            estado.get(clave, {}).pop(p, None)
    if estado.get('manuales_inactivos'):
        estado['manuales_inactivos'] = [p for p in estado['manuales_inactivos'] if p not in puntos]
    return estado


def _sincronizar_editor(context, cara, quitados):
    """Los deslizadores del editor siguen a los puntos: alta de los nuevos y baja de los que ya no existen."""
    ed = context.scene.rlb_editor
    if not ed.activo:
        return
    for i in reversed(range(len(ed.canales))):
        if ed.canales[i].name.startswith('aj_') and ed.canales[i].name[3:].rsplit('_', 1)[0] in quitados:
            ed.canales.remove(i)
    if ed.punto in quitados:
        ed.punto = next((p for f in E._rejilla('ojos', cara) for p in f), '')
    E._asegurar_bordes_editor(context, cara)


class RLB_OT_puntos_manuales(bpy.types.Operator):
    bl_idname = 'rlb.puntos_manuales'
    bl_label = 'Añadir puntos manualmente'
    bl_description = ('Pone la malla en modo edición: elige 3 a 6 vértices cualesquiera para el párpado seleccionado y pulsa '
                      '«Aplicar puntos»; de ellos salen los puntos de movimiento del rig')
    bl_options = {'REGISTER'}

    def execute(self, context):
        cara = E._cara(context); ed = context.scene.rlb_editor
        if cara is None or cara.mode != 'OBJECT' or E._arr:
            self.report({'WARNING'}, 'Termina la edición o el arrastre antes de añadir puntos')
            return {'CANCELLED'}
        partes = ed.punto.split('_') if ed.punto.startswith('parpado_') else []
        if len(partes) != 4:
            self.report({'WARNING'}, 'Primero selecciona un punto del párpado en Párpados (arriba)')
            return {'CANCELLED'}
        _pendiente[cara.name] = {'lab': partes[1], 'lado': partes[3], 'clave_activa': cara.active_shape_key_index}
        _neutra(context, ed, cara)
        for o in context.view_layer.objects:
            o.select_set(False)
        cara.hide_set(False); cara.select_set(True)
        context.view_layer.objects.active = cara
        bpy.ops.object.mode_set(mode='EDIT')
        context.tool_settings.mesh_select_mode = (True, False, False)
        bpy.ops.mesh.select_all(action='DESELECT')
        self.report({'INFO'}, 'Selecciona de 3 a 6 vértices y pulsa «Aplicar puntos»')
        E._tag_redraw(context)
        return {'FINISHED'}


class RLB_OT_puntos_manuales_aplicar(bpy.types.Operator):
    bl_idname = 'rlb.puntos_manuales_aplicar'
    bl_label = 'Aplicar puntos'
    bl_description = 'Usa los vértices seleccionados como puntos de movimiento del párpado y regenera sus influencias; guarda un respaldo restaurable'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        from . import ajustes_ojos as AO
        cara = E._cara(context)
        objetivo = pendiente(cara)
        if objetivo is None:
            return {'CANCELLED'}
        if cara.mode != 'EDIT':
            self.report({'WARNING'}, 'Vuelve a modo edición para elegir los vértices')
            return {'CANCELLED'}
        import bmesh
        bm = bmesh.from_edit_mesh(cara.data)
        elegidos = sorted(v.index for v in bm.verts if v.select and not v.hide)
        if not 3 <= len(elegidos) <= 6:
            self.report({'WARNING'}, f'Selecciona entre 3 y 6 vértices (hay {len(elegidos)})')
            return {'CANCELLED'}
        bpy.ops.object.mode_set(mode='OBJECT')
        lab, lado = objetivo['lab'], objetivo['lado']
        respaldo = None; viejos = None; creadas = []
        try:
            from . import pesos_parpados as PP
            P, arco = _borde(cara, lab, lado)
            orden = _ordenar(elegidos, P, arco)
            nuevas = {f'parpado_{lab}_{i}_{lado}': v for i, v in enumerate(orden, 1)}
            lados = [(lab, lado)]
            espejo = ''
            if context.scene.rlb_editor.enlazar:
                otro, par = _espejo(cara, P, orden, lab, lado)
                if par:
                    nuevas.update({f'parpado_{lab}_{i}_{otro}': v for i, v in enumerate(par, 1)}); lados.append((lab, otro))
                else:
                    espejo = f' (no se encontró la pareja en el ojo {otro}; quedó como estaba)'
            viejos = cara['aj_anclas'].to_dict() if hasattr(cara['aj_anclas'], 'to_dict') else dict(cara['aj_anclas'])
            anclas = {k: v for k, v in viejos.items() if not any(k.startswith(f'parpado_{l}_') and k.endswith('_' + s_) for l, s_ in lados)}
            anclas.update(nuevas)
            quitar = [p for p in viejos if p not in anclas and p in AO.ZONAS]
            estado = _valores_por_defecto(cara, set(nuevas) | set(quitar))
            op = PP.leer_opciones(cara, estado, permitir_topologia=True)
            actuales = _ganancias_actuales(cara, list(viejos), viejos)
            ganancias = dict(op['ganancias'], **{n: g for n, g in actuales.items() if n[3:].rsplit('_', 1)[0] in nuevas})
            opciones = dict(anclas_override=anclas, extensiones_override=op['longitudinal'],
                            extensiones_transversales_override=op['transversal'], mascaras_override=op['mascaras'],
                            ganancias_override=ganancias, intensidades_override=op['intensidades'])
            AO.actualizar(cara, aplicar=False, **opciones)
            shapes, anchors = AO.plan(cara, anclas_override=anclas, extensiones_override=op['longitudinal'],
                                      extensiones_transversales_override=op['transversal'], mascaras_override=op['mascaras'])
            mal = [p for p, v in nuevas.items() if anchors.get(p) != v]
            if mal:
                raise RuntimeError('El cierre del ojo no mueve esos vértices o quedan fuera de su alcance: ' + ', '.join(mal))
            respaldo = AO.respaldar(cara)
            kb = cara.data.shape_keys.key_blocks
            referencia = {}
            for n in shapes:
                p = n[3:].rsplit('_', 1)[0]
                if p in nuevas and n not in kb:
                    ref = actuales.get(f"aj_{p.rsplit('_', 2)[0]}_1_{p[-1]}_{n.rsplit('_', 1)[1]}")
                    if ref:
                        referencia[n] = ref
            creadas = _crear_keys(cara, shapes, anclas, [n for n in shapes if n[3:].rsplit('_', 1)[0] in nuevas], referencia)
            cara['aj_anclas'] = anclas
            AO.actualizar(cara, aplicar=True, **opciones)
            if quitar:
                _quitar_keys(cara, set(quitar))
            if estado:
                cara[PP.PROPIEDAD] = json.dumps(estado, separators=(',', ':'), ensure_ascii=False)
            for p in list(nuevas) + quitar:
                g = cara.vertex_groups.get(PP.PREFIJO + p)
                if g is not None:
                    cara.vertex_groups.remove(g)
        except Exception as error:
            if creadas:
                try:
                    _quitar_keys(cara, {n[3:].rsplit('_', 1)[0] for n in creadas})
                except Exception:
                    pass
            if viejos is not None:
                cara['aj_anclas'] = viejos
            if respaldo is not None:
                try:
                    AO.restaurar(cara, respaldo['archivo'])
                except Exception as fallo:
                    self.report({'ERROR'}, f'{error}. No se pudo restaurar el respaldo: {fallo}')
                    return {'CANCELLED'}
            self.report({'ERROR'}, str(error))
            bpy.ops.object.mode_set(mode='EDIT')
            return {'CANCELLED'}
        _terminar(context, cara)
        _sincronizar_editor(context, cara, quitar)
        E._pesos_cache.clear(); context.view_layer.update(); E._tag_redraw(context)
        self.report({'INFO'}, f'{len(orden)} puntos en {lab} {lado}{espejo}; respaldo disponible')
        return {'FINISHED'}


class RLB_OT_puntos_manuales_cancelar(bpy.types.Operator):
    bl_idname = 'rlb.puntos_manuales_cancelar'
    bl_label = 'Cancelar'
    bl_description = 'Sale de la elección de puntos sin cambiar nada'
    bl_options = {'REGISTER'}

    def execute(self, context):
        cara = E._cara(context)
        if cara is not None:
            if cara.mode == 'EDIT':
                bpy.ops.object.mode_set(mode='OBJECT')
            _terminar(context, cara)
        E._tag_redraw(context)
        return {'FINISHED'}


def dibujar(col, context, cara):
    objetivo = pendiente(cara)
    col.prop(context.scene.rlb_editor, 'enlazar')
    if objetivo is None:
        col.operator('rlb.puntos_manuales', icon='VERTEXSEL')
        return
    caja = col.box()
    caja.label(text=f'Elige 3 a 6 vértices para el párpado {objetivo["lab"]} {objetivo["lado"]}', icon='VERTEXSEL')
    fila = caja.row(align=True)
    fila.operator('rlb.puntos_manuales_aplicar', icon='CHECKMARK')
    fila.operator('rlb.puntos_manuales_cancelar', icon='X')


CLASES = (RLB_OT_puntos_manuales, RLB_OT_puntos_manuales_aplicar, RLB_OT_puntos_manuales_cancelar)


def register():
    for cls in CLASES:
        bpy.utils.register_class(cls)


def unregister():
    _pendiente.clear()
    for cls in reversed(CLASES):
        bpy.utils.unregister_class(cls)
