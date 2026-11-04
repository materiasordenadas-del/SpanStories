"""Que la cara siga a la cabeza del rig corporal sin cambiar nada de la cara.

Se emparentan al hueso de la cabeza (DEF-spine.006 en Rigify) los objetos sueltos del rig
facial: su armature (o armatures), la raiz de los ojos y piezas como las lentes de oclusion.
Lo que ya cuelga de esos objetos (dientes, lengua, fondo de boca, globos) sigue solo. Se usa
matrix_parent_inverse, asi que en reposo no se mueve nada; el padre anterior queda en la prop
`padre_anterior` para poder deshacerlo. Los marcadores RLB_* y el panel de control
(<cara>_Cara_Control) no se tocan.
"""
import bpy

HUESO_CABEZA = 'DEF-spine.006'


def candidatos(malla, rig):
    """Objetos de la cara a enganchar: armatures de los modificadores de la malla (salvo el
    del cuerpo) y objetos sin padre que se llaman <cara>_* o <personaje>_*."""
    arms = {m.object for m in malla.modifiers if m.type == 'ARMATURE' and m.object and m.object != rig}
    pref = malla.name.split('.')[0] + '_'
    out = list(arms)
    for o in bpy.data.objects:
        if o in arms or o == malla or o == rig or o.parent is not None:
            continue
        if not o.name.startswith(pref):
            continue
        if o.name.endswith('_Cara_Control') or o.name.startswith(('RLB_', 'ECB_')) or o.name == rig.name:
            continue
        if o.type == 'ARMATURE' and o.name.endswith('_Rig'):
            continue
        # piezas de la cara: mallas/empties que estan a la altura de la cabeza
        out.append(o)
    return out


def enlazar(malla, rig, hueso=HUESO_CABEZA, objetos=None):
    bpy.context.view_layer.update()
    objetos = objetos if objetos is not None else candidatos(malla, rig)
    hechos = []
    for o in objetos:
        mw = o.matrix_world.copy()
        if 'padre_anterior' not in o:
            o['padre_anterior'] = o.parent.name if o.parent else ''
            o['padre_hueso_anterior'] = o.parent_bone
        o.parent = rig
        o.parent_type = 'BONE'
        o.parent_bone = hueso
        bpy.context.view_layer.update()
        # con padre de hueso la matriz va relativa a la COLA del hueso: compensar exacto
        pb = rig.pose.bones[hueso]
        pm = rig.matrix_world @ pb.matrix
        from mathutils import Matrix
        pm = pm @ Matrix.Translation((0, pb.length, 0))
        o.matrix_parent_inverse = pm.inverted()
        o.matrix_world = mw
        hechos.append(o.name)
    return hechos


def desenlazar(objetos):
    for o in objetos:
        if 'padre_anterior' not in o:
            continue
        mw = o.matrix_world.copy()
        p = bpy.data.objects.get(o['padre_anterior'])
        o.parent = p
        if p and o.get('padre_hueso_anterior'):
            o.parent_type = 'BONE'
            o.parent_bone = o['padre_hueso_anterior']
        else:
            o.parent_type = 'OBJECT'
        o.matrix_world = mw
        del o['padre_anterior']
    return True
