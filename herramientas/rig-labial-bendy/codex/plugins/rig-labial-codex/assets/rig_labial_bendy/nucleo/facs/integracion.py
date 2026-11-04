"""Preparación idempotente del editor para cada rig, sin reconstruir la cara."""
import bpy
import os
from . import biblioteca as BI

_miniaturas = []
_en_cola = set()


def _siguiente_miniatura():
    if not _miniaturas:
        return None
    nombre, accion = _miniaturas.pop(0)
    _en_cola.discard((nombre, accion))
    cara, a = bpy.data.objects.get(nombre), bpy.data.actions.get(accion)
    if cara is not None and a is not None and BI.control(cara) is not None:
        from . import poses as PO
        from .. import posicion, util
        ctrl = BI.control(cara)
        valores = {k: float(v) for k, v in ctrl.items() if k.startswith('v_')}
        ad = ctrl.animation_data
        action, slot = (ad.action, ad.action_slot) if ad else (None, None)
        rig = bpy.data.objects.get(cara.name + '_Rig_Labios')
        mirada = rig.pose.bones.get('mirada') if rig else None
        matrix = mirada.matrix_basis.copy() if mirada else None
        try:
            if ad:
                ad.action = None
            with posicion.aislado(cara):
                PO.aplicar(cara, a)
                carpeta = util.carpeta_revision(cara, 'miniaturas')
                os.makedirs(carpeta, exist_ok=True)
                ruta = os.path.join(carpeta, a.get('rlb_facs_expr', a.name) + '.png')
                PO._render_miniatura(cara, ruta, 256, 'TEXTURE')
                PO._poner_miniatura(a, ruta)
        except Exception as exc:
            cara['rlb_miniaturas_aviso'] = str(exc)
        finally:
            for k, v in valores.items():
                ctrl[k] = v
            if ad:
                ad.action = action
                if action and slot:
                    ad.action_slot = slot
            if mirada:
                mirada.matrix_basis = matrix
            ctrl.update_tag()
            bpy.context.view_layer.update()
    return .05 if _miniaturas else None


def programar_miniaturas(cara):
    for a in bpy.data.actions:
        key = (cara.name, a.name)
        if a.name.startswith(cara.name + '_FACS_') and a.asset_data is not None and key not in _en_cola:
            if a.preview is None or min(a.preview.image_size) == 0:
                _miniaturas.append(key); _en_cola.add(key)
    if _miniaturas and not bpy.app.timers.is_registered(_siguiente_miniatura):
        bpy.app.timers.register(_siguiente_miniatura, first_interval=.1)


def cancelar_miniaturas():
    if bpy.app.timers.is_registered(_siguiente_miniatura):
        bpy.app.timers.unregister(_siguiente_miniatura)
    _miniaturas.clear(); _en_cola.clear()


def preparar(cara):
    from . import ajustes as AJ, ajustes_ojos as AO, poses as PO
    from .. import linea as LN
    ctrl = BI.control(cara)
    if ctrl is None or cara.data.shape_keys is None:
        raise RuntimeError('Primero termina el rig facial del personaje')
    if cara.mode != 'OBJECT':
        raise RuntimeError('Termina la edición de la malla antes de preparar el editor')
    informe = {'cara': cara.name, 'ajustes': {}, 'expresiones_creadas': []}
    # Nunca regenerar las formas ni los pesos de un rig que ya se ha editado.
    if not any(k.startswith('v_aj_') and not k.startswith('v_aj_parpado_') for k in ctrl.keys()):
        informe['ajustes'] = AJ.crear(cara)
    try:
        informe['parpados_creados'] = AO.asegurar(cara) if AO.disponible(cara) else []
        cara['rlb_editor_aviso'] = ''
    except (RuntimeError, ValueError) as exc:
        # Un borde pendiente no puede dejar bloqueado el cambio de personaje.
        informe['parpados_creados'] = []
        informe['aviso'] = str(exc)
        cara['rlb_editor_aviso'] = str(exc)
    existentes = {a.name for a in bpy.data.actions}
    faltan = [n for n in BI.cargar()['expresiones'] if PO.nombre_accion(cara, n) not in existentes]
    if faltan:
        informe['expresiones_creadas'] = PO.crear(cara, nombres=faltan, miniaturas=False)
    LN.marcar(cara, 'F_expresiones')
    cara['rlb_editor_preparado'] = 1
    from . import controles as CT
    CT.refrescar_drivers(cara)
    ctrl.update_tag()
    bpy.context.view_layer.update()
    programar_miniaturas(cara)
    panel = getattr(bpy.context.scene, 'rlb', None)
    if panel is not None and panel.cara is cara:
        panel.informe = (f'Editor de {cara.name.strip()} preparado: 42 expresiones y puntos por personaje.'
                         if not informe.get('aviso') else 'Editor disponible. Revisar: ' + informe['aviso'])
    return informe


def pendiente(cara):
    if BI.control(cara) is None:
        return False
    if cara.get('rlb_editor_preparado') != 1:
        return True
    from . import poses as PO
    return any(PO.nombre_accion(cara, n) not in bpy.data.actions for n in BI.cargar()['expresiones'])


def verificar(cara):
    """Valida referencias reales, además del estado calculado de los drivers."""
    ctrl = BI.control(cara)
    errores, drivers = [], 0
    objetos = [o for o in bpy.context.scene.objects
               if o is cara or o.name.startswith(cara.name + '_')]
    for obj in objetos:
        blocks = [obj]
        if obj.type == 'MESH' and obj.data.shape_keys:
            blocks.append(obj.data.shape_keys)
        for block in blocks:
            for fc in (block.animation_data.drivers if block.animation_data else []):
                drivers += 1
                if not fc.driver.is_valid:
                    errores.append(f'{obj.name}: driver inválido {fc.data_path}')
                for var in fc.driver.variables:
                    for target in var.targets:
                        if target.id is None:
                            errores.append(f'{obj.name}: referencia vacía {var.name}')
                        elif var.type == 'SINGLE_PROP':
                            try:
                                target.id.path_resolve(target.data_path)
                            except (ValueError, KeyError):
                                errores.append(f'{obj.name}: ruta inexistente {target.data_path}')
    return {'cara': cara.name, 'canales': len([k for k in ctrl.keys() if k.startswith('v_')]) if ctrl else 0,
            'drivers': drivers, 'puntos': len(cara.get('aj_anclas', {})),
            'expresiones': len([a for a in bpy.data.actions if a.name.startswith(cara.name + '_FACS_')]),
            'errores': errores}
