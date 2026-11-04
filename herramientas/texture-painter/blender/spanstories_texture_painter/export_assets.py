"""Explicit attachments and temporary glTF-compatible procedural color baking."""
from contextlib import contextmanager
import json
import bpy


def attachments(ob):
    names=list(ob.get('sstp_export_objects',[]))
    raw=ob.get('rlb_regiones_uv')
    if raw:
        data=json.loads(raw) if isinstance(raw,str) else raw
        names.extend(data.get('eyes_external',[]))
    result=set()
    for name in names:
        item=bpy.data.objects.get(name)
        if item is None:raise ValueError('Falta un objeto asociado al personaje: '+name)
        result.add(item);result.update(item.children_recursive)
        while item.parent:
            item=item.parent;result.add(item)
    return result


def needs_bake(ob):
    if ob.type!='MESH':return False
    for slot in ob.material_slots:
        mat=slot.material
        if not mat or not mat.use_nodes:continue
        shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if shader and shader.inputs['Base Color'].is_linked:
            node=shader.inputs['Base Color'].links[0].from_node
            if node.type not in ('TEX_IMAGE','VERTEX_COLOR'):return True
    return False


@contextmanager
def prepared(objects):
    """Bake color to a disposable mesh's corner attributes; never unwrap sources."""
    clones=[];meshes=[];materials=[];scene=bpy.context.scene
    engine=scene.render.engine;samples=scene.cycles.samples
    try:
        ready=set(objects)
        for source in sorted(objects,key=lambda o:o.name):
            if not needs_bake(source):continue
            clone=source.copy();clone.data=source.data.copy();meshes.append(clone.data)
            clone.name=source.name+' · Web';bpy.context.collection.objects.link(clone);clones.append(clone)
            color=clone.data.color_attributes.new(name='SSTP Web BaseColor',type='FLOAT_COLOR',domain='CORNER')
            clone.data.color_attributes.active_color=color
            shaders=[]
            for slot in clone.material_slots:
                if not slot.material:continue
                mat=slot.material.copy();materials.append(mat);slot.link='OBJECT';slot.material=mat
                nt=mat.node_tree;shader=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None)
                output=next((n for n in nt.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output),None)
                if not shader or not output:raise ValueError('Material asociado sin Principled exportable: '+mat.name)
                if shader.inputs['Alpha'].is_linked:raise ValueError('Alpha procedural asociado requiere una textura UV compatible: '+mat.name)
                socket=shader.inputs['Base Color'];emission=nt.nodes.new('ShaderNodeEmission')
                if socket.is_linked:nt.links.new(socket.links[0].from_socket,emission.inputs['Color'])
                else:emission.inputs['Color'].default_value=socket.default_value
                nt.links.new(emission.outputs[0],output.inputs['Surface'])
                shaders.append((nt,shader,output,emission))
            for item in list(bpy.context.selected_objects):item.select_set(False)
            clone.hide_set(False);clone.hide_render=False;clone.select_set(True);bpy.context.view_layer.objects.active=clone
            scene.render.engine='CYCLES';scene.cycles.samples=1
            outcome=bpy.ops.object.bake(type='EMIT',target='VERTEX_COLORS',use_selected_to_active=False,use_clear=True)
            if 'FINISHED' not in outcome:raise RuntimeError('No se pudo convertir el color procedural: '+source.name)
            for nt,shader,output,emission in shaders:
                nt.nodes.remove(emission);nt.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
                node=nt.nodes.new('ShaderNodeVertexColor');node.layer_name=color.name
                nt.links.new(node.outputs['Color'],shader.inputs['Base Color'])
            ready.remove(source);ready.add(clone)
        yield ready
    finally:
        scene.render.engine=engine;scene.cycles.samples=samples
        for clone in clones:bpy.data.objects.remove(clone,do_unlink=True)
        for mesh in meshes:bpy.data.meshes.remove(mesh)
        for mat in materials:bpy.data.materials.remove(mat)
