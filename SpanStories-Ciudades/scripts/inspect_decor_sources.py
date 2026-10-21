"""Read-only measurements of supplied assets; never opens Blender."""
import json, pathlib, struct, hashlib
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
AMBIENTE = next(p for p in ROOT.parent.glob('imagen*') if p.is_dir()) / 'Ambiente'

def read_glb(path):
    data = path.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20+length]), data[28+length:]

def matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix']).reshape((4, 4), order='F')
    x,y,z,w = node.get('rotation', [0,0,0,1])
    mat = np.eye(4)
    mat[:3,:3] = [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                  [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                  [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
    mat[:3,:3] *= np.array(node.get('scale', [1,1,1]))
    mat[:3,3] = node.get('translation', [0,0,0])
    return mat

def bounds(j, index, parent=None):
    node=j['nodes'][index]; world=(np.eye(4) if parent is None else parent) @ matrix(node)
    points=[]
    if 'mesh' in node:
        for p in j['meshes'][node['mesh']]['primitives']:
            a=j['accessors'][p['attributes']['POSITION']]
            for x in (a['min'][0],a['max'][0]):
                for y in (a['min'][1],a['max'][1]):
                    for z in (a['min'][2],a['max'][2]): points.append((world @ [x,y,z,1])[:3])
    for c in node.get('children', []):
        b=bounds(j,c,world)
        if b is not None: points.extend(b)
    return np.array([np.min(points,axis=0),np.max(points,axis=0)]) if len(points) else None

def inspect():
    report={'trees':[], 'props':[]}
    for p in (AMBIENTE/'vegetacion/Arboles').glob('*.glb'):
        j,_=read_glb(p); b=np.array([bounds(j,n) for n in j['scenes'][j.get('scene',0)]['nodes']]); b=np.array([b[:,0].min(axis=0),b[:,1].max(axis=0)])
        report['trees'].append({'file':p.name,'bounds':b.tolist(),'size':(b[1]-b[0]).tolist(),
          'materials':j.get('materials',[]), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    j,_=read_glb(AMBIENTE/'Objetos optimizados/spanstories_city_props_library.glb')
    for i,n in enumerate(j['nodes']):
        if n.get('extras',{}).get('spanstoriesAsset'):
            b=bounds(j,i)
            report['props'].append({'name':n['name'],'node':i,'bounds':b.tolist(),'size':(b[1]-b[0]).tolist()})
    out=ROOT/'reports/decor-source-inspection.json';out.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('Trees:',[(t['file'],[round(x,3) for x in t['size']]) for t in report['trees']])
    for p in report['props']:
        if 'SIGNS_' in p['name'] or ('TRAFFIC_' in p['name'] and p['size'][1]>.6): print(p['name'],np.round(p['size'],3).tolist())

if __name__=='__main__':inspect()
