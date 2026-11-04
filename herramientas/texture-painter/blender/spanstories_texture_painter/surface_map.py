"""Map evaluated faces to original paint faces without editing the character."""
import hashlib
import bpy
import numpy as np
from bpy.app.handlers import persistent

_cache = {}
_TAG = 'sstp_source_paint_face'
_sources = {}
_dirty = set()


def clear_runtime_caches():
    _cache.clear()
    _sources.clear()
    _dirty.clear()


@persistent
def geometry_updated(scene, depsgraph):
    for update in depsgraph.updates:
        if not update.is_updated_geometry:
            continue
        changed=update.id.original
        for pointer,(ob,mesh) in list(_sources.items()):
            try:
                if changed==ob or changed==mesh:_dirty.add(pointer)
            except ReferenceError:
                _cache.pop(pointer,None);_sources.pop(pointer,None);_dirty.discard(pointer)


def register():
    if geometry_updated not in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.append(geometry_updated)


def unregister():
    if geometry_updated in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.remove(geometry_updated)
    clear_runtime_caches()


def _signature(mesh, positions=True):
    digest = hashlib.blake2b(digest_size=16)
    for collection, prop, width, dtype in (
        (mesh.vertices, 'co', 3, np.float32),
        (mesh.loops, 'vertex_index', 1, np.int32),
        (mesh.polygons, 'loop_start', 1, np.int32),
        (mesh.polygons, 'loop_total', 1, np.int32),
    ):
        if prop == 'co' and not positions:
            continue
        values = np.empty(len(collection)*width, dtype)
        collection.foreach_get(prop, values)
        if np.issubdtype(values.dtype,np.floating):values[values==0]=0
        digest.update(values.tobytes())
    if mesh.uv_layers.active:
        values = np.empty(len(mesh.loops)*2, np.float32)
        mesh.uv_layers.active.data.foreach_get('uv', values)
        values[values==0]=0
        digest.update(values.tobytes())
    return digest.digest()


def _positions(mesh):
    values=np.empty(len(mesh.vertices)*3,np.float32)
    mesh.vertices.foreach_get('co',values)
    return values.reshape(-1,3)


def _positions_match(expected, actual):
    if expected.shape != actual.shape:
        return False
    tolerance=max(1e-12,float(np.ptp(expected,axis=0).max())*1e-6)
    return bool(np.allclose(expected,actual,rtol=0,atol=tolerance))


def evaluated_surface(ob, depsgraph):
    evaluated = ob.evaluated_get(depsgraph)
    pointer=ob.as_pointer()
    token=(ob.data.as_pointer(),evaluated.data.as_pointer(),len(ob.data.polygons),len(evaluated.data.polygons))
    cached = _cache.get(pointer)
    if (cached and cached[2]==token and pointer not in _dirty and
            geometry_updated in bpy.app.handlers.depsgraph_update_post):
        return evaluated,cached[1]
    signature = (_signature(ob.data), _signature(evaluated.data))
    if cached and cached[0] == signature:
        _cache[pointer]=(signature,cached[1],token);_dirty.discard(pointer)
        return evaluated, cached[1]
    if not any(mod.show_viewport for mod in ob.modifiers):
        mapping = np.arange(len(ob.data.polygons), dtype=np.int32)
    else:
        expected_topology=_signature(evaluated.data,positions=False)
        expected_positions=_positions(evaluated.data)
        # Propagate a FACE integer through the same modifiers on a disposable
        # copy. +1 reserves zero for generated geometry with no original face.
        clone = ob.copy()
        mesh = ob.data.copy()
        clone.data = mesh
        bpy.context.scene.collection.objects.link(clone)
        try:
            tag = mesh.attributes.get(_TAG)
            if tag is not None:
                mesh.attributes.remove(tag)
            tag = mesh.attributes.new(name=_TAG, type='INT', domain='FACE')
            tag.data.foreach_set('value', np.arange(1, len(mesh.polygons)+1, dtype=np.int32))
            clone.hide_set(True)
            clone.hide_render = True
            bpy.context.view_layer.update()
            temporary = clone.evaluated_get(bpy.context.evaluated_depsgraph_get())
            if (_signature(temporary.data,positions=False) != expected_topology or
                    not _positions_match(expected_positions,_positions(temporary.data))):
                raise ValueError('El modificador depende de la identidad del objeto; no se puede asociar sus caras de forma segura')
            propagated = temporary.data.attributes.get(_TAG)
            mapping = np.full(len(temporary.data.polygons), -1, np.int32)
            if propagated and propagated.domain == 'FACE' and propagated.data_type == 'INT':
                propagated.data.foreach_get('value', mapping)
                mapping -= 1
            if np.any(mapping >= len(ob.data.polygons)) or np.any(mapping < -1):
                raise ValueError('El modificador produjo identificadores de cara incompatibles')
        finally:
            bpy.data.objects.remove(clone, do_unlink=True)
            bpy.data.meshes.remove(mesh)
            bpy.context.view_layer.update()
        # Linking/unlinking a copy can refresh evaluated IDs. Return a fresh one.
        evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        if (_signature(evaluated.data,positions=False) != expected_topology or
                not _positions_match(expected_positions,_positions(evaluated.data))):
            raise ValueError('La superficie cambió durante la selección; vuelve a seleccionar')
        signature=(_signature(ob.data),_signature(evaluated.data))
    mapping.flags.writeable = False
    token=(ob.data.as_pointer(),evaluated.data.as_pointer(),len(ob.data.polygons),len(evaluated.data.polygons))
    _cache[pointer] = (signature, mapping,token)
    _sources[pointer]=(ob,ob.data);_dirty.discard(pointer)
    return evaluated, mapping


def edge_masks(mesh, mapping, selected):
    """Original face grid and selected-region outline on the visible surface."""
    totals = np.empty(len(mesh.polygons), np.int32)
    mesh.polygons.foreach_get('loop_total', totals)
    edges = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get('edge_index', edges)
    count = np.bincount(edges, minlength=len(mesh.edges))
    low = np.full(len(mesh.edges), np.iinfo(np.int32).max, np.int32)
    high = np.full(len(mesh.edges), -2, np.int32)
    source = np.repeat(mapping, totals)
    np.minimum.at(low, edges, source)
    np.maximum.at(high, edges, source)
    grid = ((low != high) | (count == 1)) & (count > 0)
    chosen = np.isin(mapping, list(selected)) & (mapping >= 0)
    chosen_count = np.bincount(edges, weights=np.repeat(chosen, totals), minlength=len(mesh.edges))
    outline = (chosen_count > 0) & ((chosen_count < count) | (count == 1))
    return grid, outline
