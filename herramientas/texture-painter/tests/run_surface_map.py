"""Regression: selection maps evaluated topology back to exact original faces."""
import bpy,sys,json,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
from spanstories_texture_painter import surface_map as sm, core
sm.register()
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
mesh=bpy.data.meshes.new('Original two faces')
mesh.from_pydata([(0,0,0),(1,0,0),(2,0,0),(0,1,0),(1,1,0),(2,1,0)],[],[(0,1,4,3),(1,2,5,4)])
uv=mesh.uv_layers.new(name='Shared UV')
for face in mesh.polygons:
    for i,p in zip(face.loop_indices,[(0,0),(1,0),(1,1),(0,1)]):uv.data[i].uv=p
ob=bpy.data.objects.new('Mapped surface fixture',mesh);bpy.context.collection.objects.link(ob)
original=core.fingerprint(ob);counts=(len(bpy.data.objects),len(bpy.data.meshes),len(bpy.data.shape_keys))
ev,mapping=sm.evaluated_surface(ob,bpy.context.evaluated_depsgraph_get())
check('no modifiers preserves identity',mapping.tolist()==[0,1])
check('original mesh untouched',core.fingerprint(ob)==original)
sub=ob.modifiers.new('Visible smooth surface','SUBSURF');sub.levels=1
bpy.context.view_layer.update()
ev,mapping=sm.evaluated_surface(ob,bpy.context.evaluated_depsgraph_get())
check('subdivision faces map to both original faces',len(mapping)==8 and np.bincount(mapping).tolist()==[4,4])
check('overlapping UV do not confuse ancestry',set(mapping)=={0,1})
check('temporary objects and meshes cleaned',(len(bpy.data.objects),len(bpy.data.meshes),len(bpy.data.shape_keys))==counts)
ev,cached=sm.evaluated_surface(ob,bpy.context.evaluated_depsgraph_get())
check('unchanged surface reuses cached correspondence',cached is mapping)
grid,outline=sm.edge_masks(ev.data,mapping,{0})
check('original face grid excludes subdivision interior edges',grid.sum()<len(ev.data.edges))
check('selected original face has visible outline',outline.sum()>0)
_,union_outline=sm.edge_masks(ev.data,mapping,{0,1})
check('union outline excludes shared selected boundary',np.any(outline & ~union_outline))

# Delete one base face before subdivision, preserving the original face ID.
delete=ob.modifiers.new('Hide original first face','NODES')
nodes=bpy.data.node_groups.new('Delete face fixture','GeometryNodeTree')
nodes.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry')
nodes.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
inp=nodes.nodes.new('NodeGroupInput');out=nodes.nodes.new('NodeGroupOutput')
remove=nodes.nodes.new('GeometryNodeDeleteGeometry');remove.domain='FACE'
attr=nodes.nodes.new('GeometryNodeInputNamedAttribute');attr.data_type='BOOLEAN';attr.inputs['Name'].default_value='test_hidden'
nodes.links.new(inp.outputs['Geometry'],remove.inputs['Geometry']);nodes.links.new(attr.outputs['Attribute'],remove.inputs['Selection']);nodes.links.new(remove.outputs['Geometry'],out.inputs['Geometry'])
hidden=mesh.attributes.new('test_hidden','BOOLEAN','FACE');hidden.data[0].value=True
delete.node_group=nodes
ob.modifiers.move(1,0);bpy.context.view_layer.update()
ev,mapping=sm.evaluated_surface(ob,bpy.context.evaluated_depsgraph_get())
check('delete plus subdivision retains source face 1',len(mapping)==4 and np.all(mapping==1))
check('original user attributes retained',hidden.data[0].value and len(mesh.polygons)==2)

# A geometry generator has no inherited paint face: never choose arbitrary 0.
nodes.links.remove(next(l for l in list(nodes.links) if l.to_node==out))
cube=nodes.nodes.new('GeometryNodeMeshCube');nodes.links.new(cube.outputs['Mesh'],out.inputs['Geometry'])
bpy.context.view_layer.update()
ev,mapping=sm.evaluated_surface(ob,bpy.context.evaluated_depsgraph_get())
check('generated geometry remains explicitly unmapped',len(mapping)>0 and np.all(mapping==-1))

ob.modifiers.remove(delete);ob.modifiers.remove(sub)
ob.shape_key_add(name='Basis');jaw=ob.shape_key_add(name='jawOpen');jaw.data[0].co.z=.2;jaw.value=.7
sub=ob.modifiers.new('Deformed subdivided surface','SUBSURF');sub.levels=1
before=core.fingerprint(ob);counts=(len(bpy.data.objects),len(bpy.data.meshes),len(bpy.data.shape_keys))
ev,mapping=sm.evaluated_surface(ob,bpy.context.evaluated_depsgraph_get())
check('open mouth shape pose can be mapped',len(mapping)==8)
check('shape key coordinates and values preserved',core.fingerprint(ob)==before)
check('shape key copy cleaned',(len(bpy.data.objects),len(bpy.data.meshes),len(bpy.data.shape_keys))==counts)
source=Path(ROOT/'blender/spanstories_texture_painter/ui.py').read_text(encoding='utf8')
check('picker and overlay both use mapped evaluated geometry',source.count('surface_map.evaluated_surface(')==2)
check('eyedropper uses evaluated UV with source face','uv_point=(uv*weights[:,None]).sum(0)' in source)
check('picker no longer refuses different face counts','Un modificador cambia la topología evaluada' not in source)
sample=np.asarray([(0,0,0),(1,1,1)],np.float32)
check('float subdivision roundoff does not reject matching geometry',sm._positions_match(sample,sample+np.float32(1e-7)))
check('actual displaced geometry is rejected',not sm._positions_match(sample,sample+np.float32(.001)))
check('geometry changes have an invalidation handler',sm.geometry_updated in bpy.app.handlers.depsgraph_update_post)
sm.unregister()
check('invalidation handler removed on disable',sm.geometry_updated not in bpy.app.handlers.depsgraph_update_post)
out={'passed':len(checks),'checks':checks,'blend_saved':False}
directory=ROOT/'evidence/surface-map-0.1.23';directory.mkdir(parents=True,exist_ok=True)
(directory/'regression.json').write_text(json.dumps(out,indent=2),encoding='utf8')
print(json.dumps(out))
