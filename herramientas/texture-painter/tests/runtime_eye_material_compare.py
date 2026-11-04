"""Compare original and painting materials with the same camera, without editing a mesh."""
from pathlib import Path
import json
import bpy,gpu,numpy as np
from mathutils import Vector,Matrix
from spanstories_texture_painter import core

ROOT=Path(__file__).resolve().parents[1]
context=bpy.context;ob=context.scene.sstp.target;s=core.state(ob)
saved=[(slot.link,slot.material) for slot in ob.material_slots]
before=core.fingerprint(ob)
area=next(a for a in context.screen.areas if a.type=='VIEW_3D');region=next(r for r in area.regions if r.type=='WINDOW')
camera=Vector((0,-1,.885));target=Vector((0,0,.885))
view=(Matrix.Translation(camera)@(target-camera).to_track_quat('-Z','Y').to_matrix().to_4x4()).inverted()
extent=.23;near=.01;far=10
projection=Matrix(((2/extent,0,0,0),(0,2/extent,0,0),(0,0,-2/(far-near),-(far+near)/(far-near)),(0,0,0,1)))
images={}
try:
    for label in ('working','original'):
        for index,slot in enumerate(ob.material_slots):
            slot.link='OBJECT'
            slot.material=saved[index][1] if label=='working' else bpy.data.materials[s['slots'][str(index)]['original_material']]
        context.view_layer.update()
        off=gpu.types.GPUOffScreen(768,768)
        try:
            with context.temp_override(area=area,region=region):
                off.draw_view3d(context.scene,context.view_layer,area.spaces.active,region,view,projection,do_color_management=False)
                with off.bind():a=np.asarray(gpu.state.active_framebuffer_get().read_color(0,0,768,768,4,0,'FLOAT')).reshape(768,768,4).copy()
            images[label]=a
            im=core.encoded_image('SSTP material comparison',a)
            try:im.filepath_raw=str(ROOT/'evidence'/('eye-'+label+'.png'));im.file_format='PNG';im.save()
            finally:bpy.data.images.remove(im)
        finally:off.free()
finally:
    for slot,(link,mat) in zip(ob.material_slots,saved):slot.link=link;slot.material=mat
    context.view_layer.update()
eye_roi=(slice(365,455),slice(240,530),slice(0,3))
result={'mesh_uv_shape_keys_rig_unchanged':core.fingerprint(ob)==before,'working_image':'eye-working.png','original_image':'eye-original.png','mean_pixel_difference':float(np.abs(images['working']-images['original']).mean()),'eye_roi_difference':float(np.abs(images['working'][eye_roi]-images['original'][eye_roi]).mean())}
(ROOT/'evidence'/'eye-material-compare.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
