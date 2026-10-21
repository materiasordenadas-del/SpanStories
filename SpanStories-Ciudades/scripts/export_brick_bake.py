"""Optional neutral source-brick tiles, never baked light or original mutation.

Not selected automatically by viewer: finite tiles repeat original random tint
after 64x64 bricks, so exact procedural parameters remain authoritative.
"""
import bpy
import hashlib
import json
import os
import time

PROJECT = r'D:\Español\SpanStories-Ciudades'
ZONE = os.path.join(PROJECT, 'Mundo', 'Paises', 'Espana', 'Ciudades', 'Barcelona', 'Zonas', 'PasseigGracia')
OUTPUT = os.path.join(ZONE, 'assets', 'surface-source')
os.makedirs(OUTPUT, exist_ok=True)
source_hash = hashlib.sha256(open(bpy.data.filepath, 'rb').read()).hexdigest()
scene = bpy.data.scenes.new('SS_neutral_surface_bake')
bpy.context.window.scene = scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 8
scene.render.bake.margin = 2
scene.render.bake.normal_space = 'TANGENT'
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds.new('SS_bake_unlit')
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 0
reports = []
for source_name in ('H06_ladrillo', 'H09_ladrillo'):
    started = time.time()
    original = bpy.data.materials[source_name]
    material = original.copy()
    material.name = source_name + '__DERIVADO_BAKE'
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    brick = next(node for node in nodes if node.type == 'TEX_BRICK')
    output = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL')
    shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    width = brick.inputs['Brick Width'].default_value * 64
    height = brick.inputs['Row Height'].default_value * 64
    mesh = bpy.data.meshes.new(source_name + '__BAKE_PLANE')
    mesh.from_pydata([(0,0,0),(width,0,0),(width,height,0),(0,height,0)], [], [(0,1,2,3)])
    obj = bpy.data.objects.new(source_name + '__BAKE_PLANE', mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    uv_target = mesh.uv_layers.new(name='SS_bake_target')
    uv_metric = mesh.uv_layers.new(name='SS_source_metric')
    for index, coord in enumerate(((0,0),(1,0),(1,1),(0,1))):
        uv_target.data[index].uv = coord
        uv_metric.data[index].uv = (coord[0] * width, coord[1] * height)
    mesh.uv_layers.active_index = 0
    uv_target.active_render = True
    source_uv = nodes.new('ShaderNodeUVMap')
    source_uv.uv_map = 'SS_source_metric'
    links.new(source_uv.outputs['UV'], brick.inputs['Vector'])
    target_node = nodes.new('ShaderNodeTexImage')
    emission = nodes.new('ShaderNodeEmission')
    links.new(brick.outputs['Color'], emission.inputs['Color'])
    for other in scene.objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    images = {}
    for role in ('albedo', 'normal'):
        image = bpy.data.images.new(source_name + '__' + role, width=2048, height=1024, alpha=False, float_buffer=False)
        image.colorspace_settings.name = 'sRGB' if role == 'albedo' else 'Non-Color'
        target_node.image = image
        for node in nodes:
            node.select = False
        target_node.select = True
        nodes.active = target_node
        links.new(emission.outputs['Emission'] if role == 'albedo' else shader.outputs['BSDF'], output.inputs['Surface'])
        bpy.ops.object.bake(type='EMIT' if role == 'albedo' else 'NORMAL')
        filepath = os.path.join(OUTPUT, source_name + '__' + role + '.png')
        image.filepath_raw = filepath
        image.file_format = 'PNG'
        image.save()
        encoded = open(filepath, 'rb').read()
        images[role] = {'url': os.path.relpath(filepath, ZONE).replace('\\', '/'), 'bytes':len(encoded), 'sha256':hashlib.sha256(encoded).hexdigest(), 'colorSpace':image.colorspace_settings.name, 'width':2048,'height':1024}
    reports.append({'sourceName':source_name, 'sourceMethod':'Cycles EMIT raw Brick.Color + tangent NORMAL raw source Bump, 8 samples, no lighting', 'sourceUVTileSize':[width,height], 'glTFUVScale':[1/width,1/height], 'glTFUVOffset':[0,1-1/height], 'images':images, 'durationSeconds':time.time()-started, 'limitation':'Brick tint hashing repeats after 64 columns/64 rows if tile is repeated; use exact procedural shader when that distinction is visible.', 'selectedByViewer':False})
    print('BRICK_BAKE_DONE ' + json.dumps(reports[-1], ensure_ascii=False), flush=True)
    scene.collection.objects.unlink(obj)
with open(os.path.join(PROJECT, 'reports', 'export-brick-bake.json'), 'w', encoding='utf8') as stream:
    json.dump({'sourceSHA256':source_hash, 'materials':reports, 'sourceSaved':False}, stream, ensure_ascii=False, indent=2)
