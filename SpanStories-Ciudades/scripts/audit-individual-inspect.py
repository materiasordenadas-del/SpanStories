"""Read-only H01/H02 source provenance and geometry/material comparison."""
import bpy, hashlib, json, sys
from pathlib import Path
import numpy as np

out = Path(sys.argv[sys.argv.index('--')+1])
def digest(collection, prop, width, dtype=np.float32):
    data=np.empty(len(collection)*width,dtype=dtype)
    collection.foreach_get(prop,data)
    return hashlib.sha256(data.tobytes()).hexdigest()
def value(v):
    if isinstance(v,(str,int,float,bool)): return v
    try: return list(v)
    except: return str(v)
def node(n):
    result={'name':n.name,'type':n.bl_idname,'inputs':[]}
    for key in ('attribute_name','uv_map','blend_type','interpolation','extension'):
        if hasattr(n,key): result[key]=getattr(n,key)
    if hasattr(n,'image') and n.image:
        im=n.image
        result['image']={'name':im.name,'path':im.filepath,'size':list(im.size),'colorSpace':im.colorspace_settings.name,'packed':bool(im.packed_file)}
        if im.packed_file: result['image']['sha256']=hashlib.sha256(bytes(im.packed_file.data)).hexdigest()
    for s in n.inputs:
        result['inputs'].append({'name':s.name,'identifier':s.identifier,'default':value(s.default_value) if hasattr(s,'default_value') else None,'links':[{'node':l.from_node.name,'socket':l.from_socket.name,'identifier':l.from_socket.identifier} for l in s.links]})
    return result

result={'source':bpy.data.filepath,'sha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'objects':{},'materials':{},'cameras':{}}
dg=bpy.context.evaluated_depsgraph_get()
for o in bpy.data.objects:
    if not o.name.startswith(('H01_','H02_')) or o.type!='MESH': continue
    ev=o.evaluated_get(dg);m=ev.to_mesh();m.calc_loop_triangles()
    attrs={}
    for a in m.color_attributes:
        unique={tuple(round(x,6) for x in d.color) for d in a.data}
        attrs[a.name]={'type':a.data_type,'domain':a.domain,'count':len(a.data),'sha256':digest(a.data,'color',4),'uniqueCount':len(unique),'samples':sorted(unique)[:15]}
    uvs={a.name:{'count':len(a.data),'sha256':digest(a.data,'uv',2),'activeRender':a.active_render} for a in m.uv_layers}
    result['objects'][o.name]={'materials':[s.material.name if s.material else None for s in o.material_slots],'parent':o.parent.name if o.parent else None,'hidden':o.hide_render,'matrix':[list(row) for row in o.matrix_world],'vertices':len(m.vertices),'loops':len(m.loops),'triangles':len(m.loop_triangles),'vertexSha256':digest(m.vertices,'co',3),'normalSha256':digest(m.corner_normals,'vector',3),'polygonNormalSha256':digest(m.polygons,'normal',3),'smoothFaces':sum(p.use_smooth for p in m.polygons),'colors':attrs,'uvs':uvs,'modifiers':[{'name':mod.name,'type':mod.type,'render':mod.show_render,'viewport':mod.show_viewport} for mod in o.modifiers]}
    for slot in o.material_slots:
        if slot.material and slot.material.name not in result['materials']:
            mat=slot.material
            result['materials'][mat.name]={'diffuse':list(mat.diffuse_color),'nodes':[node(n) for n in mat.node_tree.nodes] if mat.use_nodes else []}
    ev.to_mesh_clear()
for o in bpy.data.objects:
    if o.type=='CAMERA': result['cameras'][o.name]={'location':list(o.location),'rotation':list(o.rotation_euler),'lens':o.data.lens}
out.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf8')
print('AUDIT_INDIVIDUAL_DONE',str(out),len(result['objects']),len(result['materials']),flush=True)
