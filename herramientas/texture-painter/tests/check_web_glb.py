"""Independent byte/pixel validation of the actual optimized character export."""
from pathlib import Path
import io, json, struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/web-export-0.1.15'
def read(path):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    assert struct.unpack_from('<I',raw,8)[0]==len(raw)
    return json.loads(raw[20:20+n]),raw[28+n:],len(raw)
a,ab,asize=read(OUT/'baseline-png.glb')
b,bb,bsize=read(OUT/'personaje_web_optimizado.glb')
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
def view(doc,binary,index):
    v=doc['bufferViews'][index];offset=v.get('byteOffset',0)
    return binary[offset:offset+v['byteLength']]
image_views={i['bufferView'] for i in a['images']}
check('all geometry/accessor buffer bytes identical',all(view(a,ab,i)==view(b,bb,i) for i in range(len(a['bufferViews'])) if i not in image_views))
for key in ['meshes','accessors','nodes','materials','skins','animations','samplers']:
    check(key+' unchanged',a.get(key)==b.get(key))
for old,new in zip(a['images'],b['images']):
    source=Image.open(io.BytesIO(view(a,ab,old['bufferView']))).convert('RGBA')
    target=Image.open(io.BytesIO(view(b,bb,new['bufferView']))).convert('RGBA')
    check('same 2048 resolution',source.size==target.size==(2048,2048))
    check('independent decoded RGBA equality',np.array_equal(np.asarray(source),np.asarray(target)))
check('WebP extension declared', 'EXT_texture_webp' in b.get('extensionsRequired',[]))
check('texture refers to WebP image',all('EXT_texture_webp' in t.get('extensions',{}) for t in b['textures']))
check('opaque face fill has no additional texture',len(b['images'])==1 and any('baseColorFactor' in m.get('pbrMetallicRoughness',{}) and 'baseColorTexture' not in m.get('pbrMetallicRoughness',{}) for m in b['materials']))
check('four byte aligned bufferViews',all(v.get('byteOffset',0)%4==0 for v in b['bufferViews']))
check('self-contained GLB',all('bufferView' in i and 'uri' not in i for i in b['images']) and all('uri' not in v for v in b['buffers']))
check('smaller download',bsize<asize)
prior=ROOT/'evidence/exact-live-export-0.1.14/personaje_caras_exactas.glb'
result={'passed':len(checks),'checks':checks,'current_png_glb_bytes':asize,'optimized_glb_bytes':bsize,'previous_release_bytes':prior.stat().st_size,'reduction_from_previous_percent':round(100*(1-bsize/prior.stat().st_size),2),'lossless':True}
(OUT/'validation.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
