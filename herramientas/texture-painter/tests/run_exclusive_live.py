"""Verify exclusive painting against the live overlap, restoring all trial pixels."""
import ast,bpy,sys,json,hashlib
from pathlib import Path
import numpy as np
ROOT=Path(r'D:\Español\imagen para animación\Animation app\SpanStories Texture Painter')
addon=sys.modules['bl_ext.user_default.spanstories_texture_painter'];core=addon.core;ui=addon.ui
path=ROOT/'blender'/'spanstories_texture_painter'/'core.py';tree=ast.parse(path.read_text(encoding='utf8'))
for name in ('exclusive_mask','fill','begin_stroke','native_paint_pixels'):
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
    ns={};exec(compile(ast.Module(body=[node],type_ignores=[]),str(path),'exec'),core.__dict__,ns)
    if name in core.__dict__:
        core.__dict__[name].__code__=ns[name].__code__
        core.__dict__[name].__defaults__=ns[name].__defaults__
    else:core.__dict__[name]=ns[name]
path=ROOT/'blender'/'spanstories_texture_painter'/'ui.py';tree=ast.parse(path.read_text(encoding='utf8'))
for cls,methods in (('SSTP_OT_fill',('invoke','execute')),('SSTP_OT_brush',('invoke','execute')),('SSTP_OT_stroke',('invoke',))):
    node=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name==cls)
    for name in methods:
        fn=next(n for n in node.body if isinstance(n,ast.FunctionDef) and n.name==name)
        ns={};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(path),'exec'),ui.__dict__,ns)
        setattr(getattr(ui,cls),name,ns[name])
ob=core.target();live_ids=list(core.selected(ob));live_material=ob.active_material_index
g=core.geometry(ob)
if 'uv-66babd236039b63b' in g['islands']:core.select_regions(['uv-66babd236039b63b'])
s=core.state(ob);ids=list(core.selected(ob));stamp=core.fingerprint(ob)
slot=core.island_of(g,ids[0])['material'];size=s['resolution']
selected=core.raster(ob,ids,slot,size);safe=core.exclusive_mask(ob,ids,slot,size)
shared=selected&~safe
others=core.raster(ob,[i for i,x in g['islands'].items() if i not in ids and x['material']==slot],slot,size)
names=list(s['layers'][s['active_layer']]['images'].values())
before={n:core.pixels(bpy.data.images[n]).copy() for n in names}
hashes={im.name:hashlib.sha256(core.pixels(im).tobytes()).hexdigest() for im in bpy.data.images if im.has_data}
history=core._history;history_items={k:{a:list(b) for a,b in v.items()} for k,v in history.items()}
checks=[]
def check(name,ok):
    assert ok,name
    checks.append(name)
try:
    check('real shared and exclusive texels found',shared.any() and safe.any())
    result=core.fill((.99,.01,.72,1),exclusive=True)
    image=bpy.data.images[s['layers'][s['active_layer']]['images'][str(slot)]];data=core.pixels(image);old=before[image.name]
    check('fill counts only exclusive pixels',result['pixels']==int(safe.sum()) and result['protected_shared_pixels']==int(shared.sum()))
    check('shared pixels stay bit identical',np.array_equal(data[shared],old[shared]))
    check('all unselected surface pixels stay bit identical',np.array_equal(data[others],old[others]))
    check('exclusive pixels receive requested color',np.allclose(data[safe],(.99,.01,.72,1)))
    trial=old.copy();trial[selected]=(.2,.8,.4,1)
    filtered=core.native_paint_pixels(ob,slot,trial,old,ids)
    check('native brush protection preserves shared texels',np.array_equal(filtered[shared],old[shared]))
    check('native brush protection preserves other surfaces',np.array_equal(filtered[others],old[others]))
    stroke=core.begin_stroke(ob,exclusive=True)
    check('UV brush uses the same exclusive mask',all(not np.any(b['mask']&shared) for b in stroke['buffers'] if b['slot']==slot))
finally:
    for n,data in before.items():core.write_pixels(bpy.data.images[n],data)
    history.clear();history.update(history_items);core.select_regions(live_ids);ob.active_material_index=live_material;core.sync_images(ob);core.redraw()
check('all original and work images restored',all(hashlib.sha256(core.pixels(bpy.data.images[n]).tobytes()).hexdigest()==h for n,h in hashes.items()))
check('geometry UV rig unchanged',core.fingerprint(ob)==stamp)
check('selection preserved',core.selected(ob)==live_ids)
result={'checks':checks,'exclusive_pixels':int(safe.sum()),'protected_shared_pixels':int(shared.sum()),'saved_blend':False,'test_pixels_restored':True}
(ROOT/'evidence'/'exclusive-live.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))
