"""Create small web derivatives. Source GLBs and ZIPs remain untouched."""
import copy, io, json, pathlib, struct, hashlib, zipfile, re
from PIL import Image
import numpy as np
from inspect_decor_sources import ROOT, AMBIENTE, read_glb

OUT=ROOT/'assets/barcelona-decor'

def pack(source, target, selected=None, neutral=False):
    j,binary=read_glb(source)
    if selected is None: roots=j['scenes'][j.get('scene',0)]['nodes']
    else: roots=[i for i,n in enumerate(j['nodes']) if n.get('name') in selected]
    result={'asset':j['asset'],'scene':0,'scenes':[{'nodes':[]}], 'nodes':[], 'meshes':[], 'accessors':[], 'bufferViews':[], 'materials':[], 'textures':[], 'images':[], 'samplers':j.get('samplers',[])}
    blob=bytearray(); maps={key:{} for key in ('nodes','meshes','accessors','bufferViews','materials','textures','images')}
    def append_view(data):
        while len(blob)%4:blob.append(0)
        offset=len(blob);blob.extend(data)
        result['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
        return len(result['bufferViews'])-1
    def take(key,index):
        if index in maps[key]:return maps[key][index]
        item=copy.deepcopy(j[key][index]);new=len(result[key]);maps[key][index]=new;result[key].append(item)
        if key=='nodes':
            if 'mesh' in item:item['mesh']=take('meshes',item['mesh'])
            if 'children' in item:item['children']=[take('nodes',c) for c in item['children']]
        elif key=='meshes':
            for p in item['primitives']:
                p['attributes']={k:take('accessors',v) for k,v in p['attributes'].items() if k in ('POSITION','NORMAL','TEXCOORD_0','TEXCOORD_1','COLOR_0')}
                if 'indices' in p:p['indices']=take('accessors',p['indices'])
                if 'material' in p:p['material']=take('materials',p['material'])
        elif key=='accessors':
            if 'bufferView' in item:
                view=j['bufferViews'][item['bufferView']]
                dtype=np.dtype({5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[item['componentType']])
                width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[item['type']]
                data=np.ndarray((item['count'],width),dtype=dtype,buffer=binary,offset=view.get('byteOffset',0)+item.get('byteOffset',0),strides=(view.get('byteStride',width*dtype.itemsize),dtype.itemsize)).tobytes()
                item['bufferView']=append_view(data);item['byteOffset']=0
        elif key=='bufferViews':
            offset=item.get('byteOffset',0);data=binary[offset:offset+item['byteLength']]
            while len(blob)%4:blob.append(0)
            item['buffer']=0;item['byteOffset']=len(blob);blob.extend(data)
        elif key=='materials':
            pbr=item.setdefault('pbrMetallicRoughness',{})
            legacy=item.get('extensions',{}).get('KHR_materials_pbrSpecularGlossiness')
            if legacy:
                pbr['baseColorFactor']=legacy.get('diffuseFactor',[1,1,1,1])
                if 'diffuseTexture' in legacy:pbr['baseColorTexture']=legacy['diffuseTexture']
            if neutral:
                pbr.pop('baseColorTexture',None);pbr['baseColorFactor']=[.3,.33,.3,1]
                item.pop('normalTexture',None)
            pbr.pop('metallicRoughnessTexture',None);pbr['metallicFactor']=0;pbr['roughnessFactor']=1
            item.pop('occlusionTexture',None);item.pop('emissiveTexture',None);item.pop('extensions',None)
            for slot in ('baseColorTexture',):
                if slot in pbr:pbr[slot]['index']=take('textures',pbr[slot]['index'])
            if 'normalTexture' in item:item['normalTexture']['index']=take('textures',item['normalTexture']['index'])
        elif key=='textures':
            item['source']=take('images',item['source']);item.pop('extensions',None)
        elif key=='images':
            view=j['bufferViews'][item['bufferView']];offset=view.get('byteOffset',0)
            data=binary[offset:offset+view['byteLength']]
            image=Image.open(io.BytesIO(data));image.thumbnail((512,512),Image.Resampling.LANCZOS)
            stream=io.BytesIO();image.save(stream,'PNG',optimize=True)
            item['bufferView']=append_view(stream.getvalue());item['mimeType']='image/png'
        return new
    result['scenes'][0]['nodes']=[take('nodes',n) for n in roots]
    result['buffers']=[{'byteLength':len(blob)}]
    encoded=json.dumps(result,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);blob+=b'\0'*((-len(blob))%4)
    target.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(blob))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(blob),0x004e4942)+blob)
    return {'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'file':target.name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}

def prepare():
    OUT.mkdir(parents=True,exist_ok=True)
    sources=[]
    for file in ('anime_nature_tree_01.glb','anime_tree_2.glb','jabami_anime_tree_v1.glb'):
        sources.append(pack(AMBIENTE/'vegetacion/Arboles'/file,OUT/file))
    manifest=json.loads((AMBIENTE/'Objetos optimizados/spanstories_city_props_manifest.json').read_text(encoding='utf-8-sig'))
    selected=['SS_SIGNS_CAUTION_SIGN_03','SS_SIGNS_GUIDANCE_SIGN_02']+['SS_TRAFFIC_LIGHTS_TRAFFIC_COMPONENT_'+str(i).zfill(2) for i in (3,20,21,22,23,24,25,26,27)]
    sources.append(pack(AMBIENTE/'Objetos optimizados/spanstories_city_props_library.glb',OUT/'props.glb',selected,neutral=True))
    (OUT/'manifest.json').write_text(json.dumps({'version':1,'usage':manifest['usage'],'sources':sources},indent=2),encoding='utf-8')
    z=zipfile.ZipFile(AMBIENTE/'vegetacion/Arboles/ez-tree-main.zip')
    vendor=ROOT/'vendor/ez-tree';vendor.mkdir(exist_ok=True)
    for n in z.namelist():
        if n.startswith('ez-tree-main/src/lib/') and n.endswith('.js'):
            relative=n.removeprefix('ez-tree-main/src/lib/');text=z.read(n).decode()
            text=re.sub(r"from ['\"]three['\"]", "from '../../engine/three.js'",text) if '/' not in relative else text
            text=re.sub(r"(from\s+['\"])(\.[^'\"]+)(['\"])",lambda m:m[1]+m[2]+('' if pathlib.PurePosixPath(m[2]).suffix else '.js')+m[3],text)
            # Preset JSON imports are replaced by a JSON-free registry below.
            target=vendor/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text,encoding='utf-8')
    presets={'oak_small':json.loads(z.read('ez-tree-main/src/lib/presets/oak_small.json'))}
    (vendor/'presets/index.js').write_text('const presets='+json.dumps(presets,separators=(',',':'))+';\nexport const loadPreset = name => structuredClone(presets[name.replaceAll(" ","_").toLowerCase()]);\nexport const TreePreset = Object.freeze(Object.fromEntries(Object.keys(presets).map(k=>[k,k])));\n',encoding='utf-8')
    for n in ('LICENSE','README.md'):
        (vendor/n).write_bytes(z.read('ez-tree-main/'+n))
    print(json.dumps([{'file':s['file'],'bytes':s['bytes']} for s in sources]))

if __name__=='__main__':prepare()
