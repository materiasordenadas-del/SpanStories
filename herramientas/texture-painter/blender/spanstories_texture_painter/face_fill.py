"""Exact face fills, represented by ordinary glTF-compatible material groups.

Texture painting remains unchanged. Face fills never write neighboring texels;
UV islands keep their original material identity for selection and painting.
"""
import hashlib
import json
import bpy
import numpy as np
from . import core


def base_slot(ob, slot):
    return int(core.state(ob).get('exact_materials',{}).get(str(slot),{}).get('base_slot',slot))


def active_operations(s):
    result=[]
    for op in s.get('exact_fills',[]):
        layer=s['layers'][op['layer']]
        if layer['visible'] and layer['opacity']>0:
            result.append((op,op['color'][3]*layer['opacity']))
    return result


def rebuild(ob, force=False):
    s=core.state(ob)
    if not s.get('exact_base_slots'):return
    base=s['exact_base_slots']
    if len(base)!=len(ob.data.polygons):
        raise ValueError('La topología cambió después del relleno por caras; revisa los materiales antes de pintar')
    groups={}
    if not s.get('exact_suspended'):
        for op,alpha in active_operations(s):
            for f in op['faces']:
                groups.setdefault(f,[]).append([*op['color'][:3],alpha])
    records=s.setdefault('exact_materials',{})
    by_key={row['key']:int(slot) for slot,row in records.items()}
    assignments=np.asarray(base,np.int32).copy()
    stacks={}
    for f,ops in groups.items():
        key=hashlib.sha256(json.dumps([base[f],ops],sort_keys=True).encode()).hexdigest()
        stacks[key]=(base[f],ops)
    for key,(slot,ops) in stacks.items():
        index=by_key.get(key)
        if index is None:
            index=len(ob.material_slots);ob.data.materials.append(None)
        row=records.get(str(index))
        if force or row is None or not bpy.data.materials.get(row['material']):
            source=bpy.data.materials[s['slots'][str(slot)]['material']]
            mat=source.copy();mat.name=ob.name+' · Caras exactas · '+key[:8]
            mat.use_fake_user=False;mat['sstp_exact_owner']=ob.name
            shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            socket=shader.inputs['Base Color'];previous=socket.links[0].from_socket if socket.is_linked else None
            original=previous
            for color in ops:
                mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MIX'
                mix.inputs[0].default_value=color[3];mix.inputs[2].default_value=(*color[:3],1)
                if previous:mat.node_tree.links.new(previous,mix.inputs[1])
                else:mix.inputs[1].default_value=socket.default_value
                previous=mix.outputs[0]
            # Lip protector: a face fill must not cover the lips. The copied
            # Piel layer already carries the live lip edge (0 when disabled).
            edge=mat.node_tree.nodes.get('Piel Borde Labios')
            if edge is not None and original is not None:
                keep=mat.node_tree.nodes.new('ShaderNodeMixRGB');keep.blend_type='MIX'
                keep.name=keep.label='Relleno Protector Labios'
                mat.node_tree.links.new(edge.outputs[0],keep.inputs[0])
                mat.node_tree.links.new(previous,keep.inputs[1]);mat.node_tree.links.new(original,keep.inputs[2])
                previous=keep.outputs[0]
            mat.node_tree.links.new(previous,socket)
            # A copied Piel layer would draw the skin shader over the fill colour.
            from . import piel
            piel.cover_constant(mat.node_tree,1-float(np.prod([1-c[3] for c in ops])))
            old=ob.material_slots[index].material
            ob.material_slots[index].link='OBJECT';ob.material_slots[index].material=mat
            if old and old.users==0 and old.get('sstp_exact_owner')==ob.name:
                bpy.data.materials.remove(old)
            records[str(index)]={'key':key,'base_slot':slot,'ops':ops,'material':mat.name}
        by_key[key]=index
    for f,ops in groups.items():
        key=hashlib.sha256(json.dumps([base[f],ops],sort_keys=True).encode()).hexdigest()
        assignments[f]=by_key[key]
    ob.data.polygons.foreach_set('material_index',assignments)
    ob.data.update();core.store(ob,s)


