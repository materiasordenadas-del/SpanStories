"""Sustitución ocular por islas UV explícitas, sin marcadores de boca ni rig facial."""
import bpy,bmesh,math
import numpy as np
from . import marco as MK,ojos_lian as OL,ocultacion_uv as UV,util


def preparar(cara,semillas_ojos_uv,color='castano',aplicar=False,semillas_pestanas_uv=None):
    if cara.type!='MESH' or cara.mode!='OBJECT' or cara.data.users!=1:
        raise ValueError('Se requiere una malla propia en Object')
    me=cara.data
    if me.shape_keys or cara.modifiers:
        raise ValueError('Preparar ojos antes de crear keys o modificadores; no se retira un rig existente')
    if color not in OL.COLORES:raise ValueError('Color ocular desconocido')
    if semillas_pestanas_uv is None:
        raise ValueError('Identifica primero las islas UV de pestañas Tripo y pasa semillas_pestanas_uv; [] solo si se comprobó que no hay pestañas')
    names=MK.nombres(cara)
    if any(bpy.data.objects.get(names[k]) for k in ('ojos_raiz','piv_L','piv_R')):
        raise ValueError('Ya existen pivotes oculares; no se reemplazan automáticamente')
    P=np.array([v.co[:] for v in me.vertices]);groups={};report={}
    for s in ('L','R'):
        fs,_=UV._resueltas_por_seed(cara,semillas_ojos_uv[s]);groups[s]=set(fs)
        ids=sorted({v for fi in fs for v in me.polygons[fi].vertices});V=P[ids]
        if len(V)<12:raise ValueError(f'Ojo {s}: superficie insuficiente')
        fit=np.linalg.lstsq(np.c_[2*V,np.ones(len(V))],(V*V).sum(1),rcond=None)[0]
        c=fit[:3];r2=float(fit[3]+c@c)
        if r2<=0:raise ValueError(f'Ojo {s}: radio no válido')
        radius=math.sqrt(r2);rms=float(np.sqrt(np.mean((np.linalg.norm(V-c,axis=1)-radius)**2)))
        if rms>.08*radius:raise ValueError(f'Ojo {s}: las caras no describen un globo; revisar islas UV')
        report[s]={'centro_local':c.tolist(),'radio':radius,'residuo_mm':rms*1000,'caras':len(fs),'semillas_uv':list(semillas_ojos_uv[s])}
    if groups['L']&groups['R']:raise ValueError('Las selecciones oculares se solapan')
    # La nomenclatura del rig usa L en X positivo, en coordenadas de la cara.
    if report['L']['centro_local'][0]<=report['R']['centro_local'][0]:
        raise ValueError('Revisar lado L/R de los globos')
    removed=groups['L']|groups['R']
    # Un globo no puede ser un subconjunto recortado de una superficie de piel.
    edge_faces={}
    for p in me.polygons:
        vs=list(p.vertices)
        for a,b in zip(vs,vs[1:]+vs[:1]):edge_faces.setdefault(tuple(sorted((a,b))),[]).append(p.index)
    if any(any(f in removed for f in fs) and any(f not in removed for f in fs) for fs in edge_faces.values()):
        raise ValueError('Las islas seleccionadas comparten aristas con otras caras; revisar separación antes de retirar ojos')
    lash_faces=set(UV._resueltas_por_seed(cara,semillas_pestanas_uv)[0]) if semillas_pestanas_uv else set()
    if lash_faces&removed:raise ValueError('Las islas de pestañas no pueden ser las de globos')
    if len(lash_faces)>.05*len(me.polygons):raise ValueError('La selección de pestañas es demasiado grande; revisar UV')
    if lash_faces:
        centers=np.array([P[list(me.polygons[i].vertices)].mean(0) for i in lash_faces])
        if np.any(np.min([np.linalg.norm(centers-np.array(r['centro_local']),axis=1)/r['radio'] for r in report.values()],axis=0)>3):
            raise ValueError('Hay caras de pestañas fuera de la región ocular')
    removed|=lash_faces
    result={'aplicado':False,'ojos':report,'caras_retirar':len(removed),'caras_pestanas_retirar':len(lash_faces),'color':color,'requiere_boca':False}
    if not aplicar:return result
    normals={(p.index,int(v)):tuple(me.corner_normals[l].vector) for p in me.polygons for v,l in zip(p.vertices,p.loop_indices)} if me.has_custom_normals else None
    bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table();layer=bm.faces.layers.int.new('_rlb_original_face')
    for f in bm.faces:f[layer]=f.index
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index in removed],context='FACES_ONLY')
    original=[f[layer] for f in bm.faces];bm.faces.layers.int.remove(layer);bm.to_mesh(me);bm.free();me.update()
    if not np.array_equal(P,np.array([v.co[:] for v in me.vertices])):raise RuntimeError('La retirada cambió coordenadas originales')
    if normals:
        me.normals_split_custom_set([normals[(fi,int(v))] for fi,p in zip(original,me.polygons) for v in p.vertices])
    pieces=_crear_procedurales(cara,report,color)
    result.update(aplicado=True,piezas=pieces['piezas'],coordenadas_piel_preservadas=True)
    return result


