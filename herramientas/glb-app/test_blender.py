"""Prueba real de jerarquía, colores por cara y unidades en un GLB genérico."""
import json, tempfile, sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
from processor import bounds, convert

with tempfile.TemporaryDirectory(prefix='spanstories-test-') as temporary:
    folder = Path(temporary)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parent = bpy.data.objects.new('Padre_transformado', None)
    bpy.context.collection.objects.link(parent)
    parent.location = (4, -2, 3)
    parent.rotation_euler.z = .35
    bpy.ops.mesh.primitive_cube_add(size=1)
    cube = bpy.context.object
    cube.name = 'Objeto_multicolor'
    cube.parent = parent
    cube.location = (1, .2, .5)
    cube.scale = (2, 1, 3)
    for name, color in [('Rojo', (.6,.02,.01,1)), ('Azul', (.01,.02,.7,1))]:
        material = bpy.data.materials.new(name)
        material.diffuse_color = color
        material.use_nodes = True
        material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = color
        cube.data.materials.append(material)
    for face in cube.data.polygons:
        face.material_index = face.index % 2
    bpy.context.view_layer.update()
    initial_lo, initial_hi = bounds([cube])
    expected_size = initial_hi - initial_lo
    bpy.ops.export_scene.gltf(filepath=str(folder/'entrada.glb'), export_format='GLB')
    convert(folder/'entrada.glb', folder/'salida.glb', {'ratio':1,'units':'m','remove_floor':False})
    report = json.loads((folder/'salida.json').read_text(encoding='utf-8'))
    assert all(abs(a-b)<.0002 for a,b in zip(report['dimensions'],expected_size)), report['dimensions']
    assert report['materials'] == 2 and report['output_triangles'] == 12
    assert abs(report['base_z']) < 1e-5
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(folder/'salida.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    lo, hi = bounds(meshes)
    assert abs(lo.z) < 1e-5 and abs(lo.x+hi.x)<1e-5 and abs(lo.y+hi.y)<1e-5
    root = next(o for o in bpy.context.scene.objects if o.get('id') == 'articulo-001')
    assert all(o.parent == root for o in meshes)
    assert len({p.material_index for o in meshes for p in o.data.polygons}) == 2
    assert all(abs(o.scale.x-1)<1e-5 for o in meshes)
    print('GENERIC_GLB_TEST_OK: ejes, jerarquía transformada, materiales por cara, escala y pivot.', flush=True)