def apply(color, object_name=None, erase=False, promote_last=False):
    ob=core.target(object_name);s=core.state(ob);ids=core.selected(ob)
    if ob.mode!='OBJECT':raise ValueError('Vuelve a Seleccionar antes del relleno exacto por caras')
    if ob.data.users!=1:raise ValueError('La malla está compartida con otro objeto; no se cambió ningún material')
    if not s.get('slots') or not ids:raise ValueError('Prepara las texturas y selecciona las caras')
    if len(color)!=4 or any(not np.isfinite(v) or v<0 or v>1 for v in color):raise ValueError('Color RGBA entre 0 y 1')
    faces=sorted(core.faces_of(core.geometry(ob),ids));before=json.loads(json.dumps(s.get('exact_fills',[])))
    if not s.get('exact_base_slots'):
        s['exact_base_slots']=[p.material_index for p in ob.data.polygons]
    promoted=False
    history=core._history.setdefault(ob.name,{'undo':[],'redo':[]})
    # Correct a preceding pixel fill only after proving that it is exactly the
    # same selected region and color. Never infer unrelated paint from color.
    if promote_last and not erase and history['undo']:
        entry=history['undo'][-1]
        items=entry if isinstance(entry,list) else [entry]
        expected=[]
        if items and all(isinstance(v,tuple) and len(v)==2 for v in items):
            for name,data in items:
                slot=next((k for k,n in s['layers'][s['active_layer']]['images'].items() if n==name),None)
                if slot is None:break
                mask=core.exclusive_mask(ob,ids,int(slot),s['resolution'])
                candidate=data.copy();candidate[mask]=color
                candidate=core.paint_padding(ob,slot,candidate)
                if not np.array_equal(candidate,core.pixels(bpy.data.images[name])):break
                expected.append((name,data))
            else:
                for name,data in expected:core.write_pixels(bpy.data.images[name],data)
                history['undo'].pop();promoted=True
    if erase:
        chosen=set(faces)
        for op in s.get('exact_fills',[]):
            if op['layer']==s['active_layer']:op['faces']=[f for f in op['faces'] if f not in chosen]
        s['exact_fills']=[op for op in s.get('exact_fills',[]) if op['faces']]
    else:
        s.setdefault('exact_fills',[]).append({'faces':faces,'color':list(color),'layer':s['active_layer']})
    core.store(ob,s);rebuild(ob)
    history['undo'].append({'exact_fills':before});history['redo'].clear()
    core.sync_images(ob);core.redraw()
    return {'pixels':0,'faces':len(faces),'exact_faces':True,'protected_shared_pixels':0,'promoted_previous_fill':promoted,'mesh_modified':False,'face_materials_modified':True}


def restore_history(ob, entry):
    s=core.state(ob);reverse={'exact_fills':s.get('exact_fills',[])}
    s['exact_fills']=entry['exact_fills'];core.store(ob,s);rebuild(ob)
    core.sync_images(ob);return reverse


def export_color(ob, slot):
    row=core.state(ob)['exact_materials'][str(slot)]
    data=core.export_color(ob,row['base_slot']);original=data[...,:3].copy()
    for color in row['ops']:
        data[...,:3]=data[...,:3]*(1-color[3])+np.asarray(color[:3],np.float32)*color[3]
    edge=lip_edge(ob,row['base_slot'],data.shape[1],data.shape[0])
    if edge is not None:
        data[...,:3]=data[...,:3]*(1-edge)+original*edge
    return data


def lip_edge(ob, slot, width, height):
    """Lip protector weight (0..1) for a slot, as the Piel shader computes it."""
    from . import piel
    mask=bpy.data.images.get(ob.name+' · Piel máscara')
    if mask is None or not piel._slot_ok(ob,slot) or not ob.sstp_piel.proteger_labios:return None
    n=piel.nodes(ob);edge=n.get('Piel Borde Labios') if n else None
    if edge is None:return None
    lo,hi=edge.inputs['From Min'].default_value,edge.inputs['From Max'].default_value
    g=core.resize_linear(core.pixels(mask),width,height)[...,1:2]
    return np.clip((g-lo)/max(hi-lo,1e-6),0,1)


def used_materials(ob):
    s=core.state(ob);used={p.material_index for p in ob.data.polygons}
    return {slot:row for slot,row in s.get('exact_materials',{}).items() if int(slot) in used}
