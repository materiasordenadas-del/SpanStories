"""Derivado ligero: solo cama, mesitas y TV, sin texturas ni objetos vecinos."""
import hashlib
import json
import struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(r'D:\Español\imagen para animación\Ambiente\hotel\hotel_room.glb')
data=SOURCE.read_bytes();length=struct.unpack_from('<I',data,12)[0]
doc=json.loads(data[20:20+length]);start=20+length;binlen=struct.unpack_from('<I',data,start)[0];binary=data[start+8:start+8+binlen]
wanted={'bed','bed_2','bedsidetable','bedsidetable (2)','tv'}
keep=set()
def descend(i):
    keep.add(i)
    for c in doc['nodes'][i].get('children',[]):descend(c)
for i,n in enumerate(doc['nodes']):
    if n.get('name') in wanted:descend(i)
parents={c:i for i,n in enumerate(doc['nodes']) for c in n.get('children',[])}
for i in list(keep):
    while i in parents:i=parents[i];keep.add(i)
ids={old:new for new,old in enumerate(sorted(keep))};meshes=[];accessors=[];views=[];out=bytearray();meshmap={};amap={};vmap={}
def acc(old):
    if old in amap:return amap[old]
    a=dict(doc['accessors'][old]);v=doc['bufferViews'][a['bufferView']]
    component={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a['componentType']]
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]*component
    stride=v.get('byteStride',width);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    raw=b''.join(binary[offset+i*stride:offset+i*stride+width] for i in range(a['count']))
    while len(out)%4:out.append(0)
    a['bufferView']=len(views);a.pop('byteOffset',None)
    views.append({'buffer':0,'byteOffset':len(out),'byteLength':len(raw)})
    out.extend(raw);amap[old]=len(accessors);accessors.append(a);return amap[old]
nodes=[]
for old in sorted(keep):
    n={k:v for k,v in doc['nodes'][old].items() if k not in ['children','mesh','camera','extensions']}
    children=[ids[c] for c in doc['nodes'][old].get('children',[]) if c in keep]
    if children:n['children']=children
    if 'mesh' in doc['nodes'][old]:
        mi=doc['nodes'][old]['mesh']
        if mi not in meshmap:
            m=doc['meshes'][mi];primitives=[]
            for p in m['primitives']:
                q={'attributes':{k:acc(v) for k,v in p['attributes'].items() if k in ['POSITION','NORMAL']},'material':0}
                if 'indices' in p:q['indices']=acc(p['indices'])
                primitives.append(q)
            meshmap[mi]=len(meshes);meshes.append({'name':m.get('name','pieza'),'primitives':primitives})
        n['mesh']=meshmap[mi]
    nodes.append(n)
g={'asset':{'version':'2.0','generator':'SpanStories semantic subset'},'scene':0,'scenes':[{'nodes':[ids[i] for i in keep if i not in parents]}],'nodes':nodes,'meshes':meshes,'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[.9,.85,.75,1],'metallicFactor':0,'roughnessFactor':1}}],'bufferViews':views,'accessors':accessors,'buffers':[{'byteLength':len(out)}]}
raw=json.dumps(g,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);out.extend(b'\0'*((-len(out))%4))
dest=ROOT/'assets/catalogo/habitacion/modulos.glb';dest.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(raw)+len(out))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(out),0x004e4942)+out)
manifest=ROOT/'assets/catalogo/habitacion/articulo.json';f=json.loads(manifest.read_text(encoding='utf8'));f.update({'modelo':'modulos.glb','sha256Origen':hashlib.sha256(data).hexdigest(),'nodosSemanticos':sorted(wanted),'preparacion':'Solo subconjunto semántico; sin texturas, cámaras o luces','bytesOriginal':len(data),'bytesDerivado':dest.stat().st_size});manifest.write_text(json.dumps(f,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'original':len(data),'derivado':dest.stat().st_size,'nodos':len(nodes),'meshes':len(meshes)}))
