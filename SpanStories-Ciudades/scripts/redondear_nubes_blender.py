"""Blender background: retain the exact painted RGB; round only the lower silhouette.

Run with --background --factory-startup --python this_file. No source blend is saved.
"""
from pathlib import Path
import bpy
import math
import struct
import zlib
import json
import hashlib
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'engine/Estilos/StudioGhibli/assets'
REPORT = ROOT / 'reports/nubes-redondeadas'
REPORT.mkdir(parents=True, exist_ok=True)
SOURCE = ASSETS / 'nubes.png'
OUTPUT = ASSETS / 'nubes-redondeadas.png'


def read_rgba(path):
    data = path.read_bytes()
    pos, compressed = 8, bytearray()
    while pos < len(data):
        size = struct.unpack('>I', data[pos:pos+4])[0]
        tag, block = data[pos+4:pos+8], data[pos+8:pos+8+size]
        if tag == b'IHDR':
            width, height, bits, color, _, _, interlace = struct.unpack('>IIBBBBB', block)
            assert (bits, color, interlace) == (8, 6, 0)
        if tag == b'IDAT':
            compressed.extend(block)
        pos += size + 12
    raw = zlib.decompress(compressed)
    stride = width * 4
    image = np.zeros((height, stride), dtype=np.uint8)
    for y in range(height):
        mode = raw[y*(stride+1)]
        row = raw[y*(stride+1)+1:(y+1)*(stride+1)]
        for x, value in enumerate(row):
            a = int(image[y, x-4]) if x >= 4 else 0
            b = int(image[y-1, x]) if y else 0
            c = int(image[y-1, x-4]) if y and x >= 4 else 0
            p = a+b-c
            distances = (abs(p-a), abs(p-b), abs(p-c))
            paeth = (a, b, c)[distances.index(min(distances))]
            predictor = (0, a, b, (a+b)//2, paeth)[mode]
            image[y, x] = (value+predictor) & 255
    return image.reshape(height, width, 4)


def write_rgba(path, pixels):
    height, width, _ = pixels.shape
    def chunk(tag, data):
        return struct.pack('>I', len(data))+tag+data+struct.pack('>I', zlib.crc32(tag+data))
    rows = []
    previous = np.zeros(width*4, dtype=np.uint8)
    for row in pixels.reshape(height, width*4):
        left = np.concatenate((np.zeros(4, dtype=np.uint8), row[:-4]))
        candidates = [row, row-left, row-previous]
        mode = min(range(3), key=lambda i: np.abs(candidates[i].view(np.int8).astype(np.int16)).sum())
        rows.append(bytes([mode])+candidates[mode].tobytes())
        previous = row
    raw = b''.join(rows)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))+chunk(b'sRGB', b'\0')+chunk(b'IDAT', zlib.compress(raw, 9))+chunk(b'IEND', b''))


original = read_rgba(SOURCE)
h, w, _ = original.shape
# Elliptic lobes meet the existing painted base inside its current bounds.
lobes = [(.11,.68,.105,.17), (.23,.73,.15,.20), (.41,.74,.18,.24),
         (.59,.77,.16,.21), (.74,.77,.13,.17), (.88,.89,.095,.105)]
def lower_edge(x):
    return max([.61]+[cy+ry*math.sqrt(max(0, 1-((x-cx)/rx)**2))
                     for cx,cy,rx,ry in lobes if abs(x-cx) <= rx])

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
boundary = [(0,h,0), (w,h,0)] + [(x, h*(1-lower_edge(x/w)), 0) for x in range(w,-1,-1)]
mesh = bpy.data.meshes.new('Nube_contorno_inferior_redondeado')
mesh.from_pydata(boundary, [], [list(range(len(boundary)))])
mesh.update()
cloud = bpy.data.objects.new('Nube_original_base_redondeada', mesh)
scene.collection.objects.link(cloud)
cloud['id'] = 'cielo-nube-original-base-redondeada'
cloud['edicion'] = 'Solo contorno inferior; pintura RGB y UV originales intactas'
uv = mesh.uv_layers.new(name='Pintura_original')
for loop in mesh.loops:
    v = mesh.vertices[loop.vertex_index].co
    uv.data[loop.index].uv = (v.x/w, v.y/h)

material = bpy.data.materials.new('Mascara_blanca_temporal')
material.use_nodes = True
nodes = material.node_tree.nodes
nodes.clear()
emit = nodes.new('ShaderNodeEmission')
out = nodes.new('ShaderNodeOutputMaterial')
material.node_tree.links.new(emit.outputs[0], out.inputs['Surface'])
mesh.materials.append(material)
camera_data = bpy.data.cameras.new('Camara_ortografica_textura')
camera = bpy.data.objects.new('Camara_ortografica_textura', camera_data)
scene.collection.objects.link(camera)
camera.location = (w/2, h/2, 1000)
camera_data.type = 'ORTHO'
camera_data.ortho_scale = w
camera_data.clip_end = 2000
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 8
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.render.resolution_x = w
scene.render.resolution_y = h
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = str(REPORT / 'mascara-blender.png')
bpy.ops.render.render(write_still=True)
mask_image = bpy.data.images.load(scene.render.filepath, check_existing=False)
mask = np.array(mask_image.pixels[:], dtype=np.float32).reshape(h,w,4)[::-1,:,3]
corrected = original.copy()
corrected[:,:,3] = np.minimum(original[:,:,3], np.rint(mask*255).astype(np.uint8))
write_rgba(OUTPUT, corrected)

# Editable Blender source: the real silhouette mesh and the unchanged packed painting.
paint = bpy.data.images.load(str(SOURCE), check_existing=False)
paint.pack()
material.name = 'Pintura_original_sin_cambios'
tex = nodes.new('ShaderNodeTexImage')
tex.image = paint
transparent = nodes.new('ShaderNodeBsdfTransparent')
mix = nodes.new('ShaderNodeMixShader')
links = material.node_tree.links
links.new(tex.outputs['Color'], emit.inputs['Color'])
links.new(tex.outputs['Alpha'], mix.inputs[0])
links.new(transparent.outputs[0], mix.inputs[1])
links.new(emit.outputs[0], mix.inputs[2])
links.new(mix.outputs[0], out.inputs['Surface'])
scene.view_settings.view_transform = 'Standard'
bpy.context.view_layer.objects.active = cloud
cloud.select_set(True)
scene['fuente'] = str(SOURCE)
scene['tamano'] = '768 x 538; mismos anchos angulares en Three.js'
bpy.ops.wm.save_as_mainfile(filepath=str(REPORT / 'NUBE_BASE_REDONDEADA.blend'))
assert np.array_equal(original[:,:,:3], corrected[:,:,:3])
assert np.array_equal(original[:int(h*.61)], corrected[:int(h*.61)])
assert np.all(corrected[:,:,3] <= original[:,:,3])
assert not np.any(corrected[-1,:,3])
proof = {'rgb_identico': True, 'parte_superior_rgba_identica': True,
         'filas_superiores_intactas': int(h*.61), 'dimensiones': [w,h],
         'pixeles_con_alfa_modificado': int(np.count_nonzero(original[:,:,3] != corrected[:,:,3])),
         'original_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
         'salida_sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
         'blender': bpy.app.version_string}
(REPORT/'verificacion-textura.json').write_text(json.dumps(proof, indent=2), encoding='utf-8')
print('CLOUD_PROOF', json.dumps(proof))
