"""Shared painting API. No operation changes mesh/UV/rig data.

Colors passed to the API are scene-linear RGBA, as Blender color controls are.
Reference palette values are converted from sRGB. All managed textures are
float, linear RGBA; PNG export explicitly encodes sRGB for glTF/Three.js.
"""
import hashlib
import json
import math
from collections import OrderedDict, deque
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

from .padding import MARGIN, gutter_indices, apply_gutter, blend_rgb
from . import mouth_preview

KEY = "sstp_state_v1"
_cache = {}
_history = {}
_masks = {}
_raster_cache = OrderedDict()
_raster_bytes = 0
_image_versions = {}
RASTER_CACHE_BYTES = 64 * 1024 * 1024


def clear_runtime_caches():
    global _raster_bytes
    _cache.clear();_masks.clear();_raster_cache.clear();_image_versions.clear()
    _raster_bytes=0


def target(name=None):
    ob = bpy.data.objects.get(name) if name else bpy.context.scene.sstp.target
    if not ob or ob.type != 'MESH':
        raise ValueError('Elige una malla de personaje')
    if not ob.data.uv_layers.active:
        raise ValueError('La malla no tiene UV; esta herramienta no las genera ni modifica')
    if ob.mode != 'OBJECT' and ob.mode != 'TEXTURE_PAINT':
        raise ValueError('Sal del modo de edición antes de pintar')
    return ob


def state(ob):
    return json.loads(ob.get(KEY, '{}'))


def store(ob, value):
    ob[KEY] = json.dumps(value, ensure_ascii=False)


def pixels(image):
    a = np.empty(len(image.pixels), np.float32)
    image.pixels.foreach_get(a)
    return a.reshape(image.size[1], image.size[0], 4)


def write_pixels(image, a):
    image.pixels.foreach_set(np.asarray(a, np.float32).ravel())
    image.update()
    key=image.as_pointer()
    _image_versions[key]=_image_versions.get(key,0)+1


def to_linear(a):
    return np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)


def to_srgb(a):
    a = np.maximum(a, 0)
    return np.where(a <= .0031308, a * 12.92, 1.055 * a ** (1/2.4) - .055)


def image_linear(image):
    a = pixels(image).copy()
    if image.colorspace_settings.name == 'sRGB':
        a[..., :3] = to_linear(a[..., :3])
    return a


def new_image(name, size, data=None):
    width,height=(size,size) if isinstance(size,int) else size
    im = bpy.data.images.new(name, width=width, height=height, alpha=True, float_buffer=True)
    im.colorspace_settings.name = 'Linear Rec.709'
    im.alpha_mode = 'STRAIGHT'
    im.use_fake_user = True
    if data is not None:
        write_pixels(im, data)
    return im


def resize_linear(data,width,height):
    """Sample pixel centers bilinearly; keep native sources untouched."""
    if data.shape[:2]==(height,width):return data.copy()
    y=np.clip((np.arange(height)+.5)*data.shape[0]/height-.5,0,data.shape[0]-1)
    x=np.clip((np.arange(width)+.5)*data.shape[1]/width-.5,0,data.shape[1]-1)
    yi=y.astype(int);xi=x.astype(int);yj=np.minimum(yi+1,data.shape[0]-1);xj=np.minimum(xi+1,data.shape[1]-1)
    fy=(y-yi).astype(np.float32)[:,None,None];fx=(x-xi).astype(np.float32)[None,:,None]
    top=data[yi[:,None],xi[None,:]]*(1-fx)+data[yi[:,None],xj[None,:]]*fx
    bottom=data[yj[:,None],xi[None,:]]*(1-fx)+data[yj[:,None],xj[None,:]]*fx
    return top*(1-fy)+bottom*fy


def protected_copy(source,name):
    # Image.copy alone can discard unsaved/generated pixel edits. Copy the current
    # buffer explicitly as well as its color space, dimensions and sampler owner.
    data=pixels(source).copy();base=source.copy();base.name=name;base.use_fake_user=True
    if tuple(base.size)!=(data.shape[1],data.shape[0]):base.scale(data.shape[1],data.shape[0])
    write_pixels(base,data);base.pack()
    return base


def color_source(mat):
    """Socket that gives Base Color its color, seen through the Piel clean layer.

    The Piel layer routes Base Color through «Piel Limpia Mezcla»; its A input
    is the character's own color, which is what preparing and the eyedropper need.
    """
    shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat and mat.use_nodes else None
    socket=shader.inputs['Base Color'] if shader else None
    if not socket or not socket.is_linked:return None
    source=socket.links[0].from_socket
    if source.node.name=='Piel Limpia Mezcla':
        first=next(s for s in source.node.inputs if s.type=='RGBA' and s.name=='A')
        return first.links[0].from_socket if first.is_linked else None
    return source


def source_node(info):
    socket=color_source(bpy.data.materials.get(info['original_material']))
    return socket.node if socket and socket.node.type=='TEX_IMAGE' else None


def upgrade_preserved_bases(ob):
    """Repair pre-0.1.2 bases without touching paint layers or original images."""
    s=state(ob);changed=False
    for slot,info in s.get('slots',{}).items():
        if info.get('native_base') or not info.get('source_image'):continue
        template=source_node(info)
        if not template or not template.image:raise ValueError('No se encuentra la textura original protegida del material '+slot)
        base=protected_copy(template.image,ob.name+' · Original nativo protegido · '+slot)
        info['previous_base']=info['base'];info['base']=base.name;info['native_base']=True;changed=True
    if changed:store(ob,s)
    return changed


def encoded_image(name, data):
    """Portable 8-bit sRGB PNG, also used by Blender's glTF exporter."""
    im=bpy.data.images.new(name,width=data.shape[1],height=data.shape[0],alpha=True,float_buffer=False)
    im.colorspace_settings.name='sRGB'; im.alpha_mode='STRAIGHT'
    encoded=data.copy(); encoded[...,:3]=to_srgb(encoded[...,:3])
    write_pixels(im,encoded)
    return im


def fingerprint(ob):
    """Content hashes, including every shape coordinate, driver and rig pose."""
    mesh = ob.data
    def digest(collection, attr, width, dtype=np.float32):
        a = np.empty(len(collection) * width, dtype)
        collection.foreach_get(attr, a)
        return hashlib.sha256(a.tobytes()).hexdigest()
    shapes = mesh.shape_keys
    arms = [m.object for m in ob.modifiers if m.type == 'ARMATURE' and m.object]
    return {
        'vertices': digest(mesh.vertices, 'co', 3),
        'edges': digest(mesh.edges, 'vertices', 2, np.int32),
        'loops': digest(mesh.loops, 'vertex_index', 1, np.int32),
        'faces': [(p.loop_start, p.loop_total, p.material_index) for p in mesh.polygons],
        'uv': {u.name: digest(u.data, 'uv', 2) for u in mesh.uv_layers},
        'shape_keys': [(k.name, float(k.value), digest(k.data, 'co', 3)) for k in shapes.key_blocks] if shapes else [],
        'modifiers': [(m.name, m.type, str(getattr(m, 'object', None)), m.show_viewport, m.show_render) for m in ob.modifiers],
        'rigs': [(a.name, [(b.name, b.parent.name if b.parent else '', list(b.head_local), list(b.tail_local)) for b in a.data.bones], [(p.name, [list(row) for row in p.matrix_basis]) for p in a.pose.bones]) for a in arms],
        'animation': str(ob.animation_data.action if ob.animation_data else None),
        'shape_drivers': [(d.data_path, d.array_index, d.driver.expression) for d in shapes.animation_data.drivers] if shapes and shapes.animation_data else [],
    }


