"""Extrae la geometría estática del FBX suministrado sin modificar el original."""
import hashlib
import json
import math
import struct
import zlib
from pathlib import Path

SOURCE = Path(r'D:\Español\imagen para animación\Ambiente\hotel\source\grandhotel_01.fbx')
DEST = Path(__file__).resolve().parents[1] / 'assets' / 'fachada'
data = SOURCE.read_bytes()
version = struct.unpack_from('<I', data, 23)[0]
if version >= 7500:
    raise ValueError('Este conversor admite FBX binario anterior a 7500')

def prop(pos):
    kind = chr(data[pos]); pos += 1
    formats = {'Y': 'h', 'C': '?', 'I': 'i', 'F': 'f', 'D': 'd', 'L': 'q'}
    if kind in formats:
        fmt = '<' + formats[kind]
        return struct.unpack_from(fmt, data, pos)[0], pos + struct.calcsize(fmt)
    if kind in 'SR':
        n = struct.unpack_from('<I', data, pos)[0]; pos += 4
        v = data[pos:pos+n]
        return (v.decode('utf8', errors='replace') if kind == 'S' else v), pos+n
    if kind in 'fdlibc':
        count, encoding, n = struct.unpack_from('<III', data, pos); pos += 12
        raw = data[pos:pos+n]
        if encoding: raw = zlib.decompress(raw)
        fmt = {'f':'f','d':'d','l':'q','i':'i','b':'?','c':'B'}[kind]
        return list(struct.unpack('<' + str(count) + fmt, raw)), pos+n
    raise ValueError('Propiedad FBX desconocida: ' + kind)

def node(pos):
    end, count, _, length = struct.unpack_from('<IIIB', data, pos)
    if not end: return None, pos + 13
    pos += 13
    name = data[pos:pos+length].decode(); pos += length
    values = []
    for _ in range(count):
        value, pos = prop(pos); values.append(value)
    children = []
    while pos < end - 13:
        child, pos = node(pos)
        if child: children.append(child)
    return {'name':name,'props':values,'children':children}, end

nodes = []; pos = 27
while pos < len(data):
    n, pos = node(pos)
    if not n: break
    nodes.append(n)

def child(n, name):
    return next((c for c in n['children'] if c['name']==name), None)

objects = next(n for n in nodes if n['name']=='Objects')
geometries = [n for n in objects['children'] if n['name']=='Geometry']
models = [n for n in objects['children'] if n['name']=='Model']
connections = next(n for n in nodes if n['name']=='Connections')['children']
DEST.mkdir(parents=True, exist_ok=True)
views=[]; accessors=[]; meshes=[]; outnodes=[]; binary=bytearray()
def accessor(values, width, component=5126):
    while len(binary)%4: binary.append(0)
    offset=len(binary); fmt='f' if component==5126 else 'I'
    binary.extend(struct.pack('<'+str(len(values))+fmt,*values))
    views.append({'buffer':0,'byteOffset':offset,'byteLength':len(binary)-offset})
    a={'bufferView':len(views)-1,'componentType':component,'count':len(values)//width,'type':{1:'SCALAR',2:'VEC2',3:'VEC3'}[width]}
    if width==3:
        a['min']=[min(values[i::3]) for i in range(3)];a['max']=[max(values[i::3]) for i in range(3)]
    accessors.append(a); return len(accessors)-1

report=[]
for geo in geometries:
    vertices=child(geo,'Vertices')['props'][0]
    polygons=child(geo,'PolygonVertexIndex')['props'][0]
    modelid=next((c['props'][2] for c in connections if len(c['props'])>2 and c['props'][1]==geo['props'][0]),None)
    model=next((m for m in models if m['props'][0]==modelid),None)
    transform={}
    if model and child(model,'Properties70'):
        for p in child(model,'Properties70')['children']:
            transform[p['props'][0]]=p['props'][4:]
    # Transforma ejes FBX mediante un nodo glTF; el adaptador centra y escala después.
    positions=[]; indices=[]; poly=[]
    for v in polygons:
        poly.append(-v-1 if v<0 else v)
        if v<0:
            for i in range(1,len(poly)-1):
                for vi in [poly[0],poly[i],poly[i+1]]:
                    indices.append(len(positions)//3);positions.extend(vertices[vi*3:vi*3+3])
            poly=[]
    attrs={'POSITION':accessor(positions,3)}
    meshes.append({'name':str(geo['props'][1]),'primitives':[{'attributes':attrs,'indices':accessor(indices,1,5125),'material':0}]})
    rx,ry,rz=[math.radians(v)/2 for v in transform.get('Lcl Rotation',[0,0,0])]
    c1,c2,c3=math.cos(rx),math.cos(ry),math.cos(rz)
    s1,s2,s3=math.sin(rx),math.sin(ry),math.sin(rz)
    q=[s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3]
    outnodes.append({'name':'grandhotel-fbx-'+str(len(meshes)),'mesh':len(meshes)-1,'rotation':q,'translation':transform.get('Lcl Translation',[0,0,0]),'scale':transform.get('Lcl Scaling',[1,1,1])})
    report.append({'geometry':str(geo['props'][1]),'triangles':len(indices)//3,'transform':transform})

gltf={'asset':{'version':'2.0','generator':'SpanStories FBX static geometry extraction'},'scene':0,'scenes':[{'nodes':list(range(len(outnodes)))}],'nodes':outnodes,'meshes':meshes,'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[0.91,0.85,0.73,1],'metallicFactor':0,'roughnessFactor':1}}],'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors}
raw=json.dumps(gltf,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);binary.extend(b'\0'*((-len(binary))%4))
glb=struct.pack('<4sII',b'glTF',2,12+8+len(raw)+8+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary
(DEST/'grandhotel.glb').write_bytes(glb)
manifest={'catalogoId':'grandhotel-fbx-usuario','nombre':'Grand Hotel Building','rutaOrigen':str(SOURCE),'sha256Origen':hashlib.sha256(data).hexdigest(),'metodo':'Geometría FBX original; albedo sustituido por colores planos y ventanas geométricas. Sin texturas fotográficas.','geometrias':report}
(DEST/'articulo.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=True))
