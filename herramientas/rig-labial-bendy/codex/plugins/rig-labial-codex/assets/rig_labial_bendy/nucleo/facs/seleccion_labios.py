"""Apertura temporal para seleccionar labios sin escribir la expresión ni la malla."""
import json
import bpy

PROPIEDAD = 'rlb_labios_seleccion_estado'


def mostrar_referencia(context, obligatoria=False):
    ed = context.scene.rlb_editor
    ref = ed.referencia
    if ref is None:
        refs = [o for o in context.scene.objects
                if o.type == 'EMPTY' and o.empty_display_type == 'IMAGE']
        if len(refs) == 1:
            ref = refs[0]; ed.referencia = ref
    if ref is None and obligatoria:
        raise RuntimeError('Elige la imagen de referencia del personaje en el panel')
    for area in context.screen.areas if context.screen else []:
        if area.type != 'VIEW_3D':
            continue
        s = area.spaces.active
        s.overlay.show_overlays = True
        s.overlay.show_extras = True
        s.show_object_viewport_empty = True
        if ref is not None and s.local_view:
            ref.local_view_set(s, True)
        area.tag_redraw()
    if ref is not None:
        ref.hide_viewport = False; ref.hide_set(False)
        ref.show_empty_image_orthographic = True
        ref.show_empty_image_perspective = True
    return ref is not None


def _aplicar(cara, estado):
    ctrl = bpy.data.objects.get(estado['control'])
    if ctrl is None:
        raise RuntimeError('No encuentro el control facial de la apertura temporal')
    ctrl['v_jawOpen'] = max(0.9, estado['valores']['v_jawOpen'])
    if 'v_mouthClose' in estado['valores']:
        ctrl['v_mouthClose'] = 0.0
    ctrl.update_tag()
    cara.show_only_shape_key = False
    cara.use_shape_key_edit_mode = True
    # La superficie y la jaula seleccionable deben seguir la misma pila.
    # Mostrar la pose sin sus deformadores/jaula produce contornos separados.
    for previo in estado.get('modificadores', []):
        m = cara.modifiers.get(previo['nombre'])
        if m is not None and m.type == previo['tipo']:
            m.show_in_editmode = True
            m.show_on_cage = True


def iniciar(context, cara):
    from . import editor as E
    ctrl = E._ctrl(context.scene.rlb_editor)
    if ctrl is None or 'v_jawOpen' not in ctrl:
        raise RuntimeError('Este personaje necesita el control Abrir boca del rig facial')
    if not cara.get(PROPIEDAD):
        estado = {'control': ctrl.name, 'escena': context.scene.name,
                  'solo': cara.show_only_shape_key, 'mezcla': cara.use_shape_key_edit_mode,
                  'valores': {k: float(ctrl[k]) for k in ('v_jawOpen', 'v_mouthClose') if k in ctrl}}
        cara[PROPIEDAD] = json.dumps(estado)
    estado = json.loads(cara[PROPIEDAD])
    if 'modificadores' not in estado:
        estado['modificadores'] = [{'nombre': m.name, 'tipo': m.type,
                                   'edit': m.show_in_editmode, 'cage': m.show_on_cage}
                                  for m in cara.modifiers if m.show_viewport]
        cara[PROPIEDAD] = json.dumps(estado)
    _aplicar(cara, estado)
    mostrar_referencia(context)
    context.view_layer.update()


def mantener(cara):
    """Conservar cambios de los deslizadores mientras solo la vista permanece abierta."""
    texto = cara.get(PROPIEDAD)
    if not texto:
        return
    estado = json.loads(texto)
    ctrl = bpy.data.objects.get(estado['control'])
    if ctrl is None:
        return
    estado['valores'] = {k: float(ctrl[k]) for k in estado['valores']}
    cara[PROPIEDAD] = json.dumps(estado)
    _aplicar(cara, estado)


def restaurar(cara):
    texto = cara.get(PROPIEDAD) if cara is not None else None
    if not texto:
        return False
    estado = json.loads(texto)
    ctrl = bpy.data.objects.get(estado['control'])
    if ctrl is not None:
        for k, v in estado['valores'].items():
            ctrl[k] = v
        ctrl.update_tag()
    cara.show_only_shape_key = estado['solo']
    cara.use_shape_key_edit_mode = estado['mezcla']
    for previo in estado.get('modificadores', []):
        m = cara.modifiers.get(previo['nombre'])
        if m is not None and m.type == previo['tipo']:
            m.show_in_editmode = previo['edit']
            m.show_on_cage = previo['cage']
    del cara[PROPIEDAD]
    return True