def geometry(ob, refresh=False):
    """Islands join only across the same geometric edge with equal UV endpoints."""
    mesh = ob.data
    uv = mesh.uv_layers.active
    stamp = (ob.as_pointer(), uv.name, len(mesh.vertices), len(mesh.polygons), len(mesh.loops))
    if not refresh and stamp in _cache:
        return _cache[stamp]
    coords = np.empty(len(mesh.loops)*2, np.float32)
    uv.data.foreach_get('uv', coords)
    coords = coords.reshape(-1, 2)
    from .face_fill import base_slot
    material_map={i:base_slot(ob,i) for i in {p.material_index for p in mesh.polygons}}
    parent = list(range(len(mesh.polygons)))
    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    def join(a, b):
        a, b = root(a), root(b)
        if a != b:
            parent[max(a,b)] = min(a,b)
    edges, face_uv = {}, []
    face_edges = []
    for p in mesh.polygons:
        loops = list(p.loop_indices)
        face_uv.append(coords[loops].copy())
        keys = []
        for j, li in enumerate(loops):
            lj = loops[(j+1) % len(loops)]
            vi, vj = mesh.loops[li].vertex_index, mesh.loops[lj].vertex_index
            ui, uj = tuple(np.round(coords[li], 6)), tuple(np.round(coords[lj], 6))
            key = (material_map[p.material_index], min(vi,vj), max(vi,vj), ui if vi < vj else uj, uj if vi < vj else ui)
            keys.append(key)
            if key in edges:
                join(p.index, edges[key][0])
                edges[key].append(p.index)
            else:
                edges[key] = [p.index]
        face_edges.append(keys)
    groups = {}
    for i in range(len(parent)):
        groups.setdefault(root(i), []).append(i)
    islands, by_face = {}, {}
    for faces in groups.values():
        ident = 'uv-' + hashlib.sha256(uv.name.encode() + np.asarray(faces,np.int32).tobytes() + b''.join(face_uv[f].tobytes() for f in faces)).hexdigest()[:16]
        boundary = []
        for f in faces:
            for k in face_edges[f]:
                if len(edges[k]) == 1:
                    boundary.append((k[3], k[4]))
            by_face[f] = ident
        alluv = np.concatenate([face_uv[f] for f in faces])
        islands[ident] = {'id':ident, 'faces':faces, 'material':material_map[mesh.polygons[faces[0]].material_index], 'bounds':[alluv.min(0).tolist(),alluv.max(0).tolist()], 'boundary':boundary}
    face_material = [material_map[p.material_index] for p in mesh.polygons]
    result = {'islands':islands,'by_face':by_face,'face_uv':face_uv,'face_material':face_material,'stamp':stamp}
    _cache[stamp] = result
    return result


def island_of(g, ident):
    """An island, or a single face addressed as 'face-N' (selection by face)."""
    island = g['islands'].get(ident)
    if island is not None:
        return island
    if isinstance(ident, str) and ident.startswith('face-') and ident[5:].isdigit():
        f = int(ident[5:])
        if f < len(g['face_uv']):
            cache = g.setdefault('face_islands', {})
            if f not in cache:
                p = g['face_uv'][f]
                cache[f] = {'id':ident, 'faces':[f], 'material':g['face_material'][f], 'parent':g['by_face'][f],
                            'bounds':[p.min(0).tolist(), p.max(0).tolist()],
                            'boundary':[(tuple(p[i]), tuple(p[(i+1) % len(p)])) for i in range(len(p))]}
            return cache[f]
    raise ValueError('Identificador de isla o cara desconocido; vuelve a analizar las UV')


def valid_ids(g, ids):
    try:
        for i in ids: island_of(g, i)
    except ValueError:
        return False
    return True


def faces_of(g, ids):
    return {f for i in ids for f in island_of(g, i)['faces']}


def inspect(object_name=None, include_faces=False):
    ob = target(object_name)
    g = geometry(ob, True)
    return {'object':ob.name,'uv':ob.data.uv_layers.active.name,'vertices':len(ob.data.vertices),'faces':len(ob.data.polygons),'islands':[ {**{k:v for k,v in x.items() if k not in ('boundary','faces')},'face_count':len(x['faces']),**({'faces':x['faces']} if include_faces else {})} for x in g['islands'].values()], 'materials':[s.material.name if s.material else None for s in ob.material_slots],'prepared':bool(state(ob).get('slots'))}


def region_info(ids, object_name=None):
    ob=target(object_name); g=geometry(ob); out=[]
    for ident in ids:
        island=island_of(g,ident)
        indices={v for f in island['faces'] for v in ob.data.polygons[f].vertices}
        coords=np.asarray([ob.data.vertices[v].co[:] for v in indices])
        out.append({'id':ident,'faces':island['faces'],'material':island['material'],'uv_bounds':island['bounds'],'local_bounds':[coords.min(0).tolist(),coords.max(0).tolist()]})
    return out


def selected(ob):
    return state(ob).get('selected', [])


def select_regions(ids, object_name=None, extend=False):
    ob = target(object_name)
    ids=list(ids)
    g, s = geometry(ob), state(ob)
    if not valid_ids(g, ids):
        raise ValueError('Identificador de isla o cara desconocido; vuelve a analizar las UV')
    values = set(selected(ob)) if extend else set()
    for ident in ids:
        if extend and ident in values:
            values.remove(ident)
        else:
            values.add(ident)
    s['selected'] = sorted(values)
    if len(ids)==1 and ids[0].startswith('face-') and ids[0] in values:
        s['face_anchor']=int(ids[0][5:])
    elif not ids or not values:
        s.pop('face_anchor',None)
    store(ob, s)
    # All selection entry points (UV, 3D, groups and agents) choose the same target
    # and atlas page. Otherwise an agent-selected material can be invisible in UV.
    cfg=bpy.context.scene.sstp
    cfg.target=ob
    focus=next((i for i in ids if i in values),next(iter(s['selected']),None))
    if focus:
        material=island_of(g,focus)['material']
        if ob.active_material_index!=material:
            ob.active_material_index=material;sync_images(ob)
    redraw()
    return {'selected':s['selected'],'faces':sum(len(island_of(g,i)['faces']) for i in values)}


def selection_status(object_name=None):
    ob=target(object_name);g=geometry(ob);ids=selected(ob)
    return {'islands':len(ids),'faces':len(faces_of(g,ids)),'active_material':ob.active_material_index,'target':ob.name}


def face_path(ob, start, end):
    """Shortest strip of edge-adjacent faces; cache topology, never edit it."""
    g=geometry(ob); count=len(ob.data.polygons)
    if not (0<=start<count and 0<=end<count): return []
    if 'face_neighbors' not in g:
        neighbors=[set() for _ in range(count)]; edges={}
        for p in ob.data.polygons:
            for edge in p.edge_keys:
                owners=edges.setdefault(edge,[])
                for other in owners:
                    neighbors[p.index].add(other);neighbors[other].add(p.index)
                owners.append(p.index)
        g['face_neighbors']=[tuple(sorted(items)) for items in neighbors]
    previous={start:None};pending=deque([start])
    while pending:
        current=pending.popleft()
        if current==end:
            path=[]
            while current is not None:
                path.append(current);current=previous[current]
            return path[::-1]
        for other in g['face_neighbors'][current]:
            if other not in previous:
                previous[other]=current;pending.append(other)
    return []


def select_face_path(face, object_name=None):
    """Ctrl-click adds the strip from the last face, including both endpoints."""
    ob=target(object_name);face=int(face);g=geometry(ob);s=state(ob)
    current=s.get('selected',[]);anchor=s.get('face_anchor')
    if anchor is None and len(current)==1 and current[0].startswith('face-'):
        anchor=int(current[0][5:])
    # A cleared/toggled-away anchor must not resurrect an unrelated old path.
    if anchor is not None and 'face-%d'%anchor not in current:anchor=None
    path=face_path(ob,anchor,face) if anchor is not None else []
    # Disconnected components have no intermediate faces: add only the endpoint.
    values=set(current);values.update('face-%d'%f for f in (path or [face]))
    result=select_regions(sorted(values),ob.name)
    s=state(ob);s['face_anchor']=face;store(ob,s)
    material=g['face_material'][face]
    if ob.active_material_index!=material:
        ob.active_material_index=material;sync_images(ob)
    result['path']=path or [face]
    return result


