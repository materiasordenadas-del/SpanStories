"""Conectar intersecciones existentes de piel ocular sin mover su superficie.

Usa Intersect (Knife), Exact, sin separar: añade conectividad donde la malla
ya se atraviesa. No elimina pestañas ni sustituye la topología por otra forma.
"""
import bpy,bmesh
import numpy as np
from mathutils import Vector
from mathutils import geometry
from mathutils.bvhtree import BVHTree
from .facs import parpados_aislados as ISO
from .facs.parpados_seguridad import Seguridad


def reparar(cara,semillas_uv,aplicar=False):
    if cara.mode!='OBJECT' or cara.data.users!=1 or cara.data.shape_keys or cara.modifiers:
        raise ValueError('Reparar la superficie propia en Object, antes de crear el rig')
    K,O=ISO.contexto(cara,semillas_uv);me=cara.data;me.calc_loop_triangles()
    selected={fi for fi in K.skin_faces if any(np.linalg.norm(np.array(me.polygons[fi].center)-o.c)<1.8*o.r for o in O.values())}
    crossings=0
    for o in O.values():
        region=(np.linalg.norm(K.p-o.c,axis=1)<1.8*o.r)&(K.p[:,1]<o.c[1]+.2*o.r)
        crossings+=len(Seguridad(K,o,region,o.r).originales)
    result={'aplicado':False,'caras_revisadas':len(selected),'vertices_antes':len(me.vertices),'caras_antes':len(me.polygons),'metodo':'interseccion_exacta_sin_separar','cruces_preexistentes':crossings}
    if not aplicar:return result
    attr_name='_RLB_cara_antes_interseccion'
    if me.attributes.get(attr_name):raise ValueError('Existe un atributo temporal de reparación pendiente')
    original=bmesh.new();original.from_mesh(me)
    old_normals=[n.vector.copy() for n in me.corner_normals] if me.has_custom_normals else None
    old_tris={};old_area=0.
    old_points=[v.co.copy() for v in me.vertices]
    for t in me.loop_triangles:
        V=[old_points[i] for i in t.vertices];old_area+=geometry.area_tri(*V)
        N=[old_normals[i] for i in t.loops] if old_normals else None
        old_tris.setdefault(t.polygon_index,[]).append((V,N))
    reference=BVHTree.FromPolygons(old_points,[tuple(t.vertices) for t in me.loop_triangles],all_triangles=True)
    previous_active=bpy.context.view_layer.objects.active;previous_selected=list(bpy.context.selected_objects);selection_mode=tuple(bpy.context.tool_settings.mesh_select_mode)
    face_attr=me.attributes.new(attr_name,'INT','FACE');face_attr.data.foreach_set('value',np.arange(len(me.polygons),dtype=np.int32))
    try:
        for ob in previous_selected:ob.select_set(False)
        cara.select_set(True);bpy.context.view_layer.objects.active=cara
        for v in me.vertices:v.select=False
        for e in me.edges:e.select=False
        for p in me.polygons:p.select=p.index in selected
        bpy.context.tool_settings.mesh_select_mode=(False,False,True)
        if crossings:
            bpy.ops.object.mode_set(mode='EDIT')
            status=bpy.ops.mesh.intersect(mode='SELECT',separate_mode='NONE',solver='EXACT')
            bpy.ops.object.mode_set(mode='OBJECT')
        else:status={'FINISHED'}
        if 'FINISHED' not in status:raise RuntimeError('La intersección exacta no terminó')
        # Exact puede producir varios vértices en el mismo punto de corte. Deben
        # ser un único nudo para que no queden aristas de longitud cero en el rig.
        bm=bmesh.new();bm.from_mesh(me);face_ids=bm.faces.layers.int.get(attr_name)
        patch={v for f in bm.faces if f[face_ids] in selected for v in f.verts};before_cleanup=len(bm.verts)
        bmesh.ops.remove_doubles(bm,verts=list(patch),dist=1e-6)
        patch={v for f in bm.faces if f[face_ids] in selected for v in f.verts}
        bmesh.ops.dissolve_degenerate(bm,dist=1e-6,edges=[e for e in bm.edges if all(v in patch for v in e.verts)])
        # El cuchillo puede dejar ngons con esquinas colineales: sus aristas
        # tienen longitud, pero la triangulación de evaluación contiene caras
        # de área cero. Limpiar esas caras también, antes de generar las keys.
        candidates=[f for f in bm.faces if f[face_ids] in selected and len(f.verts)>3]
        if candidates:
            bmesh.ops.triangulate(bm,faces=candidates,quad_method='BEAUTY',ngon_method='BEAUTY')
            patch={v for f in bm.faces if f[face_ids] in selected for v in f.verts}
            bmesh.ops.dissolve_degenerate(bm,dist=1e-6,edges=[e for e in bm.edges if all(v in patch for v in e.verts)])
        candidates=[f for f in bm.faces if f[face_ids] in selected and len(f.verts)>3]
        if candidates:bmesh.ops.triangulate(bm,faces=candidates,quad_method='BEAUTY',ngon_method='BEAUTY')
        empty=[f for f in bm.faces if f[face_ids] in selected and f.calc_area()<1e-18]
        empty_count=len(empty)
        if empty:bmesh.ops.delete(bm,geom=empty,context='FACES_ONLY')
        merged=before_cleanup-len(bm.verts);bm.to_mesh(me);bm.free()
        me.update();me.calc_loop_triangles();new_area=sum(geometry.area_tri(*[me.vertices[i].co for i in t.vertices]) for t in me.loop_triangles)
        used={i for p in me.polygons for i in p.vertices}
        error=max((reference.find_nearest(me.vertices[i].co)[3] for i in used),default=0.)
        if error>1e-6 or abs(new_area-old_area)>max(old_area*1e-4,1e-10):
            raise RuntimeError(f'La reparación cambió la superficie; se restaura la malla. Error {error:.9g} m; área relativa {abs(new_area-old_area)/max(old_area,1e-20):.9g}')
        mapping=[int(d.value) for d in me.attributes[attr_name].data]
        if old_normals:
            normals=[]
            for p,fi in zip(me.polygons,mapping):
                candidates=old_tris[fi]
                for li in p.loop_indices:
                    point=me.vertices[me.loops[li].vertex_index].co
                    V,N,closest=min(((V,N,geometry.closest_point_on_tri(point,*V)) for V,N in candidates),key=lambda x:(point-x[2]).length_squared)
                    normal=geometry.barycentric_transform(closest,*V,*N)
                    normals.append(tuple(normal.normalized()))
            me.normals_split_custom_set(normals)
        seeds=[mapping.index(int(s)) for s in semillas_uv if int(s) in mapping]
        if not seeds:raise RuntimeError('Se perdió la identificación UV de piel')
        me.attributes.remove(me.attributes[attr_name]);result.update(aplicado=True,vertices_despues=len(me.vertices),caras_despues=len(me.polygons),vertices_fusionados=merged,caras_area_nula_retiradas=empty_count,error_superficie_m=error,cambio_area_relativo=abs(new_area-old_area)/max(old_area,1e-20),semillas_piel_actualizadas=seeds)
    except Exception:
        if cara.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
        original.to_mesh(me);me.update()
        if me.attributes.get(attr_name):me.attributes.remove(me.attributes[attr_name])
        if old_normals:me.normals_split_custom_set([tuple(n) for n in old_normals])
        raise
    finally:
        original.free();bpy.context.tool_settings.mesh_select_mode=selection_mode
        for ob in list(bpy.context.selected_objects):ob.select_set(False)
        for ob in previous_selected:ob.select_set(True)
        bpy.context.view_layer.objects.active=previous_active
    bpy.context.view_layer.update()
    return result
