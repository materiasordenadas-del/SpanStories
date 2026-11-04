# Construye biblioteca/boca_tom.blend a partir de las piezas de Tom (dientes sup/inf Jinx y lengua Jinx), normalizadas
# al marco de la boca del complemento: origen en el punto medio de las comisuras (K.C), ejes K.X/K.Y/K.Z y unidades de
# media anchura de boca (K.hw). Se ejecuta UNA vez, con el .blend de Tom abierto y el complemento activo.
# Material único (atlas de color + normales, 2048×1024) empaquetado; sin grupos de vértices ni modificadores.
import bpy, importlib, os, numpy as np
from mathutils import Matrix

DEST = r'D:\Español\imagen para animación\Animación 3D\rig_labial_bendy\codex\plugins\rig-labial-codex\assets\rig_labial_bendy\biblioteca\boca_tom.blend'
TMP = os.environ.get('TEMP', '.')
CARA = 'Tom Holland - cabeza detallada y cuerpo'
PIEZAS = {'dientes_sup': 'Tom - Dientes superiores Jinx', 'dientes_inf': 'Tom - Dientes inferiores Jinx',
          'lengua': 'Tom - Lengua Jinx'}

CA = importlib.import_module('bl_ext.user_default.rig_labial_bendy.nucleo.facs.cara')
cara = bpy.data.objects[CARA]
ctrl = bpy.data.objects[CARA + '_Cara_Control']
# neutro: canales a 0 y sin acción (la mandíbula de los dientes inferiores sale de un driver)
ad = ctrl.animation_data; act = ad.action if ad else None
vals = {k: ctrl[k] for k in ctrl.keys() if k.startswith('v_')}
if ad: ad.action = None
for k in vals: ctrl[k] = 0.0
bpy.context.view_layer.update(); bpy.context.evaluated_depsgraph_get().update()

K = CA.Cara(cara)
X, Y, Z, C, hw = (np.asarray(v, float) for v in (K.X, K.Y, K.Z, K.C, K.hw))
Fm = np.array([X, Y, Z])                                  # filas = ejes

# ---- material único
def imagen_png(src, nombre, no_color=False):
    """copia a PNG 8 bits (save_render: no depende de que los píxeles estén cargados) y la empaqueta."""
    ruta = os.path.join(TMP, nombre + '.png')
    sc = bpy.context.scene
    ant = (sc.render.image_settings.file_format, sc.render.image_settings.color_mode, sc.render.image_settings.color_depth)
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'; sc.render.image_settings.color_depth = '8'
    try:
        src.save_render(ruta, scene=sc)
    finally:
        sc.render.image_settings.file_format, sc.render.image_settings.color_mode, sc.render.image_settings.color_depth = ant
    im = bpy.data.images.load(ruta)
    im.name = nombre
    im.colorspace_settings.name = 'Non-Color' if no_color else 'sRGB'
    im.pack()
    assert np.array(im.pixels[:], dtype=np.float32).mean() > 0.01, nombre + ' sin píxeles'
    return im

base = bpy.data.objects[PIEZAS['dientes_sup']].data.materials[0]
tex = {nd.name: nd.image for nd in base.node_tree.nodes if nd.type == 'TEX_IMAGE'}
D = next(i for i in tex.values() if '_D.' in i.name)
N = next(i for i in tex.values() if '_N.' in i.name)
Ao = next(i for i in tex.values() if '_Ao.' in i.name)
mat = bpy.data.materials.new('RLB_Tom_Boca')
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
sal = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
pb = nt.nodes.new('ShaderNodeBsdfPrincipled'); pb.inputs['Roughness'].default_value = 0.4
nt.links.new(pb.outputs['BSDF'], sal.inputs['Surface'])
t_d = nt.nodes.new('ShaderNodeTexImage'); t_d.image = imagen_png(D, 'RLB_Tom_Boca_color')
t_a = nt.nodes.new('ShaderNodeTexImage'); t_a.image = imagen_png(Ao, 'RLB_Tom_Boca_ao', True)
mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
nt.links.new(t_d.outputs['Color'], mx.inputs[6]); nt.links.new(t_a.outputs['Color'], mx.inputs[7])
nt.links.new(mx.outputs[2], pb.inputs['Base Color'])
t_n = nt.nodes.new('ShaderNodeTexImage'); t_n.image = imagen_png(N, 'RLB_Tom_Boca_normal', True)
nm = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(t_n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], pb.inputs['Normal'])
mat.use_fake_user = True

# ---- mallas normalizadas
col = bpy.data.collections.new('RLB_boca_tom')
objs = []
for clave, nombre in PIEZAS.items():
    o = bpy.data.objects[nombre]
    me = o.data.copy(); me.name = 'RLB_Tom_' + clave
    Mw = np.array(cara.matrix_world.inverted() @ o.matrix_world)         # pieza -> local de la cara (neutro)
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    P = co @ Mw[:3, :3].T + Mw[:3, 3]
    U = ((P - C) @ Fm.T) / hw
    me.vertices.foreach_set('co', U.ravel())
    me.materials.clear(); me.materials.append(mat)
    for p in me.polygons: p.material_index = 0
    me.update()
    ob = bpy.data.objects.new('RLB_Tom_' + clave, me); col.objects.link(ob); objs.append(ob)
    ob['hw_origen'] = float(hw)
bpy.context.scene.collection.children.link(col)
bpy.data.libraries.write(DEST, set(objs), compress=True)

# ---- limpieza de lo temporal en la sesión
bpy.context.scene.collection.children.unlink(col)
for ob in objs: bpy.data.objects.remove(ob)
bpy.data.collections.remove(col)
for k, v in vals.items(): ctrl[k] = v
if ad: ad.action = act
bpy.context.view_layer.update()
print('escrito', DEST, os.path.getsize(DEST))
