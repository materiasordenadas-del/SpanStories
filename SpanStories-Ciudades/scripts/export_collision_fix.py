import json
import os
from export_optimize import ZONE

path = os.path.join(ZONE, 'zona.json')
with open(path, encoding='utf8') as stream:
    manifest = json.load(stream)
ground = manifest['ground']
changed = []
for obj in manifest['objects']:
    if not obj['collision'] or not obj['bounds']:
        continue
    name = obj['name'].lower()
    b = obj['bounds']
    ground_max = max(ground['origin'][1] + ground['slope'][0] * x + ground['slope'][1] * z for x in (b['min'][0], b['max'][0]) for z in (b['min'][2], b['max'][2]))
    if any(word in name for word in ('bordillo', 'viario', 'calzada', 'acera', 'terreno', 'subsuelo', 'solar', 'marcas', 'bici_pintura')) or b['max'][1] - ground_max < .65:
        obj['collision'] = False
        changed.append(obj['name'])
with open(path, 'w', encoding='utf8') as stream:
    json.dump(manifest, stream, ensure_ascii=False, separators=(',', ':'))
print(json.dumps({'collisionFlagsCorrected':len(changed), 'names':changed}, ensure_ascii=False))
