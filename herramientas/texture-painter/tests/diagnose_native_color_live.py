"""Measure actual native brush pixels; restore the open scene in finally."""
import bpy,sys,json,hashlib
from pathlib import Path
from types import SimpleNamespace as NS
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
ui=next(v for k,v in sys.modules.items() if k.endswith('spanstories_texture_painter.ui'))
core=ui.core;ob=bpy.context.scene.sstp.target;cfg=bpy.context.scene.sstp
assert ob.mode=='OBJECT' and not ui._paint_selection,'Finish the current stroke before testing'
area=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D')
region=next(r for r in area.regions if r.type=='WINDOW')
hit=None
for y in range(320,region.height-70,24):
    for x in range(24,region.width-24,24):
        candidate=ui.model_hit(bpy.context,area,region,(x,y))
        if candidate[1]:hit=candidate;xy=(x,y);break
    if hit:break
assert hit,'No visible surface for the live brush regression'
face=hit[3]
raw=ob.get(core.KEY);s=core.state(ob);material=ob.active_material_index
stamp=core.fingerprint(ob);selected=[p.select for p in ob.data.polygons];mask=ob.data.use_paint_mask
objects=[o for o in bpy.context.selected_objects];active=bpy.context.view_layer.objects.active
props=('tool','paint_surface','color','brush_size','strength','note','uv_texture','picker')
saved={p:tuple(getattr(cfg,p)) if p=='color' else getattr(cfg,p) for p in props}
paint=bpy.context.scene.tool_settings.image_paint;unified=paint.unified_paint_settings;brush=paint.brush
usaved={p:tuple(getattr(unified,p)) if p=='color' else getattr(unified,p) for p in ('color','size','strength')}
bsaved={p:tuple(getattr(brush,p)) if p=='color' else getattr(brush,p) for p in ('color','size','strength','blend')}
buffers={im.name:core.pixels(im).copy() for im in bpy.data.images if im.has_data and im.channels==4}
history={k:{a:list(b) for a,b in h.items()} for k,h in core._history.items()}
try:
    cfg.paint_surface='MODEL';cfg.color=(.14,.13,.055,1);cfg.brush_size=18;cfg.strength=1
    core.select_face(face)
    with bpy.context.temp_override(area=area,region=region):
        result=bpy.ops.sstp.brush(erase=False)
    assert ob.mode=='TEXTURE_PAINT',str(result)+' '+cfg.note
    name=s['layers'][s['active_layer']]['images']['0']
    stroke=[{'name':'','mouse':(xy[0]+i,xy[1]),'mouse_event':(xy[0]+i,xy[1]),'pressure':1.,'size':18.,'time':i*.01,'is_start':i==0,'location':(0.,0.,0.),'x_tilt':0.,'y_tilt':0.} for i in (0,2,4)]
    traces=[]
    for color in [(.14,.13,.055),(.8,.12,.07),(.04,.1,.65)]:
        cfg.color=(*color,1);ui.color_changed(cfg,bpy.context)
        before=core.pixels(bpy.data.images[name])
        with bpy.context.temp_override(area=area,region=region):
            outcome=bpy.ops.paint.image_paint('EXEC_DEFAULT',stroke=stroke,mode='NORMAL',brush_toggle='None')
        after=core.pixels(bpy.data.images[name]);changed=np.any(after!=before,axis=2)
        pixels=after[changed];assert len(pixels),'Native brush did not write any pixels'
        exact=np.max(np.abs(pixels[:,:3]-np.asarray(color)),axis=1)<1e-5
        assert exact.sum()>=5,'Native brush wrote a different color: '+str(np.median(pixels[:,:3],axis=0))
        ui.refresh_native_paint(ob)
        sanitized=core.pixels(bpy.data.images[name])
        assert np.any(np.max(np.abs(sanitized[changed,:3]-np.asarray(color)),axis=1)<1e-5),'Protected stroke lost the intended color'
        protected=core.native_paint_pixels(ob,0,after,before,core.selected(ob))
        assert np.array_equal(sanitized,protected),'Native protection output differs'
        traces.append({'requested_linear':list(color),'pixels_changed':len(pixels),
                       'exact_color_pixels':int(exact.sum()),'written_rgb_median':np.median(pixels[:,:3],axis=0).tolist(),
                       'protected_output_matches':True})
    report={'face':face,'real_native_strokes':len(traces),'traces':traces}
finally:
    if ob.mode=='TEXTURE_PAINT':ui.end_paint(bpy.context)
    for n,data in buffers.items():
        im=bpy.data.images.get(n)
        if im and not np.array_equal(core.pixels(im),data):core.write_pixels(im,data)
    ob[core.KEY]=raw;ob.active_material_index=material
    for p,value in zip(ob.data.polygons,selected):p.select=value
    ob.data.use_paint_mask=mask
    core._history.clear();core._history.update(history)
    for p,value in saved.items():setattr(cfg,p,value)
    for p,value in bsaved.items():setattr(brush,p,value)
    for p,value in usaved.items():setattr(unified,p,value)
    for o in bpy.context.selected_objects:o.select_set(False)
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=active
    core.redraw()
assert core.fingerprint(ob)==stamp
assert all(np.array_equal(core.pixels(bpy.data.images[n]),data) for n,data in buffers.items())
report['all_pixels_and_scene_restored']=True
(ROOT/'evidence/native-color-diagnosis.json').write_text(json.dumps(report,indent=2),encoding='utf8')
