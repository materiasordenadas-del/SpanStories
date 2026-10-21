"""Original H01/H02 neutral albedo, transient emission only, never saves."""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector

out=Path(sys.argv[sys.argv.index('--')+1])
base=Path('D:/Español/imagen para animación/Primera ciudad/Barcelona_PasseigGracia')
for image in bpy.data.images:
    if image.name.startswith(('H01_trencadis_albedo_512','H02_esgrafiado_albedo_1024')) and not image.packed_file:
        image.filepath=str(base/'texturas'/image.name)
        image.reload()
objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(('H01_','H02_')) and not o.hide_render]
for o in bpy.context.scene.objects:
    if o.type!='LIGHT' and o not in objects: o.hide_render=True
for name in {s.material.name for o in objects for s in o.material_slots if s.material}:
    m=bpy.data.materials[name];nodes=m.node_tree.nodes;links=m.node_tree.links
    shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    emission=nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value=1
    if shader.inputs['Base Color'].is_linked: links.new(shader.inputs['Base Color'].links[0].from_socket,emission.inputs['Color'])
    else: emission.inputs['Color'].default_value=shader.inputs['Base Color'].default_value
    links.new(emission.outputs[0],output.inputs['Surface'])
bounds=[o.matrix_world@Vector(c) for o in objects if o.name in ('H01_piedra_esculpida','H02_piedra_planta_baja') for c in o.bound_box]
minx=min(c.x for c in bounds);miny=min(c.y for c in bounds);maxy=max(c.y for c in bounds)
center_y=(miny+maxy)/2
camera_data=bpy.data.cameras.new('AUDIT_ONLY_Camera');camera=bpy.data.objects.new('AUDIT_ONLY_Camera',camera_data)
bpy.context.scene.collection.objects.link(camera)
camera.location=(minx+35,center_y,8.5)
target=Vector((minx,center_y,8.5));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=maxy-miny+1.0
scene=bpy.context.scene;scene.camera=camera
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1500;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
scene.render.filepath=str(out)
print('AUDIT_ALBEDO',json.dumps({'output':str(out),'camera':list(camera.location),'target':list(target),'orthoWidth':camera_data.ortho_scale,'sourceNotSaved':True,'source':bpy.data.filepath}),flush=True)
bpy.ops.render.render(write_still=True)
