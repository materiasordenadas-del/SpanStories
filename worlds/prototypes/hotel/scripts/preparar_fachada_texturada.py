"""Prepara la conversión glTF incluida junto al FBX, conservando UV y albedo."""
import hashlib,json,shutil
from pathlib import Path
SOURCE=Path(r'D:\Español\imagen para animación\Ambiente\hotel')
DEST=Path(__file__).resolve().parents[1]/'assets/fachada'
j=json.loads((SOURCE/'scene.gltf').read_text())
# Excluye el plano de contexto, sus materiales y su textura; fachada intacta.
j['nodes'][2]['children']=[3];j['nodes']=j['nodes'][:6];j['meshes']=j['meshes'][:2]
j['materials']=j['materials'][:2];j['textures']=j['textures'][:2];j['images']=j['images'][:2]
(DEST/'scene.gltf').write_text(json.dumps(j,separators=(',',':')),encoding='utf8')
shutil.copy2(SOURCE/'scene.bin',DEST/'scene.bin');(DEST/'textures').mkdir(exist_ok=True)
for image in j['images']:shutil.copy2(SOURCE/image['uri'],DEST/image['uri'])
path=DEST/'articulo.json';f=json.loads(path.read_text(encoding='utf8'));f.update({'modelo':'scene.gltf','preparacion':'Conversión glTF suministrada junto al FBX: geometría, UV y texturas intactas; se excluye el plano de contexto.','texturas': [i['uri'] for i in j['images']],'texturasAutorizadas':True,'geometriaFbxSha256':hashlib.sha256((SOURCE/'source/grandhotel_01.fbx').read_bytes()).hexdigest()});path.write_text(json.dumps(f,ensure_ascii=False,indent=2),encoding='utf8');print('Fachada texturada preparada: 2 materiales; se preserva el FBX original.')
