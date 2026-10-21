"""Derive placements from the active city's tree pits and road plan, in metres."""
import hashlib, json, subprocess
import numpy as np
from inspect_decor_sources import ROOT, AMBIENTE

ZONE=ROOT/'Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia'

def build():
    m=json.loads((ZONE/'zona.json').read_text(encoding='utf-8-sig'))
    holes=json.loads((ROOT/'reports/tree-pits.json').read_text(encoding='utf-8'))
    anchors=[o for o in m['objects'] if o['name'].startswith('BCN_ARB-')]
    placements=[];used=set();missed=[]
    for a in anchors:
        xyz=a['worldMatrix'][12:15];nearest=min(range(len(holes)),key=lambda i:np.linalg.norm(np.array(holes[i]['position'])[::2]-np.array(xyz)[::2]))
        h=holes[nearest];distance=float(np.linalg.norm(np.array(h['position'])[::2]-np.array(xyz)[::2]))
        if distance>2 or nearest in used:missed.append({'anchor':a['name'],'distance':distance});continue
        used.add(nearest)
        seed=int(hashlib.sha256(a['id'].encode()).hexdigest()[:8],16)
        placements.append({'id':'decor-tree-'+a['id'],'anchorId':a['id'],'label':'Árbol '+a['name'].removeprefix('BCN_ARB-'),'kind':'tree','variant':('gold' if 7<=seed%10<9 else 'anime'), 'sector':a['sector'],'position':h['position'],'pit':{'min':h['min'],'max':h['max']},'height':7.2+(seed%11)/10,'yaw':(seed%360)*np.pi/180})
    blueprint=json.loads((AMBIENTE/'../Primera ciudad/Barcelona_PasseigGracia/barcelona-blueprint.json').resolve().read_text(encoding='utf-8-sig'))
    # Four approaches at every existing junction. Road widths come from this city's plan.
    streets=blueprint['calles'];ground=m['ground'];out=[]
    def ground_at(x,z):return ground['origin'][1]+x*ground['slope'][0]+z*ground['slope'][1]
    def sector_at(x,z):
        return min(m['sectors'],key=lambda s:max(s['bounds']['min'][0]-x,0,x-s['bounds']['max'][0])**2+max(s['bounds']['min'][2]-z,0,z-s['bounds']['max'][2])**2)['id']
    for junction in blueprint['cruces']:
        x,y=junction['centro'];z=-y
        # Sidewalk boundaries are derived from the road surfaces, not facade-to-facade widths.
        north_south=next(c for c in streets if c['nombre']==junction['calles'][0])
        east_west=next(c for c in streets if c['nombre']==junction['calles'][1])
        def road_half(street):
            bands=[b for b in street.get('bandas',[]) if b['tipo']!='acera']
            return max(abs(b.get(k,0)) for b in bands for k in ('desde_eje_m','hasta_eje_m'))
        dx,dz=road_half(north_south)+.7,road_half(east_west)+.7
        for index,(sx,sz,face,axis) in enumerate(((1,1,np.pi,'z'),(-1,-1,0,'z'),(-1,1,np.pi/2,'x'),(1,-1,-np.pi/2,'x'))):
            px,pz=x+sx*dx,z+sz*dz
            # Reserve clearance for pedestrians, trunk positions and building corners.
            if min((px-t['position'][0])**2+(pz-t['position'][2])**2 for t in placements)<2.2**2:continue
            if any(o.get('collision') and o.get('bounds') and o['bounds']['max'][1]>ground_at(px,pz)+2 and o['bounds']['min'][0]-.35<px<o['bounds']['max'][0]+.35 and o['bounds']['min'][2]-.35<pz<o['bounds']['max'][2]+.35 for o in m['objects']):continue
            out.append({'id':f"decor-light-{junction['id']}-{index}",'label':f"Semáforo {junction['id']} · {index+1}",'kind':'traffic','variant':'green' if axis=='z' else 'red','sector':sector_at(px,pz),'position':[px,ground_at(px,pz)+.16,pz],'height':3.6,'yaw':face,'junction':junction['id']})
            # A blue crossing plate follows the pedestrian route; one speed plate per junction.
            qx,qz=px+sx*1.4,pz+sz*1.4
            out.append({'id':f"decor-sign-{junction['id']}-{index}",'label':f"{'Velocidad 30' if index==0 else 'Paso peatonal'} · {junction['id']} {index+1}",'kind':'sign','variant':'speed' if index==0 else 'crossing','sector':sector_at(qx,qz),'position':[qx,ground_at(qx,qz)+.16,qz],'height':2.9,'yaw':face,'junction':junction['id']})
    # Exact supports measured by raycast against the loaded, decoded city.
    supports=json.loads((ROOT/'reports/decor-support.json').read_text(encoding='utf-8'))
    supports={p['id']:p for p in supports}
    for p in out:
        support=supports[p['id']]
        assert support.get('supportY') is not None, p['id']+' has no verified support'
        assert abs(p['position'][0]-support['position'][0])<.001 and abs(p['position'][2]-support['position'][2])<.001
        assert 'panot' in support['material'].lower(),p['id']+' must be on sidewalk paving'
        p['position'][1]=support['supportY'];p['supportId']=support['supportId'];p['supportMaterial']=support['material']
    layout={'version':1,'units':'metres','sourceManifestSha256':hashlib.sha256((ZONE/'zona.json').read_bytes()).hexdigest(),'placements':placements+out,'audit':{'anchors':len(anchors),'soilPits':len(holes),'trees':len(placements),'unmatched':missed,'traffic':sum(o['kind']=='traffic' for o in out),'signs':sum(o['kind']=='sign' for o in out),'verifiedSidewalkSupports':len(out)}}
    (ROOT/'assets/barcelona-decor/layout.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(layout['audit'],ensure_ascii=True))
    subprocess.run(['node',str(ROOT/'scripts/vary_city_trees.mjs')],check=True,cwd=ROOT)

if __name__=='__main__':build()