def select_face(face, object_name=None, extend=False, as_face=False, path=False):
    """as_face=True selects only that polygon; otherwise its whole UV island."""
    ob = target(object_name)
    if as_face and path:return select_face_path(face,ob.name)
    from .face_fill import base_slot
    material=base_slot(ob,ob.data.polygons[int(face)].material_index)
    if ob.active_material_index!=material:
        ob.active_material_index=material;sync_images(ob)
    ident='face-%d'%int(face) if as_face else geometry(ob)['by_face'][int(face)]
    return select_regions([ident], ob.name, extend)


def save_group(name, object_name=None):
    ob = target(object_name)
    if not name.strip() or not selected(ob):
        raise ValueError('Selecciona regiones y escribe un nombre')
    s = state(ob)
    s.setdefault('groups', {})[name] = selected(ob)
    store(ob, s)
    return s['groups']


def select_group(name, object_name=None):
    ob = target(object_name)
    return select_regions(state(ob).get('groups', {})[name], ob.name)


def contains(point, poly):
    x,y = point
    inside = False
    j = len(poly)-1
    for i in range(len(poly)):
        xi,yi = poly[i]; xj,yj = poly[j]
        if (yi>y)!=(yj>y) and x < (xj-xi)*(y-yi)/(yj-yi)+xi:
            inside = not inside
        j=i
    return inside


def pick_uv(u, v, object_name=None):
    ob = target(object_name)
    g = geometry(ob)
    hits = []
    for ident, island in g['islands'].items():
        if island['material']!=ob.active_material_index:continue
        lo,hi = island['bounds']
        if lo[0]<=u<=hi[0] and lo[1]<=v<=hi[1] and any(contains((u,v),g['face_uv'][f]) for f in island['faces']):
            hits.append(ident)
    return hits


def pick_uv_face(u, v, object_name=None):
    """First polygon under the UV point on the active material page."""
    ob = target(object_name)
    g = geometry(ob)
    if 'face_lo' not in g:
        g['face_lo'] = np.array([p.min(0) for p in g['face_uv']])
        g['face_hi'] = np.array([p.max(0) for p in g['face_uv']])
        g['face_mat'] = np.array(g['face_material'])
    near = np.nonzero((g['face_lo'][:,0]<=u)&(g['face_hi'][:,0]>=u)&(g['face_lo'][:,1]<=v)&(g['face_hi'][:,1]>=v)&(g['face_mat']==ob.active_material_index))[0]
    for f in near:
        if contains((u,v), g['face_uv'][f]):
            return ['face-%d' % f]
    return []


