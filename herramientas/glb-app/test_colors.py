"""Regresión: no oscurecer al aplanar una textura y respetar su factor glTF."""
import sys, tempfile
from pathlib import Path
import bpy
sys.path.insert(0, str(Path(__file__).resolve().parent))
from processor import color_of

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_plane_add()
obj = bpy.context.object
mat = bpy.data.materials.new('Textura_de_prueba')
mat.use_nodes = True
obj.data.materials.append(mat)
shader = mat.node_tree.nodes.get('Principled BSDF')
# Este .8 no se usa en Blender cuando el socket está conectado.
shader.inputs['Base Color'].default_value = (.8,.8,.8,1)
texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
mat.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
with tempfile.TemporaryDirectory(prefix='spanstories-color-') as directory:
    for index, expected in enumerate(((.18,.07,.02), (0.,0.,0.), (.002,.003,.004), (.7,.4,.1))):
        generated = bpy.data.images.new('Color_constante', 16, 16, float_buffer=True)
        generated.pixels[:] = [*expected,1.] * (16*16)
        generated.filepath_raw = str(Path(directory)/f'color-{index}.exr')
        generated.file_format = 'OPEN_EXR'
        generated.save()
        texture.image = bpy.data.images.load(generated.filepath_raw, check_existing=False)
        # Comparar contra el albedo realmente cargado, como en un GLB.
        reference = list(texture.image.pixels[:3])
        actual, _ = color_of(mat,obj,0)
        assert all(abs(a-b)<1e-5 for a,b in zip(actual,reference)), (actual,reference)
        tinted, _ = color_of(mat,obj,0,(.5,.7,.9))
        assert all(abs(tinted[i]-reference[i]*(.5,.7,.9)[i])<1e-5 for i in range(3)), tinted
print('COLOR_TEST_OK: albedo constante exacto, negro y colores oscuros preservados, factor glTF correcto.',flush=True)
