import bpy,sys,json,math
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:]
source,report=args
# Isolated --background --factory-startup session; never connects to an open scene.
bpy.ops.wm.read_factory_settings(use_empty=True)
result=bpy.ops.import_scene.gltf(filepath=source)
assert 'FINISHED' in result
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
buildings=[o for o in meshes if str(o.get('entityId','')).startswith('building:')]
trees={o.get('entityId') for o in meshes if o.get('type')=='tree'}
invalid=[o.name for o in meshes if not all(math.isfinite(v) for row in o.matrix_world for v in row)]
assert not invalid,invalid[:5]
assert len(buildings)>100
assert len(trees)>1000
data={'imported':True,'blender':bpy.app.version_string,'objects':len(bpy.context.scene.objects),'meshes':len(meshes),'buildingEntities':len(buildings),'treeEntities':len(trees),'materials':len(bpy.data.materials),'images':len(bpy.data.images),'invalidTransforms':invalid,'savedBlend':False,'source':source}
Path(report).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print('ATLAS_VERIFY '+json.dumps(data))