def _crear_procedurales(cara,report,color):
    names=MK.nombres(cara)
    if any(bpy.data.objects.get(names[k]) for k in ('ojos_raiz','piv_L','piv_R')):
        raise ValueError('Ya existen pivotes oculares; no se reemplazan automáticamente')
    col=util.coleccion(f'{cara.name} ojos');root=bpy.data.objects.new(names['ojos_raiz'],None);col.objects.link(root);root.parent=cara
    for s in ('L','R'):
        piv=bpy.data.objects.new(names['piv_'+s],None);col.objects.link(piv);piv.parent=root;piv.location=report[s]['centro_local'];piv['rlb_escala']=1.;piv.empty_display_size=report[s]['radio']
    config=MK.cfg(cara);config['pivotes']=[names['piv_L'],names['piv_R']];config['ojos_raiz']=root.name;MK.guardar_cfg(cara,config)
    bpy.context.view_layer.update()
    pieces=OL.crear(cara,color=color,radios={s:report[s]['radio'] for s in ('L','R')})
    bpy.context.view_layer.update()
    return pieces


def preparar_desde_cuencas(cara,semillas_piel_uv,color='castano',aplicar=False):
    """Ojos del complemento desde huecos revisados, sin globos Tripo ni boca.

    Usa la calibración geométrica de deteccion.ojos; no cambia la piel, ni
    busca o elimina pestañas. Estas deben haberse retirado antes.
    """
    from collections import Counter,defaultdict
    if cara.type!='MESH' or cara.mode!='OBJECT' or cara.data.users!=1:
        raise ValueError('Se requiere una malla propia en Object')
    if cara.data.shape_keys or cara.modifiers:
        raise ValueError('Preparar ojos antes de crear el rig')
    if color not in OL.COLORES:raise ValueError('Color ocular desconocido')
    names=MK.nombres(cara)
    if any(bpy.data.objects.get(names[k]) for k in ('ojos_raiz','piv_L','piv_R')):
        raise ValueError('Ya existen pivotes oculares; no se reemplazan automáticamente')
    faces,_=UV._resueltas_por_seed(cara,semillas_piel_uv);me=cara.data
    P=np.array([v.co[:] for v in me.vertices]);counts=Counter()
    for fi in faces:
        vs=list(me.polygons[fi].vertices)
        for a,b in zip(vs,vs[1:]+vs[:1]):counts[tuple(sorted((a,b)))]+=1
    adj=defaultdict(set)
    for (a,b),n in counts.items():
        if n==1:adj[a].add(b);adj[b].add(a)
    skin=P[sorted({v for fi in faces for v in me.polygons[fi].vertices})]
    min_z=.5*(skin[:,2].min()+skin[:,2].max());seen=set();candidates={'L':[],'R':[]}
    for v in adj:
        if v in seen:continue
        todo=[v];seen.add(v);comp=[]
        while todo:
            a=todo.pop();comp.append(a)
            for b in adj[a]:
                if b not in seen:seen.add(b);todo.append(b)
        if len(comp)<8 or any(len(adj[i])!=2 for i in comp):continue
        Q=P[comp];lo,hi=Q.min(0),Q.max(0);ext=hi-lo;center=Q.mean(0)
        if center[2]<=min_z or abs(center[0])<=.5*ext[0]:continue
        if ext[0]<.75*ext[2] or ext[1]>.75*ext[0]:continue
        side='L' if center[0]>0 else 'R';candidates[side].append((ext[0],comp,lo,hi,center))
    report={}
    for side in ('L','R'):
        if len(candidates[side])!=1:
            raise ValueError(f'Cuenca {side}: se requiere un único contorno ocular UV cerrado; encontrados {len(candidates[side])}')
        width,comp,lo,hi,center=candidates[side][0];half=.5*width;sign=1 if side=='L' else -1
        c=[.5*(lo[0]+hi[0])-sign*.41*half,center[1]+.735*half,.5*(lo[2]+hi[2])-.05*half]
        report[side]={'centro_local':list(map(float,c)),'radio':float(1.40*half),'vertices_borde':len(comp),'borde':comp}
    radii=[r['radio'] for r in report.values()]
    if max(radii)>1.35*min(radii):raise ValueError('Las dos cuencas tienen tamaños incompatibles; revisar la selección UV')
    result={'aplicado':False,'metodo':'calibracion_huecos_deteccion','ojos':report,'piel_modificada':False,'requiere_boca':False}
    if aplicar:
        pieces=_crear_procedurales(cara,report,color)
        from .facs.parpados_aislados import ajustar_espacio_ojos
        encaje=ajustar_espacio_ojos(cara,semillas_piel_uv,aplicar=True,limite=1.)
        result.update(aplicado=True,piezas=pieces['piezas'],encaje=encaje)
    return result


