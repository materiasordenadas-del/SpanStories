"""Build assets/piel_nodos.blend from the user's Ultimate Skin .blend.

blender -b UltimateSkin_4-1_by_Kuhantilope.blend --factory-startup -P tests/build_piel_asset.py
Only node groups are kept. UV/Generated coordinates become a `Vector` input: Tripo
atlases are fragmented, so UV-driven noise would break at every island.
"""
from pathlib import Path
import bpy

OUT=Path(__file__).resolve().parents[1]/'blender/spanstories_texture_painter/assets/piel_nodos.blend'
main=bpy.data.node_groups['UltimateSkin_4-1_by_Kuhantilope']
main.name='SSTP_Piel'


def vector_input(group):
    group.interface.new_socket('Vector',in_out='INPUT',socket_type='NodeSocketVector')
    node=group.nodes.new('NodeGroupInput')
    for coord in [n for n in group.nodes if n.bl_idname=='ShaderNodeTexCoord']:
        for output in coord.outputs:
            for link in list(output.links):group.links.new(node.outputs['Vector'],link.to_socket)
        group.nodes.remove(coord)


subgroups=[n for n in main.nodes if n.bl_idname=='ShaderNodeGroup']
for group in {n.node_tree for n in subgroups}|{main}:vector_input(group)
source=main.nodes.new('NodeGroupInput')
for node in subgroups:main.links.new(source.outputs['Vector'],node.inputs['Vector'])

# Texture light/shadow survives as a multiply, so nose, eyelid and neck shading stay.
for name,kind,default in (('Luz Textura','NodeSocketFloat',.5),('Luz Fuerza','NodeSocketFloat',0.),('Venas Fuerza','NodeSocketFloat',1.)):
    socket=main.interface.new_socket(name,in_out='INPUT',socket_type=kind);socket.default_value=default
inputs=main.nodes.new('NodeGroupInput')
double=main.nodes.new('ShaderNodeMath');double.operation='MULTIPLY';double.inputs[1].default_value=2
main.links.new(inputs.outputs['Luz Textura'],double.inputs[0])
shade=main.nodes.new('ShaderNodeMix');shade.data_type='RGBA';shade.blend_type='MULTIPLY';shade.name='Luz'
main.links.new(inputs.outputs['Luz Fuerza'],shade.inputs['Factor'])
main.links.new(main.nodes['Mix.005'].outputs['Result'],shade.inputs['A'])
main.links.new(double.outputs[0],shade.inputs['B'])
color=next(s for s in shade.outputs if s.name=='Result' and s.type=='RGBA')
shader=main.nodes['Principled BSDF']
main.links.new(color,shader.inputs['Base Color'])
main.links.new(color,main.nodes['Mix.004'].inputs['A'])
main.interface.new_socket('Base Color',in_out='OUTPUT',socket_type='NodeSocketColor')
main.links.new(color,main.nodes['Group Output'].inputs['Base Color'])

# The source has no veins amount; its only control is an internal constant.
value=main.nodes['Value.010']
scale=main.nodes.new('ShaderNodeMath');scale.operation='MULTIPLY'
for link in list(value.outputs[0].links):main.links.new(scale.outputs[0],link.to_socket)
main.links.new(value.outputs[0],scale.inputs[0]);main.links.new(inputs.outputs['Venas Fuerza'],scale.inputs[1])
main.use_fake_user=True
OUT.parent.mkdir(exist_ok=True)
bpy.data.libraries.write(str(OUT),{main},fake_user=True,compress=True)
print('OK',OUT,OUT.stat().st_size)
