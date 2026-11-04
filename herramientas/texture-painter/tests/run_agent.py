"""End-to-end simple-agent recipes in an isolated Blender fixture, never Lamine."""
import sys,json,datetime
from pathlib import Path
import bpy
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core,agent

bpy.ops.wm.open_mainfile(filepath=str(ROOT/'evidence'/'synthetic'/'fixture.blend'))
ob=bpy.data.objects['Test character'];bpy.context.scene.sstp.target=ob
palette=bpy.context.scene.sstp.palette;palette.clear()
red=palette.add();red.name='ROJO';red.color=(.409127,.008681,.013979,1)
green=palette.add();green.name='VERDE';green.color=(.02,.7,.04,1)
baseline=core.fingerprint(ob);checks=[]
def check(name,test):
    assert test,name
    checks.append(name)

start=core.dispatch('agent_start',object_name=ob.name)
check('compact named context',start['regions']==['SLEEVE'] and start['colors'][0]=={'name':'ROJO','index':0})
check('no UV analysis required',not any(key in start for key in ('faces','islands','uv','materials')))
check('start preserves pixels and mesh',core.fingerprint(ob)==baseline)
s=core.state(ob)
result=core.dispatch('agent_paint',object_name=ob.name,region='UNKNOWN',color_name='ROJO',layer_name='AUTO')
check('unknown region stops before changes',result['status']=='needs_region_mapping' and core.state(ob)==s)
result=agent.paint('SLEEVE',ob.name,color_name='UNKNOWN',layer_name='AUTO')
check('unknown color stops before changes',result['status']=='needs_color_choice' and core.state(ob)==s)
result=agent.paint('SLEEVE',ob.name,color_name='ROJO',hex_color='#CC0000')
check('ambiguous color stops before changes',result['status']=='needs_color_choice' and core.state(ob)==s)
result=agent.paint('SLEEVE',ob.name,hex_color='red')
check('invalid hex stops before changes',result['status']=='needs_color_choice' and core.state(ob)==s)
g=core.geometry(ob);shared=g['by_face'][0]
core.select_regions([shared],ob.name);core.save_group('SHARED',ob.name);s=core.state(ob)
result=agent.paint('SHARED',ob.name,color_name='ROJO',layer_name='AUTO')
check('shared UV requires approval without creating layer',result['status']=='needs_overlap_approval' and core.state(ob)==s)
result=core.dispatch('agent_paint',object_name=ob.name,region='sleeve',color_name='rojo',layer_name='AUTO')
check('paint with simple case-insensitive names',result['ok'] and result['painted_region']=='SLEEVE' and result['color']=='ROJO')
check('named layer created automatically',result['layer']=='AUTO')
check('red pixels correct',np.allclose(core.composite(ob,0)[700,700],red.color))
layer_count=len(core.state(ob)['layers'])
result=agent.paint('SLEEVE',ob.name,palette_index=1,layer_name='AUTO')
check('reuse layer instead of duplicating',len(core.state(ob)['layers'])==layer_count)
check('palette index paints expected color',result['ok'] and np.allclose(core.composite(ob,0)[700,700],green.color))
result=agent.paint('SLEEVE',ob.name,hex_color='#CC3311')
expected=core.to_linear(np.array([204,51,17])/255)
check('hex conversion handled by add-on',np.allclose(core.composite(ob,0)[700,700][:3],expected))
check('named recipes preserve mesh UV shape keys',core.fingerprint(ob)==baseline)

# An unprepared mesh with an already named region requires only one paint call.
mesh=bpy.data.meshes.new('Cold mesh');mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0)],[],[(0,1,2,3)])
uv=mesh.uv_layers.new(name='Existing UV')
for item,co in zip(uv.data,[(.1,.1),(.9,.1),(.9,.9),(.1,.9)]):item.uv=co
mesh.materials.append(bpy.data.materials['Original'])
cold=bpy.data.objects.new('Cold model',mesh);bpy.context.collection.objects.link(cold)
ident=next(iter(core.geometry(cold)['islands']));core.select_regions([ident],cold.name);core.save_group('BODY',cold.name)
cold_before=core.fingerprint(cold)
result=agent.paint('BODY',cold.name,color_name='ROJO')
check('one call prepares and paints cold mesh',result['ok'] and bool(core.state(cold).get('slots')))
check('automatic preparation preserves mesh',core.fingerprint(cold)==cold_before)

out=ROOT/'evidence'/'agent-workflow'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')
result=core.dispatch('agent_export',object_name=ob.name,directory=str(out),include_glb=True)
check('one call exports PNG and GLB',result['ok'] and all(Path(p).is_file() for p in result['png']) and Path(result['glb']).is_file())
check('automation never saves blend',result['saved_blend'] is False and Path(bpy.data.filepath).name=='fixture.blend')
files={p.name:p.stat().st_mtime_ns for p in out.iterdir()}
result=agent.export(str(out),ob.name,include_glb=True)
check('existing destination blocks without overwriting',result['status']=='destination_exists' and files=={p.name:p.stat().st_mtime_ns for p in out.iterdir()})
check('export preserves original fixture',core.fingerprint(ob)==baseline)
(ROOT/'evidence'/'agent-test-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'export_directory':str(out),'model_agents_executed':[]},indent=2),encoding='utf-8')
print('SSTP_AGENT_RESULT '+json.dumps({'passed':len(checks)}))
