"""Preparar cuencas por superficie UV usando el recorte esférico del complemento.

Calcula y comprueba el resultado antes de escribir. No toca pestañas ni el borde
abierto existente. Disponible para el ensayo aislado del subsistema ocular.
"""
import bpy,bmesh,math,copy
import numpy as np
from collections import Counter
from mathutils import Vector,Euler
from mathutils.bvhtree import BVHTree
from .facs import parpados_aislados as ISO,parpados_seguridad as SG


def preparar(cara,semillas_uv,aplicar=False):
    if cara.data.shape_keys or cara.modifiers:
        raise ValueError('Preparar cuencas antes del rig; se conservan keys y modificadores existentes')
    K,O=ISO.contexto(cara,semillas_uv);me=cara.data;P=K.P.copy();B=P.copy();skin=set(K.skin_faces)
    # Si el ojo ya cabe, no repetir el recorte ni hundirlo otra vez. La reparación
    # de conectividad es independiente y también sirve para entradas ya preparadas.
    try:has_space=all(ISO._espacio_ojos(cara,K,o)['desplazamiento_recomendado']==0 for o in O.values())
    except ValueError:has_space=False
    if has_space:
        from .reparacion_superficie_ocular import reparar
        connected=reparar(cara,semillas_uv,aplicar=aplicar)
        return {'aplicado':bool(aplicar),'ya_tienen_espacio':True,'recorte_repetido':False,'borde_movido':False,'pestanas_modificadas':False,'conectividad':connected,'semillas_piel_actualizadas':connected.get('semillas_piel_actualizadas',list(semillas_uv))}
    fs=[tuple(p.vertices) for p in me.polygons];counts=Counter();neighbors=[set() for _ in P]
    for fi in skin:
        vs=fs[fi]
        for a,b in zip(vs,vs[1:]+vs[:1]):counts[tuple(sorted((a,b)))]+=1;neighbors[a].add(b);neighbors[b].add(a)
    boundary={v for edge,n in counts.items() if n==1 for v in edge}
    foreign={v for fi,vs in enumerate(fs) if fi not in skin for v in vs}
    protected=boundary|foreign;mask=np.zeros(len(P),bool);mask[K.zona]=True;mask[list(protected)]=False
    removed=set();details={};eyes={};pivots={};M=cara.matrix_world.inverted()
    for s,o in O.items():
        piv=bpy.data.objects[f'{cara.name}_OjoPivote_{s}'];verts=[];polys=[]
        for ch in piv.children_recursive:
            if ch.type!='MESH':continue
            base=len(verts);verts.extend([(M@ch.matrix_world@v.co)[:] for v in ch.data.vertices]);polys.extend([tuple(base+i for i in p.vertices) for p in ch.data.polygons])
        V=np.array(verts);envelope=float(np.linalg.norm(V-o.c,axis=1).max());shift=.04*o.r;c=o.c+np.array((0.,shift,0.))
        near=[i for i in boundary if np.linalg.norm(B[i]-o.c)<1.6*o.r]
        if not near:raise ValueError(f'Ojo {s}: falta un contorno abierto revisable')
        limit=min(envelope+.0002,float(np.linalg.norm(B[near]-c,axis=1).min())-.00005)
        if limit<envelope+.00003:raise ValueError(f'Ojo {s}: no hay margen para proteger el borde')
        rel=P-c;distance=np.linalg.norm(rel,axis=1);inside=mask&(distance<limit-1e-7)&(rel[:,1]<.3*limit)
        deep=inside.copy();moved=[]
        for i in np.flatnonzero(inside):
            points=[]
            for j in neighbors[i]:
                if inside[j]:continue
                edge=P[j]-P[i];a=edge@edge
                if a<1e-20:continue
                b=2*rel[i]@edge;cc=rel[i]@rel[i]-limit**2
                t=(-b+math.sqrt(max(b*b-4*a*cc,0.)))/(2*a)
                points.append(rel[i]+np.clip(t,0,1)*edge)
            if points:
                q=np.mean(points,axis=0);P[i]=c+q*limit/max(np.linalg.norm(q),1e-12);deep[i]=False;moved.append(int(i))
        deletion={fi for fi in skin if any(deep[v] for v in fs[fi])};removed.update(deletion)
        eyes[s]=(V+np.array((0.,shift,0.)),polys);pivots[s]=shift
        details[s]={'radio_recorte_mm':limit*1000,'profundidad_ojos_mm':shift*1000,'vertices_recolocados':len(moved),'caras_retiradas':len(deletion)}
    changed=np.linalg.norm(P-B,axis=1)>1e-10
    if any(changed[i] for i in protected):raise RuntimeError('Se intentó mover el borde o una pieza ajena')
    # Validar la superficie restante, no las caras interiores que se retiran.
    me.calc_loop_triangles();cleanup=set()
    for t in me.loop_triangles:
        if t.polygon_index not in skin or t.polygon_index in removed:continue
        ids=np.array(t.vertices);a,b,c=B[ids];n0=np.cross(b-a,c-a);a,b,c=P[ids];n1=np.cross(b-a,c-a)
        bad=np.linalg.norm(n1)<.02*np.linalg.norm(n0)
        for o in O.values():
            old=float(n0@(B[ids].mean(0)-o.c));new=float(n1@(P[ids].mean(0)-o.c))
            bad|=old>.05*np.linalg.norm(n0)*o.r and new<0
        if bad:
            if set(fs[t.polygon_index])&protected:raise RuntimeError('El recorte requiere alterar un triángulo del borde protegido')
            cleanup.add(t.polygon_index)
    removed.update(cleanup)
    kept=[fi for fi in skin if fi not in removed]
    T=np.array([t.vertices[:] for t in me.loop_triangles if t.polygon_index in kept],int)
    KK=copy.copy(K);KK.triangulos=K.gi[T];delta=(P-B)[K.zona]
    checks={};rotations=[np.array(Euler((math.radians(x),0,math.radians(z)),'XYZ').to_matrix()) for x in (-12,0,12) for z in (-12,0,12)]
    skin_tree=BVHTree.FromPolygons([Vector(v) for v in P],T.tolist(),all_triangles=True)
    for s,o in O.items():
        V,F=eyes[s];c=o.c+np.array((0.,pivots[s],0.));eye=BVHTree.FromPolygons([Vector(v) for v in V],F)
        safe=SG.Seguridad(KK,o,changed[K.zona],float(np.linalg.norm(V-c,axis=1).max()));safe.ojo_real=eye
        state=safe.medir(delta)
        gaze_hits=[]
        for R in rotations:
            eye_now=BVHTree.FromPolygons([Vector(v) for v in c+(V-c)@R.T],F)
            gaze_hits.append(len(skin_tree.overlap(eye_now)))
        checks[s]={'geometria':state,'cruces_en_9_miradas':gaze_hits}
        if not safe.valido(state) or any(gaze_hits):
            raise RuntimeError(f'Preparación de cuenca {s} no válida; no se modificó la malla: {checks[s]}')
    report={'aplicado':False,'ojos':details,'validacion':checks,'caras_retirar':len(removed),'caras_degeneradas_retiradas':len(cleanup),'borde_movido':False,'pestanas_modificadas':False}
    if not aplicar:return report
    normals={(p.index,int(v)):tuple(me.corner_normals[l].vector) for p in me.polygons for v,l in zip(p.vertices,p.loop_indices)} if me.has_custom_normals else None
    bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table();layer=bm.faces.layers.int.new('_rlb_original_face')
    for f in bm.faces:f[layer]=f.index
    for v in bm.verts:v.co=P[v.index]
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index in removed],context='FACES_ONLY')
    original=[f[layer] for f in bm.faces];bm.faces.layers.int.remove(layer);bm.to_mesh(me);bm.free();me.update()
    if normals:
        me.normals_split_custom_set([tuple(me.corner_normals[l].vector) if any(changed[i] for i in p.vertices) else normals[(fi,int(v))] for fi,p in zip(original,me.polygons) for v,l in zip(p.vertices,p.loop_indices)])
    for s,shift in pivots.items():
        piv=bpy.data.objects[f'{cara.name}_OjoPivote_{s}'];mw=piv.matrix_world.copy();mw.translation+=cara.matrix_world.to_3x3()@Vector((0.,shift,0.));piv.matrix_world=mw
    bpy.context.view_layer.update()
    mapped=[original.index(seed) for seed in semillas_uv if seed in original]
    if not mapped:mapped=[next(i for i,fi in enumerate(original) if fi in skin)]
    from .reparacion_superficie_ocular import reparar
    connected=reparar(cara,mapped,aplicar=True)
    report.update(aplicado=True,conectividad=connected,semillas_piel_actualizadas=connected['semillas_piel_actualizadas'])
    return report
