"""Reload the installed update without saving or resetting paint/history/settings."""
import bpy,sys,importlib,hashlib,json
from pathlib import Path
ROOT=Path(r'D:\Español\imagen para animación\Animation app\SpanStories Texture Painter')
addon=next(m for n,m in sys.modules.items() if n.endswith('spanstories_texture_painter') and hasattr(m,'core'))
ui=addon.ui;core=addon.core;cfg=bpy.context.scene.sstp
chosen=bpy.context.object
if chosen.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.name in ('Lamine',chosen.name)]
fingerprints={o.name:core.fingerprint(o) for o in meshes}
originals={im.name:hashlib.sha256(core.pixels(im).tobytes()).hexdigest() for o in meshes for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and (im:=n.image) and im.has_data}
values={p.identifier:tuple(getattr(cfg,p.identifier)) if getattr(p,'is_array',False) else getattr(cfg,p.identifier) for p in cfg.bl_rna.properties if p.identifier!='rna_type' and p.type!='COLLECTION' and not p.is_readonly}
palette=[(x.name,tuple(x.color)) for x in cfg.palette]
refs=[(x.name,x.image) for x in cfg.references]
history=core._history
ui.unregister();importlib.reload(core);core._history=history
policy=importlib.import_module(addon.__name__+'.policy');importlib.reload(policy)
importlib.reload(importlib.import_module(addon.__name__+'.agent'))
importlib.reload(ui);ui.register();importlib.reload(addon)
cfg=bpy.context.scene.sstp
for k,v in values.items():
    if k!='target':setattr(cfg,k,v)
cfg.palette.clear()
for name,color in palette:x=cfg.palette.add();x.name=name;x.color=color
cfg.references.clear()
for name,image in refs:x=cfg.references.add();x.name=name;x.image=image
cfg.target=chosen
result={'version':policy.VERSION,'target':chosen.name,'uv_image':[a.spaces.active.image.name if a.spaces.active.image else None for a in sorted(bpy.context.screen.areas,key=lambda a:a.x) if a.type=='IMAGE_EDITOR'],'geometry_uv_rig_unchanged':all(core.fingerprint(o)==fingerprints[o.name] for o in meshes),'original_pixels_unchanged':all(hashlib.sha256(core.pixels(bpy.data.images[n]).tobytes()).hexdigest()==h for n,h in originals.items()),'view_visible':[o.name for o in bpy.context.view_layer.objects if o.type=='MESH' and o.visible_get(viewport=next(a.spaces.active for a in bpy.context.screen.areas if a.type=='VIEW_3D'))],'draw_errors':ui._draw_errors,'saved_blend':False}
assert result['geometry_uv_rig_unchanged'] and result['original_pixels_unchanged']
(ROOT/'evidence'/'live-upgrade-0.1.4.json').write_text(json.dumps(result,indent=2),encoding='utf8')