def retirar_pestanas_uv(cara,semillas_uv,aplicar=False):
    """Retirar exclusivamente islas UV de pestañas revisadas, incluso con keys."""
    from . import pestanas_tripo as PT
    if cara.type!='MESH' or cara.mode!='OBJECT' or cara.data.users!=1:
        raise ValueError('Se requiere una malla propia en Object')
    faces,_=UV._resueltas_por_seed(cara,semillas_uv)
    names=MK.nombres(cara);M=cara.matrix_world.inverted();eyes={}
    for s in ('L','R'):
        pivot=bpy.data.objects.get(names['piv_'+s])
        if pivot is None:raise ValueError('Faltan pivotes para validar la selección ocular')
        center=np.array((M@pivot.matrix_world.translation)[:])
        globe=next((ch for ch in pivot.children_recursive if ch.type=='MESH' and 'Globo' in ch.name),None)
        if globe is None:raise ValueError('Falta el globo para validar la selección ocular')
        radius=max(np.linalg.norm(np.array((M@globe.matrix_world@v.co)[:])-center) for v in globe.data.vertices)
        eyes[s]=(center,radius)
    P=np.array([v.co[:] for v in cara.data.vertices]);centers=np.array([P[list(cara.data.polygons[i].vertices)].mean(0) for i in faces])
    if len(faces)>.05*len(cara.data.polygons) or np.any(np.min([np.linalg.norm(centers-c,axis=1)/r for c,r in eyes.values()],axis=0)>3):
        raise ValueError('Revisar las islas de pestañas: extensión o posición no válida')
    result={'aplicado':False,'caras_pestanas':len(faces),'semillas_uv':list(semillas_uv)}
    if aplicar:
        result.update(PT.quitar_manual(cara,faces,ojos=eyes),aplicado=True,metodo='uv_explicitas',pestanas='retiradas por islas UV revisadas')
    return result
