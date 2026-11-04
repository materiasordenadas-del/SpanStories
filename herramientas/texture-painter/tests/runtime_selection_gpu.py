"""Render the actual highlight callbacks offscreen; no mouse or keyboard input.

Run in the live Blender main thread, not --background. Restores the current
selection and material page. Never paints, edits geometry or saves the blend.
"""
from pathlib import Path
import json
import bpy,gpu,numpy as np
from mathutils import Matrix
from gpu_extras.batch import batch_for_shader
from spanstories_texture_painter import core,ui

ROOT=Path(__file__).resolve().parents[1]
context=bpy.context;ob=context.scene.sstp.target
saved_ids=core.selected(ob);saved_material=ob.active_material_index
before=core.fingerprint(ob)
evidence=[]

def capture(area,filename,draw):
    region=next(r for r in area.regions if r.type=='WINDOW')
    width,height=region.width,region.height
    off=gpu.types.GPUOffScreen(width,height)
    try:
        with context.temp_override(area=area,region=region),off.bind():
            gpu.state.active_framebuffer_get().clear(color=(.055,.065,.08,1),depth=1)
            with gpu.matrix.push_pop(),gpu.matrix.push_pop_projection():
                draw(area,region)
            data=np.asarray(gpu.state.active_framebuffer_get().read_color(0,0,width,height,4,0,'FLOAT')).reshape(height,width,4)
        gold=(data[...,0]>data[...,1]+.08)&(data[...,1]>data[...,2]+.12)
        im=core.encoded_image('SSTP GPU selection evidence',data)
        try:
            im.filepath_raw=str(ROOT/'evidence'/filename);im.file_format='PNG';im.save()
        finally:bpy.data.images.remove(im)
        count=int(gold.sum())
        if count<20:raise AssertionError(filename+': selected region was not visibly highlighted')
        evidence.append({'file':filename,'gold_pixels':count})
    finally:off.free()

def draw_model_base(area,region):
    gpu.matrix.load_matrix(Matrix.Identity(4));gpu.matrix.load_projection_matrix(area.spaces.active.region_3d.perspective_matrix)
    mesh=ob.evaluated_get(context.evaluated_depsgraph_get()).data;mesh.calc_loop_triangles()
    coords=np.array([ob.matrix_world@v.co for v in mesh.vertices],np.float32)
    indices=np.array([t.vertices[:] for t in mesh.loop_triangles],np.int32)
    shader=gpu.shader.from_builtin('UNIFORM_COLOR');shader.bind();shader.uniform_float('color',(.8,.8,.8,1))
    gpu.state.depth_test_set('LESS_EQUAL');gpu.state.depth_mask_set(True)
    batch_for_shader(shader,'TRIS',{'pos':coords[indices].reshape(-1,3)}).draw(shader)
    ui.draw_model()

def draw_uv_base(area,region):
    w,h=region.width,region.height
    gpu.matrix.load_matrix(Matrix.Identity(4));gpu.matrix.load_projection_matrix(Matrix(((2/w,0,0,-1),(0,2/h,0,-1),(0,0,-1,0),(0,0,0,1))))
    gpu.state.depth_test_set('NONE');gpu.state.depth_mask_set(False)
    x0,y0=region.view2d.view_to_region(0,0,clip=False);x1,y1=region.view2d.view_to_region(1,1,clip=False)
    shader=gpu.shader.from_builtin('IMAGE');shader.bind();shader.uniform_sampler('image',gpu.texture.from_image(area.spaces.active.image))
    batch_for_shader(shader,'TRIS',{'pos':[(x0,y0),(x1,y0),(x1,y1),(x0,y0),(x1,y1),(x0,y1)],'texCoord':[(0,0),(1,0),(1,1),(0,0),(1,1),(0,1)]}).draw(shader)
    ui.draw_uv()

try:
    # Same visible face used when reproducing the real click in this session.
    face=24093;ident=core.geometry(ob)['by_face'][face]
    core.select_face(face,ob.name)
    expected=core.selected(ob)
    capture(next(a for a in context.screen.areas if ui.role(a)=='MODEL'),'selection-model-gpu.png',draw_model_base)
    capture(next(a for a in context.screen.areas if ui.role(a)=='UV'),'selection-uv-gpu.png',draw_uv_base)
    # UV -> model: replace the selection through the exact UV hit-test.
    poly=core.geometry(ob)['face_uv'][face];point=poly.mean(0)
    hits=core.pick_uv(float(point[0]),float(point[1]),ob.name)
    assert ident in hits
    core.select_regions(hits,ob.name)
    assert ident in core.selected(ob)
    assert core.fingerprint(ob)==before
    assert not ui._draw_errors,ui._draw_errors
    result={'passed':True,'model_to_uv':expected,'uv_to_model':hits,'visible_highlights':evidence,'mesh_uv_rig_unchanged':True,'overlays_enabled':next(a.spaces.active.overlay.show_overlays for a in context.screen.areas if a.type=='VIEW_3D')}
finally:
    core.select_regions(saved_ids,ob.name)
    if ob.active_material_index!=saved_material:ob.active_material_index=saved_material;core.sync_images(ob)
    gpu.state.depth_test_set('NONE');gpu.state.depth_mask_set(False)
(ROOT/'evidence'/'selection-gpu-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
