"""Real clicks in a windowed Blender.

blender --factory-startup --enable-event-simulate -P tests/run_piel_ui.py -- <informe.json>
"""
from pathlib import Path
import json
import sys
import traceback
import bpy

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as sstp
sstp.register()
from spanstories_texture_painter import ui

OUT=Path(sys.argv[-1]);report={'pasos':[]}
bpy.ops.mesh.primitive_uv_sphere_add(radius=.5,location=(0,0,.5));ob=bpy.context.object;ob.name='Prueba'
mat=bpy.data.materials.new('Base');mat.use_nodes=True;ob.data.materials.append(mat)
bpy.context.scene.sstp.target=ob
ob['sstp_piel_info']=json.dumps({'slot':0,'material':mat.name,'zonas':['cara'],'labios':'ninguno','color_detectado':None,'altura':1.0,'size':64},ensure_ascii=False)


def win():return bpy.context.window_manager.windows[0]


def view():return next(a for a in win().screen.areas if a.type=='VIEW_3D')


def click(x,y):
    w=win();w.event_simulate('MOUSEMOVE','NOTHING',x=x,y=y)
    w.event_simulate('LEFTMOUSE','PRESS',x=x,y=y);w.event_simulate('LEFTMOUSE','RELEASE',x=x,y=y)


def button(action):
    a=view();r=next(x for x in a.regions if x.type=='WINDOW')
    for (x,y,w,h),act in ui._buttons.get(a.as_pointer(),[]):
        if act==action:return r.x+int(x+w/2),r.y+int(y+h/2)
    raise RuntimeError('sin botón '+action)


def finish(error=None):
    report['error']=error;OUT.write_text(json.dumps(report,ensure_ascii=False,indent=1),encoding='utf-8')
    bpy.ops.wm.quit_blender()


def s1():
    with bpy.context.temp_override(window=win()):bpy.ops.sstp.workspace()


def s2():
    assert ui.active_workspace(),'sin espacio SSTP'
    assert ui._controller_running,'sin controlador'
    report['pasos'].append('espacio y controlador')


def s3():click(*button('PIEL'))


def s4():
    assert bpy.context.scene.sstp.panels_hidden,'el botón Piel no minimizó'
    assert win().screen.name.endswith('-nonnormal'),'sin vista maximizada'
    report['pasos'].append('botón Piel maximiza')


def s5():
    assert view().spaces.active.show_region_ui and ui.sidebar(view()).active_panel_category=='Piel','pestaña Piel no activa'
    # A click inside the sidebar must not reach the model selection tool.
    region=ui.sidebar(view());before=bpy.context.scene.sstp.tool
    # The panel header: a click there opens no popup that would swallow the next one.
    click(region.x+60,region.y+region.height-14)
    assert bpy.context.scene.sstp.tool==before and bpy.context.scene.sstp.panels_hidden
    report['pasos'].append('panel derecho recibe el clic')


def s6():click(*button('PANELS'))


def s7():
    assert not bpy.context.scene.sstp.panels_hidden,'la pestaña no restauró'
    assert not win().screen.name.endswith('-nonnormal'),'sigue maximizado'
    report['pasos'].append('pestaña vertical restaura')


def s8():
    area=next(a for a in win().screen.areas if a.type=='IMAGE_EDITOR')
    region=next(x for x in area.regions if x.type=='WINDOW')
    (x,y,w,h),_=next(b for b in ui._buttons[area.as_pointer()] if b[1]=='PIEL')
    click(region.x+int(x+w/2),region.y+int(y+h/2))


def s9():
    assert bpy.context.scene.sstp.panels_hidden,'Minimizar no minimizó'
    report['pasos'].append('botón Minimizar de un panel')
    finish()


steps=[s1,s2,s3,s4,s5,s6,s7,s8,s9]


def run():
    try:
        steps.pop(0)()
    except Exception:
        finish(traceback.format_exc());return None
    return 1.5 if steps else None


bpy.app.timers.register(run,first_interval=3.0)
