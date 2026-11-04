import bpy,sys,json,math
from pathlib import Path
source,report=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
assert 'FINISHED' in bpy.ops.import_scene.gltf(filepath=source)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
building_ids={o.get('entityId') for o in meshes if str(o.get('entityId','')).startswith('osm:') and o.get('category') in {'residential','commercial'}}
invalid=[o.name for o in meshes if not all(math.isfinite(v) for row in o.matrix_world for v in row)]
assert not invalid
assert len(building_ids)>=390
data={'imported':True,'blender':bpy.app.version_string,'meshes':len(meshes),'geographicBuildingEntities':len(building_ids),'invalidTransforms':invalid,'savedBlend':False,'source':source}
Path(report).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print('ATLAS_GEOGRAPHIC_VERIFY '+json.dumps(data))
