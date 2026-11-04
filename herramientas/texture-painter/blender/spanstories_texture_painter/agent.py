"""Small-model facade. Resolve names and preflight before touching any pixels."""
import re
from pathlib import Path

import bpy
import numpy as np

from . import core
from .policy import VERSION, SELF_IMPROVEMENT


def blocked(status, message, **details):
    return {'ok':False,'status':status,'message':message,**details,'saved_blend':False}


def colors():
    return [{'name':p.name,'index':i} for i,p in enumerate(bpy.context.scene.sstp.palette)]


def start(object_name=None, reference_path=None):
    """Read a compact task context; importing a supplied reference is explicit."""
    ob=core.target(object_name)
    if reference_path:
        previous=bpy.context.scene.sstp.reference
        core.import_reference(reference_path)
        if bpy.context.scene.sstp.reference!=previous or not bpy.context.scene.sstp.palette:
            core.extract_palette(8)
    s=core.state(ob);groups=list(s.get('groups',{}))
    return {
        'ok':True,'object':ob.name,'regions':groups,'colors':colors(),
        'addon_version':VERSION,'self_improvement':SELF_IMPROVEMENT,
        'prepared':bool(s.get('slots')),
        'ready_to_paint':bool(groups),
        'next':'paint_named_region' if groups else 'needs_region_mapping',
        'message':'Usa nombres de regions y colors. No necesitas caras, UV ni nodos.' if groups else 'Falta nombrar las regiones una vez en el add-on. No adivines qué isla es una prenda.',
        'selection':core.selection_status(ob.name),'saved_blend':False,
    }


def paint(region, object_name=None, color_name=None, palette_index=None, hex_color=None, layer_name=None, allow_overlap=False):
    ob=core.target(object_name);s=core.state(ob);groups=s.get('groups',{})
    match=[name for name in groups if name.strip().casefold()==region.strip().casefold()]
    if len(match)!=1:
        return blocked('needs_region_mapping','La región no existe o su nombre es ambiguo. No se pintó nada.',regions=list(groups))
    name=match[0];ids=groups[name]
    g=core.geometry(ob,True)
    if not ids or not core.valid_ids(g,ids):
        return blocked('needs_region_mapping','El grupo está vacío o sus UV cambiaron. Hay que revisar el mapeo.')
    choices=sum(v is not None for v in (color_name,palette_index,hex_color))
    if choices!=1:
        return blocked('needs_color_choice','Indica solo color_name, palette_index o hex_color.',colors=colors())
    palette=bpy.context.scene.sstp.palette
    if hex_color is not None:
        if not isinstance(hex_color,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',hex_color):
            return blocked('needs_color_choice','El color explícito debe tener el formato #RRGGBB.')
        rgb=np.array([int(hex_color[i:i+2],16)/255 for i in (1,3,5)])
        color=core.to_linear(rgb).tolist()+[1.0];label=hex_color.upper()
    elif palette_index is not None:
        if isinstance(palette_index,bool) or not isinstance(palette_index,int) or not 0<=palette_index<len(palette):
            return blocked('needs_color_choice','Ese índice de color no existe.',colors=colors())
        color=list(palette[palette_index].color);label=palette[palette_index].name
    else:
        matches=[p for p in palette if p.name.strip().casefold()==color_name.strip().casefold()]
        if len(matches)!=1:
            return blocked('needs_color_choice','Ese nombre de color no existe o es ambiguo.',colors=colors())
        color=list(matches[0].color);label=matches[0].name
    report=core.overlap_report(ob.name,ids)
    if report['overlaps'] and not allow_overlap:
        return blocked('needs_overlap_approval','Otras superficies comparten estas UV. Pide autorización antes de continuar.',overlapping_regions=report['overlaps'])
    # Everything above is preflight: a missing name/color/approval does not prepare
    # materials, add layers or change the current selection.
    before=core.fingerprint(ob)
    core.prepare(ob.name,int(bpy.context.scene.sstp.resolution))
    s=core.state(ob)
    if layer_name:
        index=next((i for i,l in enumerate(s['layers']) if l['name']==layer_name),None)
        if index is None:core.add_layer(layer_name,ob.name)
        else:core.set_layer(index,ob.name)
    core.select_regions(ids,ob.name)
    result=core.fill(color,ob.name,allow_overlap=allow_overlap)
    core.sync_images(ob)
    after=core.fingerprint(ob)
    unchanged=all(before[k]==after[k] for k in ('vertices','edges','loops','faces','uv','shape_keys','modifiers','animation','shape_drivers'))
    if not unchanged:
        raise RuntimeError('La comprobación de conservación falló. Detén el trabajo y solicita revisión.')
    s=core.state(ob)
    return {'ok':True,'object':ob.name,'painted_region':name,'color':label,'layer':s['layers'][s['active_layer']]['name'],'pixels':result['pixels'],'mesh_unchanged':True,'selection':core.selection_status(ob.name),'saved_blend':False}


def export(directory, object_name=None, include_glb=True):
    ob=core.target(object_name);s=core.state(ob)
    from . import piel
    if not s.get('slots') and piel.active(ob):
        core.prepare(ob.name,int(bpy.context.scene.sstp.resolution));s=core.state(ob)
    if not s.get('slots'):
        return blocked('needs_painting','Primero pinta una región o prepara las texturas.')
    if include_glb and ob.mode!='OBJECT':
        return blocked('finish_brush','Vuelve a Seleccionar en el add-on antes de exportar GLB.')
    path=Path(directory).resolve();glb_path=path/(bpy.path.clean_name(ob.name)+'.glb')
    prefix=bpy.path.clean_name(ob.name)
    outputs=[path/(prefix+'_BaseColor_'+slot+'.png') for slot in s['slots']]+[path/(prefix+'_textures.json')]
    if include_glb:outputs.append(glb_path)
    if any(p.exists() for p in outputs):
        return blocked('destination_exists','La exportación ya existe. Elige una carpeta nueva; no se sobrescribió nada.')
    png=core.export_png(str(path),ob.name)
    glb=core.export_glb(str(glb_path),ob.name) if include_glb else None
    return {'ok':True,'png':[t['file'] for t in png['textures']],'manifest':png['manifest'],'glb':glb['file'] if glb else None,'ready_file':glb['file'] if glb else None,'threejs_ready':bool(glb),'web_optimization':glb['web_optimization'] if glb else None,'saved_blend':False}
