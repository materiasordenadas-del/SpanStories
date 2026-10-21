"""Independent golden values from actual Blender Cycles Noise Texture nodes.

A new scene renders sixteen constant emission patches, one per sample. It does
not load or save the city and never contacts a live Blender session.
"""
import bpy
import json
from pathlib import Path

ROOT = Path(__file__).parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
scene.cycles.use_denoising = False
scene.cycles.pixel_filter_type = 'BOX'
scene.cycles.filter_width = .01
scene.render.resolution_x = scene.render.resolution_y = 4
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'OPEN_EXR'
scene.render.image_settings.color_depth = '32'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = str(ROOT / 'reports/noise-golden.exr')
camera_data = bpy.data.cameras.new('GoldenCamera')
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 4
camera = bpy.data.objects.new('GoldenCamera', camera_data)
scene.collection.objects.link(camera)
camera.location = (0, 0, 5)
scene.camera = camera

points = [[0, 0, 0], [.25, .5, .75], [.17, .43, .89], [-.17, -.43, -.89]]
configs = [{'scale': scale, 'detail': 2, 'roughness': .5, 'lacunarity': 2, 'normalize': True} for scale in (2, 6, 5)]
configs.append({'scale': 6, 'detail': 2.5, 'roughness': .7, 'lacunarity': 1.8, 'normalize': False})
cases = []
for row, config in enumerate(configs):
    for column, point in enumerate(points):
        x, y = column - 1.5, row - 1.5
        mesh = bpy.data.meshes.new(f'GoldenCell_{row}_{column}')
        mesh.from_pydata([(x-.5, y-.5, 0), (x+.5, y-.5, 0), (x+.5, y+.5, 0), (x-.5, y+.5, 0)], [], [(0, 1, 2, 3)])
        obj = bpy.data.objects.new(mesh.name, mesh)
        scene.collection.objects.link(obj)
        material = bpy.data.materials.new(f'GoldenNoise_{row}_{column}')
        material.use_nodes = True
        nodes = material.node_tree.nodes
        nodes.clear()
        noise = nodes.new('ShaderNodeTexNoise')
        noise.noise_dimensions = '3D'
        noise.noise_type = 'FBM'
        noise.normalize = config['normalize']
        for source, target in [('scale','Scale'),('detail','Detail'),('roughness','Roughness'),('lacunarity','Lacunarity')]:
            noise.inputs[target].default_value = config[source]
        combine = nodes.new('ShaderNodeCombineXYZ')
        for i, value in enumerate(point):
            combine.inputs[i].default_value = value
        emission = nodes.new('ShaderNodeEmission')
        output = nodes.new('ShaderNodeOutputMaterial')
        material.node_tree.links.new(combine.outputs[0], noise.inputs['Vector'])
        material.node_tree.links.new(noise.outputs['Fac'], emission.inputs['Color'])
        material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
        mesh.materials.append(material)
        cases.append({'coordinate': point, 'parameters': config.copy()})

bpy.ops.render.render(write_still=True)
# Background Render Result exposes no .pixels in current Blender; EXR keeps
# scene-linear float samples, then a normal image datablock exposes them.
pixels = list(bpy.data.images.load(scene.render.filepath, check_existing=False).pixels)
assert len(pixels) == 4 * 4 * 4, len(pixels)
for index, case in enumerate(cases):
    case['factor'] = pixels[index * 4]
    assert pixels[index * 4 + 3] > .999
result = {'reference': 'Blender 5.2 Cycles CPU actual Noise Texture node → emission; float scene-linear render pixels',
          'dimensions': '3D', 'type': 'FBM', 'distortion': 0, 'samples': cases,
          'sourceSceneLoaded': False, 'liveBlenderContacted': False}
path = ROOT / 'reports/noise-golden.json'
path.write_text(json.dumps(result, indent=2), encoding='utf-8')
print('NOISE_GOLDEN ' + json.dumps(result), flush=True)