def raster(ob, ids, slot, size):
    """Pixel-center triangle raster; no UV wrapping, no expansion into neighbors."""
    global _raster_bytes
    g = geometry(ob)
    ids=tuple(sorted(set(ids)))
    key=(g.setdefault('raster_token',object()),int(slot),int(size),ids)
    if key in _raster_cache:
        _raster_cache.move_to_end(key)
        return _raster_cache[key]
    mask = np.zeros((size,size), bool)
    for ident in ids:
        island = island_of(g, ident)
        if island['material'] != int(slot):
            continue
        for f in island['faces']:
            poly = g['face_uv'][f]
            if np.any(poly < -1e-6) or np.any(poly > 1+1e-6):
                raise ValueError('UV fuera de 0–1: UDIM/repetición requiere tratamiento explícito')
            vectors = [Vector((float(p[0]),float(p[1]),0)) for p in poly]
            for tri in triangles(vectors):
                a,b,c = np.array([[v.x,v.y] for v in tri],np.float64)*size
                xmin,ymin = np.maximum(np.floor(np.minimum(np.minimum(a,b),c)-.5).astype(int),0)
                xmax,ymax = np.minimum(np.ceil(np.maximum(np.maximum(a,b),c)-.5).astype(int),size-1)
                if xmax<xmin or ymax<ymin:
                    continue
                yy,xx = np.mgrid[ymin:ymax+1,xmin:xmax+1]
                xx=xx+.5; yy=yy+.5
                det = (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
                if abs(det)<1e-12:
                    continue
                w1=((xx-a[0])*(c[1]-a[1])-(yy-a[1])*(c[0]-a[0]))/det
                w2=((b[0]-a[0])*(yy-a[1])-(b[1]-a[1])*(xx-a[0]))/det
                mask[ymin:ymax+1,xmin:xmax+1] |= (w1>=-1e-8)&(w2>=-1e-8)&(w1+w2<=1+1e-8)
    mask.flags.writeable=False
    _raster_cache[key]=mask;_raster_bytes+=mask.nbytes
    while _raster_bytes>RASTER_CACHE_BYTES and len(_raster_cache)>1:
        _,old=_raster_cache.popitem(last=False);_raster_bytes-=old.nbytes
    return mask


def triangles(vectors):
    # Blender 5.2 returns vertex indices; older Blender returns Vectors.
    for tri in tessellate_polygon([vectors]):
        yield [vectors[v] if isinstance(v,int) else v for v in tri]


def paint_padding(ob, slot, data):
    """Bleed working layers into unused UV space, protecting every other island.

    Keep raster() exact for picking, overlap detection and surface paint masks.
    Never pad original images or use padded texels as seeds for later strokes.
    """
    if not np.any(data[...,3]):return data.copy()
    g=geometry(ob); key=(int(slot),data.shape[1],MARGIN)
    maps=g.setdefault('paint_padding',{})
    if key not in maps:
        ids=[i for i,v in g['islands'].items() if v['material']==int(slot)]
        occupied=raster(ob,ids,int(slot),data.shape[1])
        maps[key]=gutter_indices(occupied)
    return apply_gutter(data,maps[key])


def upgrade_paint_padding(ob):
    """Migrate old work layers once; source textures and surface texels stay intact."""
    s=state(ob)
    if not s.get('slots') or s.get('paint_padding_version',0)>=1:return False
    for layer in s['layers']:
        for slot,name in layer['images'].items():
            im=bpy.data.images[name];data=pixels(im)
            if np.any(data[...,3]):write_pixels(im,paint_padding(ob,slot,data))
    s['paint_padding_version']=1;store(ob,s)
    return True


def native_paint_pixels(ob,slot,data,before,ids):
    """Constrain native brush bleed to authorized surfaces, then rebuild gutters."""
    g=geometry(ob);all_ids=[i for i,v in g['islands'].items() if v['material']==int(slot)]
    occupied=raster(ob,all_ids,int(slot),data.shape[1])
    selected_mask=exclusive_mask(ob,ids,int(slot),data.shape[1])
    out=data.copy();protected=occupied&~selected_mask;out[protected]=before[protected]
    return paint_padding(ob,slot,out)


def exclusive_mask(ob, ids, slot, size):
    """Only texels not sampled by any unselected face in this material."""
    g=geometry(ob);chosen=raster(ob,ids,slot,size)
    faces=faces_of(g,ids);others=[]
    selected_bounds=[island_of(g,i)['bounds'] for i in ids if island_of(g,i)['material']==int(slot)]
    for ident,island in g['islands'].items():
        if island['material']!=int(slot):continue
        lo,hi=island['bounds']
        if not any(not (hi[0]<a[0] or lo[0]>b[0] or hi[1]<a[1] or lo[1]>b[1]) for a,b in selected_bounds):continue
        remaining=[f for f in island['faces'] if f not in faces]
        if len(remaining)==len(island['faces']):others.append(ident)
        else:others.extend('face-%d'%f for f in remaining)
    if not others:return chosen
    return chosen & ~raster(ob,others,slot,size)


def overlap_report(object_name=None, ids=None):
    ob=target(object_name); g=geometry(ob); ids=ids if ids is not None else selected(ob)
    if not ids:
        return {'overlaps':[],'shared_material_users':[]}
    s=state(ob); result=[]; size=s.get('resolution',1024)
    key=(size,tuple(sorted(set(ids))))
    reports=g.setdefault('overlap_reports',OrderedDict())
    if key in reports:
        reports.move_to_end(key)
        return {'overlaps':list(reports[key]),'method':'shared pixels at '+str(size)+'px; does not expand UVs','shared_material_users':[m.name for m in ob.data.materials if m and m.users>1]}
    parents={island_of(g,i).get('parent') for i in ids}
    for slot in sorted({island_of(g,i)['material'] for i in ids}):
        chosen=raster(ob, ids,slot,size)
        others=[i for i,x in g['islands'].items() if i not in ids and i not in parents and x['material']==slot]
        # Bounding boxes first; exact triangle overlap is checked in the common raster.
        candidates=[]
        for i in others:
            lo,hi=g['islands'][i]['bounds']
            if any(not (hi[0]<island_of(g,j)['bounds'][0][0] or lo[0]>island_of(g,j)['bounds'][1][0] or hi[1]<island_of(g,j)['bounds'][0][1] or lo[1]>island_of(g,j)['bounds'][1][1]) for j in ids if island_of(g,j)['material']==slot):
                candidates.append(i)
        for i in candidates:
            if np.any(chosen & raster(ob,[i],slot,size)):
                result.append(i)
    reports[key]=tuple(sorted(set(result)))
    while len(reports)>64:reports.popitem(last=False)
    # Different objects referencing the same source image are separated by prepare().
    return {'overlaps':sorted(set(result)), 'method':'shared pixels at '+str(size)+'px; does not expand UVs', 'shared_material_users':[m.name for m in ob.data.materials if m and m.users>1]}


def check_overlaps(ob, allow_overlap=False):
    report=overlap_report(ob.name)
    if report['overlaps'] and not allow_overlap:
        raise ValueError('UV compartidas con '+str(len(report['overlaps']))+' islas no seleccionadas. Confirma allow_overlap=True para afectar esas superficies.')
    return report


def prepare(object_name=None, resolution=1024):
    ob=target(object_name); resolution=int(resolution)
    if resolution not in (1024,2048,4096):
        raise ValueError('Resoluciones admitidas: 1024, 2048, 4096')
    s=state(ob)
    if s.get('slots'):
        if upgrade_preserved_bases(ob) | upgrade_paint_padding(ob):rebuild(ob)
        return {'already_prepared':True,'slots':list(s['slots'])}
    if not ob.material_slots or any(not x.material for x in ob.material_slots):
        raise ValueError('La malla necesita materiales válidos antes de preparar')
    all_uv=np.concatenate(geometry(ob)['face_uv'])
    if np.any(all_uv < -1e-6) or np.any(all_uv > 1+1e-6):
        raise ValueError('UV fuera de 0–1: UDIM/repetición requiere tratamiento explícito; no se modifica nada')
    # Validate all slots first. Procedural graphs must not silently lose their appearance.
    sources=[]
    for slot in ob.material_slots:
        mat=slot.material
        shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat.use_nodes else None
        if not shader:
            raise ValueError('Se necesita Principled BSDF: '+mat.name)
        src=None; procedural=False
        # The original material is never unhooked: its Piel layer stays as it is.
        linked=color_source(mat)
        if linked is not None:
            n=linked.node
            if n.type=='TEX_IMAGE' and n.image and n.image.source=='TILED':
                raise ValueError('Base Color UDIM no compatible; conserva el original: '+mat.name)
            # Procedural surfaces (Tiny Eye groups) keep their own material and are
            # left out of painting; they must not block the rest of the character.
            procedural=n.type!='TEX_IMAGE' or not n.image
        if procedural:
            sources.append((mat,shader,None,True));continue
        if linked is not None:
            if n.projection!='FLAT' or tuple(n.texture_mapping.translation)!=(0,0,0) or tuple(n.texture_mapping.rotation)!=(0,0,0) or tuple(n.texture_mapping.scale)!=(1,1,1):
                raise ValueError('La textura tiene una proyección o transformación especial; no se sustituye automáticamente: '+mat.name)
            if n.inputs['Vector'].is_linked:
                coord=n.inputs['Vector'].links[0].from_node
                if coord.type!='UVMAP' or coord.uv_map not in ('',ob.data.uv_layers.active.name):
                    raise ValueError('Mapeado de textura no coincide con las UV activas: '+mat.name)
            src=n.image
        alpha=shader.inputs['Alpha']
        if alpha.is_linked and (not src or getattr(alpha.links[0].from_node,'image',None)!=src):
            raise ValueError('Alpha con una fuente diferente de Base Color requiere tratamiento explícito')
        sources.append((mat,shader,src,False))
    if all(x[3] for x in sources):raise ValueError('Ningún material tiene una textura de color que pintar')
    s.update({'resolution':resolution,'uv_name':ob.data.uv_layers.active.name,'slots':{},'layers':[{'name':'Colores base','visible':True,'opacity':1.0,'images':{}}],'active_layer':0})
    for index,(original,shader,src,procedural) in enumerate(sources):
        slot=ob.material_slots[index]; old_link=slot.link
        if procedural:mat=original
        else:
            mat=original.copy(); mat.name=original.name+' · SSTP'; mat.use_fake_user=True
            # Object linked slots prevent edits to another object sharing the same mesh.
            slot.link='OBJECT'; slot.material=mat
        if src:
            # Preserve dimensions, bytes, alpha convention and color space exactly.
            # Square nearest-neighbor copies caused visible tears in eyelash masks.
            base=protected_copy(src,ob.name+' · Original protegido · '+str(index))
        else:
            data=np.empty((resolution,resolution,4),np.float32); data[:]=shader.inputs['Base Color'].default_value
            data[...,3]=shader.inputs['Alpha'].default_value
            base=new_image(ob.name+' · Original protegido · '+str(index),resolution,data);base.pack()
        layer=new_image(ob.name+' · Colores base · '+str(index),resolution,np.zeros((resolution,resolution,4),np.float32))
        s['slots'][str(index)]={'original_material':original.name,'original_link':old_link,'material':mat.name,'base':base.name,'source_image':src.name if src else None,'native_base':True,**({'procedural':True} if procedural else {})}
        s['layers'][0]['images'][str(index)]=layer.name
    store(ob,s); rebuild(ob); redraw()
    return {'object':ob.name,'resolution':resolution,'materials':len(s['slots']),'originals_preserved':True}


def rebuild(ob):
    upgrade_preserved_bases(ob)
    upgrade_paint_padding(ob)
    s=state(ob)
    from . import piel
    for slot,info in s.get('slots',{}).items():
        if info.get('procedural'):continue
        mat=bpy.data.materials[info['material']]; nt=mat.node_tree
        for n in list(nt.nodes):
            if n.get('sstp'):
                nt.nodes.remove(n)
        shader=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED')
        template=source_node(info)
        def tex(name):
            n=nt.nodes.new('ShaderNodeTexImage'); n['sstp']=True; n.image=bpy.data.images[name]; n.label=name
            if template:
                n.extension=template.extension;n.interpolation=template.interpolation;n.projection=template.projection
            uv=nt.nodes.get('SSTP UV')
            if not uv:
                uv=nt.nodes.new('ShaderNodeUVMap'); uv.name='SSTP UV'; uv['sstp']=True; uv.uv_map=s['uv_name']
            nt.links.new(uv.outputs['UV'],n.inputs['Vector'])
            return n
        base_node=nt.nodes.get(template.name) if template else None
        if base_node and base_node.type=='TEX_IMAGE':
            # Reuse the copied original node, preserving its complete sampling
            # settings and coordinate wiring, with the protected native image.
            base_node.image=bpy.data.images[info['base']]
            prev=base_node.outputs['Color']
        else:prev=tex(info['base']).outputs['Color']
        # Piel's clean repaint corrects the original, so paint layers go above it.
        prev=piel.insert_clean(nt,prev); alphas=[]
        for i,layer in enumerate(s['layers']):
            node=tex(layer['images'][slot]); node.location=(-900+i*240,0)
            mul=nt.nodes.new('ShaderNodeMath'); mul['sstp']=True; mul.operation='MULTIPLY'; mul.inputs[1].default_value=layer['opacity'] if layer['visible'] else 0
            nt.links.new(node.outputs['Alpha'],mul.inputs[0]); guarded=piel.lip_guard(nt,mul.outputs[0]); alphas.append(guarded)
            mix=nt.nodes.new('ShaderNodeMixRGB'); mix['sstp']=True; mix.blend_type='MIX'
            nt.links.new(guarded,mix.inputs[0]); nt.links.new(prev,mix.inputs[1]); nt.links.new(node.outputs['Color'],mix.inputs[2]); prev=mix.outputs[0]
            if i==s['active_layer']:
                nt.nodes.active=node; node.select=True
        nt.links.new(prev,shader.inputs['Base Color'])
        # Painted texels replace the skin shader, or the stroke stays hidden under it.
        piel.cover(nt,alphas)
    from . import face_fill
    face_fill.rebuild(ob,force=True)
    sync_images(ob)


def add_layer(name='Detalles', object_name=None):
    ob=target(object_name); s=state(ob)
    if not s.get('slots'):
        raise ValueError('Prepara las texturas primero')
    layer={'name':name,'visible':True,'opacity':1.0,'images':{}}
    for slot in s['slots']:
        im=new_image(ob.name+' · '+name+' · '+slot,s['resolution'],np.zeros((s['resolution'],s['resolution'],4),np.float32))
        layer['images'][slot]=im.name
    s['layers'].append(layer); s['active_layer']=len(s['layers'])-1
    store(ob,s); rebuild(ob); redraw()
    return {'layer':s['active_layer'],'name':name}


def set_layer(index, object_name=None, visible=None, opacity=None, name=None):
    ob=target(object_name); s=state(ob); layer=s['layers'][int(index)]; s['active_layer']=int(index)
    if visible is not None: layer['visible']=bool(visible)
    if opacity is not None: layer['opacity']=min(1,max(0,float(opacity)))
    if name is not None: layer['name']=str(name)
    store(ob,s); rebuild(ob); redraw()
    return layer


def _checkpoint(ob, slot):
    s=state(ob); im=bpy.data.images[s['layers'][s['active_layer']]['images'][str(slot)]]
    history=_history.setdefault(ob.name,{'undo':[],'redo':[]})
    # Bounded pixel history. Native brush strokes use Blender's own image undo.
    history['undo'].append((im.name,pixels(im).copy())); history['redo'].clear()
    def weight(item):
        if isinstance(item,dict):return len(json.dumps(item).encode())
        return sum(a.nbytes for _,a in item) if isinstance(item,list) else item[1].nbytes
    while sum(weight(item) for item in history['undo'])>192*1024*1024 and len(history['undo'])>1:
        history['undo'].pop(0)
    return im


def history_step(redo=False, object_name=None):
    ob=target(object_name); h=_history.setdefault(ob.name,{'undo':[],'redo':[]}); src='redo' if redo else 'undo'; dst='undo' if redo else 'redo'
    if not h[src]: return {'changed':False}
    entry=h[src].pop()
    if isinstance(entry,dict) and 'exact_fills' in entry:
        from . import face_fill
        h[dst].append(face_fill.restore_history(ob,entry));redraw();return {'changed':True}
    items=entry if isinstance(entry,list) else [entry]; reverse=[]
    for name,data in items:
        im=bpy.data.images.get(name)
        if im: reverse.append((name,pixels(im).copy())); write_pixels(im,data)
    h[dst].append(reverse); redraw(); return {'changed':True}


def fill(color, object_name=None, erase=False, allow_overlap=False, exclusive=False, exact_faces=False, shared_fallback=False):
    if exact_faces:
        from . import face_fill
        return face_fill.apply(color,object_name,erase)
    ob=target(object_name); s=state(ob); ids=selected(ob)
    if not s.get('slots'): raise ValueError('Prepara las texturas primero')
    if not ids: raise ValueError('Selecciona una isla UV o un grupo')
    if len(color)!=4 or any(not math.isfinite(float(v)) or v<0 or v>1 for v in color): raise ValueError('Color RGBA entre 0 y 1')
    report=overlap_report(ob.name) if exclusive else check_overlaps(ob,allow_overlap)
    g=geometry(ob); count=0; changes=[];excluded=0
    # Calculate every mask before modifying any image, so unsupported UVs fail atomically.
    masks={slot:raster(ob,ids,slot,s['resolution']) for slot in sorted({island_of(g,i)['material'] for i in ids})}
    if exclusive:
        for slot,mask in list(masks.items()):
            masks[slot]=exclusive_mask(ob,ids,slot,s['resolution'])
            excluded+=int(mask.sum())-int(masks[slot].sum())
        if excluded and shared_fallback:
            # UI color fill is a whole-region operation. Independent face
            # materials can color shared UVs without touching the other surface.
            from . import face_fill
            return face_fill.apply(color,ob.name,erase)
        if not any(mask.any() for mask in masks.values()):
            raise ValueError('Toda la selección comparte píxeles con superficies no seleccionadas; no se pintó nada')
    for slot,mask in masks.items():
        if not mask.any():continue
        im=_checkpoint(ob,slot); changes.append(_history[ob.name]['undo'].pop())
        a=pixels(im).copy(); a[mask]=[0,0,0,0] if erase else color
        write_pixels(im,paint_padding(ob,slot,a)); count+=int(mask.sum())
    _history[ob.name]['undo'].append(changes)
    redraw(); return {'pixels':count,'protected_shared_pixels':excluded,'exclusive':exclusive,'overlap_report':report,'mesh_modified':False}


def begin_stroke(ob, allow_overlap=False, exclusive=False):
    s=state(ob); ids=selected(ob)
    if not s.get('slots') or not ids: raise ValueError('Prepara las texturas y selecciona una región')
    if not exclusive:check_overlaps(ob,allow_overlap)
    mats={island_of(geometry(ob),i)['material'] for i in ids}; buffers=[]
    mats={m for m in mats if not s['slots'].get(str(m),{}).get('procedural')}
    if not mats:raise ValueError('La selección solo tiene superficies procedurales (ojos); no se pintan')
    for slot in mats:
        im=bpy.data.images[s['layers'][s['active_layer']]['images'][str(slot)]]
        data=pixels(im).copy()
        mask=exclusive_mask(ob,ids,slot,s['resolution']) if exclusive else raster(ob,ids,slot,s['resolution'])
        buffers.append({'image':im,'slot':slot,'data':data,'before':data.copy(),'mask':mask})
    if not any(b['mask'].any() for b in buffers):raise ValueError('Toda la selección comparte píxeles; no se pintó nada')
    return {'object':ob,'size':s['resolution'],'buffers':buffers}


def stroke_dab(stroke,u,v,color,radius=20,strength=1,erase=False):
    size=stroke['size']; x=u*size; y=v*size; rad=max(1,float(radius))
    xmin=max(0,int(x-rad)); xmax=min(size,int(x+rad)+1); ymin=max(0,int(y-rad)); ymax=min(size,int(y+rad)+1)
    if xmin>=xmax or ymin>=ymax:return
    yy,xx=np.mgrid[ymin:ymax,xmin:xmax]; circle=((xx+.5-x)**2+(yy+.5-y)**2<=rad**2)
    for item in stroke['buffers']:
        region=item['data'][ymin:ymax,xmin:xmax]; mask=circle&item['mask'][ymin:ymax,xmin:xmax]
        if not np.any(mask):continue
        a=region[mask].copy(); alpha=min(1,max(0,float(strength)))*float(color[3])
        if erase: a[:,3]*=1-alpha
        else:
            old=a[:,3:4]; new=alpha+old*(1-alpha)
            a[:,:3]=(np.asarray(color[:3])*alpha+a[:,:3]*old*(1-alpha))/np.maximum(new,1e-8); a[:,3:4]=new
        region[mask]=a


def finish_stroke(stroke):
    changed=[]
    for item in stroke['buffers']:
        if not np.array_equal(item['before'],item['data']):
            item['data']=paint_padding(stroke['object'],item['slot'],item['data'])
            write_pixels(item['image'],item['data']); changed.append((item['image'].name,item['before']))
    if changed:
        h=_history.setdefault(stroke['object'].name,{'undo':[],'redo':[]}); h['undo'].append(changed); h['redo'].clear()
    return {'changed':bool(changed),'mesh_modified':False}


def brush_stroke(points,color,object_name=None,radius=20,strength=1,erase=False,allow_overlap=False):
    ob=target(object_name); stroke=begin_stroke(ob,allow_overlap)
    previous=None
    for u,v in points:
        if previous:
            distance=math.hypot(u-previous[0],v-previous[1])*stroke['size']; steps=max(1,int(distance/max(1,radius/3)))
            for j in range(1,steps+1):
                t=j/steps; stroke_dab(stroke,previous[0]+(u-previous[0])*t,previous[1]+(v-previous[1])*t,color,radius,strength,erase)
        else: stroke_dab(stroke,u,v,color,radius,strength,erase)
        previous=(u,v)
    result=finish_stroke(stroke); sync_images(ob); redraw(); return result


def linear_base(ob, slot):
    s=state(ob);info=s['slots'][str(slot)];base=bpy.data.images[info['base']]
    # Protected bases are immutable. Reconvert only if their buffer is replaced.
    bases=geometry(ob).setdefault('linear_bases',{})
    key=(base.as_pointer(),tuple(base.size),base.colorspace_settings.name,_image_versions.get(base.as_pointer(),0))
    if str(slot) not in bases or bases[str(slot)][0]!=key:
        bases[str(slot)]=(key,image_linear(base))
    return bases[str(slot)][1]


def composite(ob, slot, coverage=False):
    s=state(ob);info=s['slots'][str(slot)]
    a=resize_linear(linear_base(ob,slot),s['resolution'],s['resolution'])
    original=bpy.data.materials[info['original_material']]
    shader=next(n for n in original.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    if not shader.inputs['Alpha'].is_linked:a[...,3]=shader.inputs['Alpha'].default_value
    from . import piel
    a=piel.clean(ob,slot,a)
    cover=np.zeros(a.shape[:2],np.float32)
    from . import face_fill
    keep=face_fill.lip_edge(ob,slot,a.shape[1],a.shape[0])
    # Shader mixes RGB with straight-alpha layers, retaining base alpha.
    for l in s['layers']:
        if not l['visible']: continue
        b=paint_padding(ob,slot,pixels(bpy.data.images[l['images'][str(slot)]]))
        if keep is not None:b=b.copy();b[...,3:4]*=1-keep
        blend_rgb(a,b,l['opacity']); cover=np.maximum(cover,b[...,3]*l['opacity'])
    return (a,cover) if coverage else a


def export_color(ob,slot,resolution=None):
    """Keep unpainted textures at native aspect ratio, including eyelash masks."""
    s=state(ob);slot=str(slot);info=s['slots'][slot]
    painted=any(l['visible'] and l['opacity']>0 and np.any(pixels(bpy.data.images[l['images'][slot]])[...,3]>0) for l in s['layers'])
    from . import piel
    cover=None
    if painted:a,cover=composite(ob,slot,coverage=True)
    else:
        a=image_linear(bpy.data.images[info['base']])
        mat=bpy.data.materials[info['original_material']];shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        if not shader.inputs['Alpha'].is_linked:a[...,3]=shader.inputs['Alpha'].default_value
        a=piel.clean(ob,slot,a)
    if resolution:
        height,width=a.shape[:2];factor=int(resolution)/max(width,height)
        size=(max(1,round(width*factor)),max(1,round(height*factor)))
        a=resize_linear(a,*size)
        if cover is not None:cover=resize_linear(np.repeat(cover[...,None],4,2),*size)[...,0]
    return piel.flatten(ob,slot,a,cover)


def import_reference(filepath):
    path=Path(filepath)
    if path.suffix.lower() not in ('.png','.jpg','.jpeg') or not path.is_file(): raise ValueError('Elige una imagen PNG/JPG existente')
    im=bpy.data.images.load(str(path),check_existing=True); im.use_fake_user=True; im.pack()
    cfg=bpy.context.scene.sstp; cfg.reference=im
    if im.name not in [r.image.name for r in cfg.references if r.image]:
        r=cfg.references.add(); r.image=im; r.name=path.stem
    sync_images(cfg.target); redraw(); return {'image':im.name,'size':list(im.size)}


def extract_palette(count=8):
    im=bpy.context.scene.sstp.reference
    if not im: raise ValueError('Carga una referencia')
    a=image_linear(im).reshape(-1,4); a=a[::max(1,len(a)//20000)]; a=a[(a[:,3]>.75)&(a[:,:3].max(1)>.008)]
    if not len(a): raise ValueError('La referencia no contiene colores visibles')
    x=a[:,:3]; k=min(int(count),len(x)); centers=[x[len(x)//2]]
    for _ in range(k-1):
        d=((x[:,None,:]-np.asarray(centers)[None,:,:])**2).sum(2).min(1); centers.append(x[int(d.argmax())])
    centers=np.asarray(centers)
    for _ in range(18):
        labels=((x[:,None,:]-centers[None,:,:])**2).sum(2).argmin(1)
        centers=np.array([x[labels==i].mean(0) if np.any(labels==i) else centers[i] for i in range(k)])
    cfg=bpy.context.scene.sstp; cfg.palette.clear()
    out=[]
    for j,i in enumerate(np.argsort(-np.bincount(labels,minlength=k))):
        p=cfg.palette.add(); p.name='Color '+str(j+1); p.color=tuple(centers[i])+(1,); out.append({'name':p.name,'color':list(p.color)})
    if out: cfg.color=out[0]['color']
    redraw(); return out


def sample_reference(u,v):
    im=bpy.context.scene.sstp.reference
    if not im: raise ValueError('Carga una referencia')
    x=max(0,min(im.size[0]-1,int(u*im.size[0]))); y=max(0,min(im.size[1]-1,int(v*im.size[1])))
    c=image_linear(im)[y,x]; bpy.context.scene.sstp.color=tuple(c); redraw(); return list(map(float,c))


def _texel(image, u, v):
    w,h=image.size; x=min(w-1,max(0,int(u*w))); y=min(h-1,max(0,int(v*h)))
    i=(y*w+x)*4
    return np.array(image.pixels[i:i+4],np.float32)


def sample_surface(face, weights, object_name=None, uv_point=None):
    """Eyedropper on the model: the color seen on that polygon, linear RGB.

    weights are the interpolation weights of the hit point, one per polygon corner.
    """
    ob=target(object_name); g=geometry(ob); face=int(face)
    if uv_point is None:
        uv=g['face_uv'][face]; w=np.asarray(weights,np.float64)
        if len(w)!=len(uv): raise ValueError('Pesos de la cara inconsistentes')
        u,v=(uv*w[:,None]).sum(0)
    else:u,v=map(float,uv_point)
    color=np.asarray(sample_uv_color(float(u),float(v),g['face_material'][face],ob))
    from . import face_fill
    for op,alpha in face_fill.active_operations(state(ob)):
        if face in op['faces']:color[:3]=color[:3]*(1-alpha)+np.asarray(op['color'][:3])*alpha
    result=[float(v) for v in color];bpy.context.scene.sstp.color=result
    return result


def sample_uv_color(u, v, slot=None, ob=None):
    """Color under a UV point (protected base + visible layers); sets the brush color."""
    ob=ob or target(); s=state(ob)
    slot=ob.active_material_index if slot is None else int(slot)
    from . import piel
    cover=0.0
    if s.get('slots') and not s['slots'].get(str(slot),{}).get('procedural'):
        a=linear_base(ob,slot); h,w=a.shape[:2]
        c=a[min(h-1,max(0,int(v*h))),min(w-1,max(0,int(u*w)))].copy()
        c[:3]=piel.clean_at(ob,slot,u,v,c[:3]); under=c[:3].copy()
        for l in s['layers']:
            if not l['visible']: continue
            px=_texel(bpy.data.images[l['images'][str(slot)]],u,v); alpha=float(px[3])*l['opacity']
            c[:3]=c[:3]*(1-alpha)+px[:3]*alpha; cover=max(cover,alpha)
        rgb=c[:3]
    else:
        mat=ob.material_slots[min(slot,len(ob.material_slots)-1)].material
        shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat and mat.use_nodes else None
        socket=shader.inputs['Base Color'] if shader else None
        # Through «Piel Limpia Mezcla» to the character's texture, not the socket default.
        source=color_source(mat) if shader else None
        node=source.node if source else None
        if node and node.type=='TEX_IMAGE' and node.image:
            px=_texel(node.image,u,v)[:3]
            rgb=to_linear(px) if node.image.colorspace_settings.name=='sRGB' else px
        elif socket and not socket.is_linked: rgb=np.array(socket.default_value[:3],np.float32)
        elif socket: raise ValueError('Esta superficie es procedural (p. ej. ojos); el gotero no la lee')
        else: raise ValueError('El material no tiene color que extraer')
        rgb=piel.clean_at(ob,slot,u,v,rgb); under=rgb
    # Where the skin shader is the visible surface, its color is what is seen.
    rgb=piel.skin_at(ob,slot,u,v,rgb,cover,under)
    color=tuple(float(x) for x in np.clip(rgb,0,1))+(1.0,)
    bpy.context.scene.sstp.color=color; redraw()
    return list(color)


def sync_images(ob):
    if not hasattr(bpy.context.scene,'sstp'): return
    cfg=bpy.context.scene.sstp; s=state(ob) if ob else {}
    active=None; preview=None
    if ob and ob.mode=='EDIT':
        ob.update_from_editmode()
    if ob and not s.get('slots') and ob.data.uv_layers.active:
        # An imported Tripo model is already textured: show its own Base Color
        # immediately, without preparing materials or allocating painting layers.
        mat=ob.active_material
        shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat and mat.use_nodes else None
        socket=shader.inputs.get('Base Color') if shader else None
        node=socket.links[0].from_node if socket and socket.is_linked else None
        preview=node.image if node and node.type=='TEX_IMAGE' else None
        active=preview
    if s.get('slots'):
        from . import face_fill
        slot=str(face_fill.base_slot(ob,min(ob.active_material_index,len(ob.material_slots)-1)))
        active=bpy.data.images.get(s['layers'][s['active_layer']]['images'].get(slot,''))
        name=s.get('preview','')
        preview=bpy.data.images.get(name)
        if not preview:
            preview=new_image(ob.name+' · Vista combinada',s['resolution'])
            s['preview']=preview.name; store(ob,s)
        # A real UV atlas: black outside faces, original colors within each island.
        # The visible image is a preview only, never an exported/painter layer.
        g=geometry(ob); size=s['resolution']
        def revision(name):
            im=bpy.data.images.get(name)
            return (im.as_pointer(),tuple(im.size),_image_versions.get(im.as_pointer(),0)) if im else None
        signature=(preview.as_pointer(),slot,size,bool(cfg.uv_texture),
                   revision(s['slots'][slot]['base']),
                   tuple((l['visible'],l['opacity'],revision(l['images'][slot])) for l in s['layers']),json.dumps(s.get('exact_fills',[])))
        if g.get('preview_signature')!=signature:
            atlas=np.zeros((size,size,4),np.float32); atlas[...,3]=1
            ids=[i for i,x in g['islands'].items() if x['material']==int(slot)]
            mask=raster(ob,ids,int(slot),size)
            if getattr(cfg,'uv_texture',False):
                colors=composite(ob,int(slot))
                for op,alpha in face_fill.active_operations(s):
                    region=raster(ob,['face-%d'%f for f in op['faces']],int(slot),size)
                    colors[region,:3]=colors[region,:3]*(1-alpha)+np.asarray(op['color'][:3])*alpha
                atlas[mask]=colors[mask]; atlas[...,3]=1
            else:atlas[mask]=[.94,.94,.94,1]
            write_pixels(preview,atlas)
            g['preview_signature']=signature
    for screen in bpy.data.screens:
        if 'SSTP' not in screen.name: continue
        image_areas=sorted([a for a in screen.areas if a.type=='IMAGE_EDITOR'],key=lambda a:a.x)
        for area in image_areas:
            if area.type=='IMAGE_EDITOR':
                space=area.spaces.active
                space.image=cfg.reference if area==image_areas[0] else active if space.ui_mode=='PAINT' else preview


def redraw():
    for screen in bpy.data.screens:
        for area in screen.areas: area.tag_redraw()


def export_png(directory, object_name=None, resolution=None, overwrite=False):
    ob=target(object_name); s=state(ob)
    if not s.get('slots'): raise ValueError('Prepara las texturas primero')
    size=int(resolution or s['resolution'])
    if size not in (1024,2048,4096): raise ValueError('Resolución PNG no admitida')
    path=Path(directory).resolve(); path.mkdir(parents=True,exist_ok=True)
    from . import face_fill
    exact=face_fill.used_materials(ob)
    slots={**{k:v for k,v in s['slots'].items() if not v.get('procedural')},**exact}
    names={slot:path/(bpy.path.clean_name(ob.name)+'_BaseColor_'+slot+'.png') for slot in slots}
    manifest=path/(bpy.path.clean_name(ob.name)+'_textures.json')
    if not overwrite and any(p.exists() for p in [*names.values(),manifest]): raise ValueError('Ya existe una exportación; elige otra carpeta o confirma overwrite=True')
    result=[]
    for slot,info in slots.items():
        a=face_fill.export_color(ob,slot) if slot in exact else export_color(ob,slot,int(resolution) if resolution is not None else None)
        im=encoded_image('SSTP export temporal',a)
        try:
            # Image.save converts linear float colors to the assigned sRGB file space.
            im.file_format='PNG'; im.filepath_raw=str(names[slot]); im.save()
        finally: bpy.data.images.remove(im)
        result.append({'slot':int(slot),'material':info['material'],'file':str(names[slot]),'uv':s['uv_name'],'colorSpace':'srgb','width':a.shape[1],'height':a.shape[0]})
    manifest.write_text(json.dumps({'object':ob.name,'resolution':size,'uv':s['uv_name'],'textures':result,**({'face_materials':[p.material_index for p in ob.data.polygons],'exact_face_fills':True,'ready_file':'Exporta GLB para cargar directamente sin configurar materiales.'} if exact else {}),'threejs':{'colorSpace':'THREE.SRGBColorSpace','flipY':False,'note':'GLTFLoader configura colorSpace y flipY automáticamente; al cargar PNG manualmente aplica ambos valores.'}},ensure_ascii=False,indent=2),encoding='utf-8')
    return {'textures':result,'manifest':str(manifest)}


@mouth_preview.without_preview
def export_glb(filepath, object_name=None, overwrite=False, object_names=None):
    ob=target(object_name); s=state(ob); path=Path(filepath).resolve()
    if path.suffix.lower()!='.glb': raise ValueError('El destino debe terminar en .glb')
    if path.exists() and not overwrite: raise ValueError('El GLB ya existe; confirma overwrite=True')
    if not s.get('slots'): raise ValueError('Prepara las texturas primero')
    if ob.mode!='OBJECT': raise ValueError('Sal del modo pincel antes de exportar GLB')
    old_selected=list(bpy.context.selected_objects); old_active=bpy.context.view_layer.objects.active
    saved=[(sl.link,sl.material) for sl in ob.material_slots]; temps=[]; images=[]
    path.parent.mkdir(parents=True,exist_ok=True)
    try:
        for slot,info in s['slots'].items():
            if info.get('procedural'):continue
            a=export_color(ob,slot); im=encoded_image('SSTP GLB BaseColor '+slot,a); images.append(im)
            # Byte PNG image in sRGB, packed for the glTF exporter.
            im.pack()
            source=bpy.data.materials[info['material']]; mat=source.copy(); temps.append(mat); nt=mat.node_tree
            for n in list(nt.nodes):
                if n.get('sstp') or n.get('sstp_piel'): nt.nodes.remove(n)
            shader=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED')
            # The skin shader cannot reach glTF: its color is already in the image.
            output=next((n for n in nt.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output),None)
            if output:nt.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
            tex=nt.nodes.new('ShaderNodeTexImage'); tex.image=im
            template=source_node(info)
            if template:tex.extension=template.extension;tex.interpolation=template.interpolation;tex.projection=template.projection
            uv=nt.nodes.new('ShaderNodeUVMap'); uv.uv_map=s['uv_name']; nt.links.new(uv.outputs['UV'],tex.inputs['Vector'])
            nt.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
            # Alpha is preserved independently of painting RGB.
            if np.any(a[...,3]<.999): nt.links.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
            from . import piel
            if piel.active(ob) and int(slot)==piel.info(ob)['slot']:piel.attach_relief(ob,mat,images)
            ob.material_slots[int(slot)].material=mat
        # glTF primitives retain the face/material boundary exactly. Bake only
        # each material's color stack, never the boundary into a 2K UV mask.
        from . import face_fill
        for slot,info in face_fill.used_materials(ob).items():
            mat=ob.material_slots[int(info['base_slot'])].material.copy();temps.append(mat)
            shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            a=face_fill.export_color(ob,slot)
            # An opaque final face fill is a constant PBR factor, not a 2K map.
            last=info['ops'][-1]
            if last[3]==1 and np.all(a[...,3]==1):
                socket=shader.inputs['Base Color']
                for link in list(socket.links):mat.node_tree.links.remove(link)
                socket.default_value=(*last[:3],1)
                for link in list(shader.inputs['Alpha'].links):mat.node_tree.links.remove(link)
                shader.inputs['Alpha'].default_value=1
            else:
                im=encoded_image('SSTP GLB Exact '+slot,a);images.append(im);im.pack()
                texture=shader.inputs['Base Color'].links[0].from_node;texture.image=im
            ob.material_slots[int(slot)].material=mat
        for o in old_selected: o.select_set(False)
        export_objects={ob,*ob.children_recursive}
        from . import export_assets
        export_objects.update(export_assets.attachments(ob))
        for m in ob.modifiers:
            if m.type=='ARMATURE' and m.object: export_objects.add(m.object)
        rigs=[o for o in export_objects if o.type=='ARMATURE']
        for rig in rigs:
            for child in rig.children_recursive:
                if child.type in ('MESH','EMPTY') and not child.name.startswith('WGT-'):
                    export_objects.add(child)
        if object_names is not None:
            for name in object_names:
                item=bpy.data.objects.get(name)
                if not item:raise ValueError('Objeto de exportación desconocido: '+name)
                export_objects.add(item)
        with export_assets.prepared(export_objects) as ready:
            for o in list(bpy.context.selected_objects):o.select_set(False)
            for o in ready:
                if o.name in bpy.context.view_layer.objects: o.select_set(True)
            bpy.context.view_layer.objects.active=ob
            outcome=bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=False,export_texcoords=True,export_materials='EXPORT',export_image_format='AUTO',export_morph=True,export_skins=True,export_animations=True)
            if 'FINISHED' not in outcome: raise RuntimeError('Blender canceló la exportación')
    finally:
        for sl,(link,mat) in zip(ob.material_slots,saved): sl.link=link; sl.material=mat
        for o in list(bpy.context.selected_objects): o.select_set(False)
        for o in old_selected:
            if o.name in bpy.context.view_layer.objects: o.select_set(True)
        bpy.context.view_layer.objects.active=old_active
        for m in temps: bpy.data.materials.remove(m)
        for im in images: bpy.data.images.remove(im)
    from . import web_optimize
    optimization=web_optimize.optimize_glb(path)
    return {'file':str(path),'bytes':path.stat().st_size,'objects':[o.name for o in export_objects],'format':'glTF 2.0 embedded WebP/PNG, automatic web resolution','web_optimization':optimization,'uv_modified':False}


def pack_project(object_name=None):
    ob=target(object_name); s=state(ob)
    for info in s.get('slots',{}).values(): bpy.data.images[info['base']].pack()
    for layer in s.get('layers',[]):
        for name in layer['images'].values(): bpy.data.images[name].pack()
    return {'packed':True,'blend_saved':False}


def save_project(filepath, object_name=None, overwrite=False):
    path=Path(filepath).resolve()
    if path.suffix.lower()!='.blend':raise ValueError('El destino debe ser un archivo .blend')
    if path.exists() and not overwrite:raise ValueError('El .blend existe; guardar requiere autorización expresa de sobrescritura')
    pack_project(object_name);path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    return {'saved':str(path)}


def open_editor(object_name=None):
    ob=target(object_name);bpy.context.scene.sstp.target=ob
    outcome=bpy.ops.sstp.workspace()
    return {'object':ob.name,'workspace_scheduled': 'FINISHED' in outcome}


def import_model(filepath):
    path=Path(filepath)
    if path.suffix.lower() not in ('.glb','.gltf') or not path.is_file():raise ValueError('Elige un GLB/glTF existente')
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported=[o for o in bpy.data.objects if o not in before]
    meshes=[o for o in imported if o.type=='MESH' and o.data.uv_layers.active]
    if meshes:bpy.context.scene.sstp.target=meshes[0]
    return {'objects':[o.name for o in imported],'meshes_with_uv':[o.name for o in meshes]}


def restore_originals(object_name=None):
    ob=target(object_name); s=state(ob)
    if s.get('exact_base_slots'):
        from . import face_fill
        s['exact_suspended']=True;store(ob,s);face_fill.rebuild(ob)
    for index,info in s.get('slots',{}).items():
        slot=ob.material_slots[int(index)]; slot.material=bpy.data.materials[info['original_material']]; slot.link=info['original_link']
    # Layers and originals stay in the file for recoverability; state is retained.
    return {'restored':True,'layers_kept':True}


def resume(object_name=None):
    ob=target(object_name); s=state(ob)
    s['exact_suspended']=False;store(ob,s)
    for index,info in s.get('slots',{}).items():
        if info.get('procedural'):continue
        slot=ob.material_slots[int(index)]; slot.link='OBJECT'; slot.material=bpy.data.materials[info['material']]
    rebuild(ob); return {'resumed':True}


def status(object_name=None):
    ob=target(object_name); s=state(ob)
    return {'object':ob.name,'blend':bpy.data.filepath,'prepared':bool(s.get('slots')),'selected':selected(ob),'groups':s.get('groups',{}),'layers':s.get('layers',[]),'active_layer':s.get('active_layer',0),'uv':ob.data.uv_layers.active.name}


def dispatch(action, **kwargs):
    """Allowlisted entry point shared by the UI, native Blender MCP and local MCP."""
    if action in ('agent_start','agent_paint','agent_export'):
        from . import agent
        return {'agent_start':agent.start,'agent_paint':agent.paint,'agent_export':agent.export}[action](**kwargs)
    if action in ('agent_skin','agent_skin_status','agent_skin_remove'):
        from . import piel
        return {'agent_skin':piel.agent_apply,'agent_skin_status':piel.status,'agent_skin_remove':piel.remove}[action](**kwargs)
    allowed={'inspect':inspect,'region_info':region_info,'status':status,'selection_status':selection_status,'prepare':prepare,'open_editor':open_editor,'import_model':import_model,'select_regions':select_regions,'select_face':select_face,'save_group':save_group,'select_group':select_group,'overlap_report':overlap_report,'fill':fill,'brush_stroke':brush_stroke,'add_layer':add_layer,'set_layer':set_layer,'history_step':history_step,'import_reference':import_reference,'extract_palette':extract_palette,'sample_reference':sample_reference,'sample_uv_color':sample_uv_color,'export_png':export_png,'export_glb':export_glb,'pack_project':pack_project,'save_project':save_project,'restore_originals':restore_originals,'resume':resume}
    if action not in allowed: raise ValueError('Acción no admitida: '+action)
    return allowed[action](**kwargs)
