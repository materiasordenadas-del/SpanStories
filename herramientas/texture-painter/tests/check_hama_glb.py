"""Independent codec and binary validation of the real exported character."""
from pathlib import Path
import io,json,struct,hashlib
from PIL import Image
import numpy as np
OUT=Path(__file__).resolve().parents[1]/'evidence/web-auto-0.1.21'
def read(name):
    raw=(OUT/name).read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    assert len(raw)==struct.unpack_from('<I',raw,8)[0]
    return json.loads(raw[20:20+n]),raw[28+n:]
a,ab=read('Hama_native.glb');b,bb=read('Hama_web.glb');checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
def view(doc,data,i):
    v=doc['bufferViews'][i];offset=v.get('byteOffset',0);return memoryview(data)[offset:offset+v['byteLength']]
images={i['bufferView'] for i in a['images']}
check('all geometry morph and animation buffer bytes identical',all(view(a,ab,i)==view(b,bb,i) for i in range(len(a['bufferViews'])) if i not in images))
for key in ('meshes','nodes','accessors','materials','skins','animations','samplers'):
    check(key+' identical',a.get(key)==b.get(key))
for old,new in zip(a['images'],b['images']):
    source=np.array(Image.open(io.BytesIO(view(a,ab,old['bufferView']))).convert('RGBA'))
    target=np.array(Image.open(io.BytesIO(view(b,bb,new['bufferView']))).convert('RGBA'))
    check('real image RGBA preserved '+str(new['bufferView']),np.array_equal(source,target))
nodes=[n.get('name','') for n in b['nodes']]
check('both separate procedural eyes are included',any('Hama_Ojo_Procedural_L' in n for n in nodes) and any('Hama_Ojo_Procedural_R' in n for n in nodes))
check('standard vertex colors exported',any('COLOR_0' in p['attributes'] for m in b['meshes'] for p in m['primitives']))
check('no external texture or buffer files',all('uri' not in i for i in b['images']) and all('uri' not in buf for buf in b['buffers']))
record=json.loads((OUT/'hama-validation.json').read_text())
check('original blend file unchanged',record['original_blend_unchanged'])
check('smaller download',record['web_optimization']['after_bytes']<record['web_optimization']['before_bytes'])
result={'passed':len(checks),'checks':checks,'morph_targets':sum(len(p.get('targets',[])) for m in b['meshes'] for p in m['primitives']),
        'texture_bytes':sum(b['bufferViews'][i['bufferView']]['byteLength'] for i in b['images']),
        'glb_bytes':(OUT/'Hama_web.glb').stat().st_size,'browser_rendered':False}
(OUT/'hama-independent-validation.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
