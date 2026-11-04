"""Procedural skin (derived from UltimateSkin by Kuhantilope, whose terms forbid selling it)
as a removable shader layer, with the original texture untouched.

Mask image channels (UV space, Non-Color):
R piel que recibe el shader · G labios (campo suave, 0.5 = borde) · B luz de la
textura (0.5 = neutro) · A rubor. Lips are never redrawn: where G is high the
shader shows the original texels. Their shape comes from those same texels or,
without texture contrast, from the mouth's geometry; never from a reference image.
"""
import json
import re
from pathlib import Path

import bpy
import numpy as np

from . import core

ASSET=Path(__file__).resolve().parent/'assets'/'piel_nodos.blend'
GROUP='SSTP_Piel'
ZONES=('cara','torso','brazos','piernas')
TONES={'Muy claro':'#F6D7C3','Claro':'#EFC3A4','Medio':'#D9A17C','Canela':'#B97A50','Moreno':'#8C5A3C','Oscuro':'#5B3A29'}
#              propiedad: entrada del grupo
INPUTS={'poros':'Pores Strength','poros_tamano':'Pores Size','suciedad':'Pores Dirt','gallina':'Pores Goosebumps','celulas':'Cells Strength','granitos':'Pimples Color','lunares':'Moles Amount','pecas':'Freckles Strength','pecas_escala':'Freckles Scale','venas':'Venas Fuerza','manchas':'Blemishes Strength','rojeces':'Red-Spots Strength','brillo':'Specular','aspereza':'Roughness','translucidez':'Subsurface','barniz':'Clearcoat','escala':'SCALE_OVERALL','textura':'Luz Fuerza','poros_escala':'Pores Scale','celulas_escala':'Cells Scale','granitos_escala':'Pimples Scale','granitos_relieve':'Pimples Bump','lunares_escala':'Moles Scale','venas_escala':'Veins Scale','manchas_escala':'Blemishes Scale','rojeces_escala':'Red-Spots Scale','barniz_aspereza':'Clearcoat Roughness'}
COLORS={'lunares_color':'Moles Color','pecas_color':'Freckles Color','venas_color':'Veins Color','manchas_rojo':'Blemishes Color Red','manchas_azul':'Blemishes Color Blue','rojeces_color':'Red-Spots Color'}
STYLES={
    'PIXAR':dict(poros=0,poros_tamano=.5,suciedad=0,gallina=0,celulas=0,granitos=0,granitos_relieve=0,lunares=0,pecas=0,venas=0,manchas=0,rojeces=0,brillo=.35,aspereza=.5,translucidez=.03,barniz=0,textura=.6,rubor=.2),
    'NATURAL':dict(poros=.35,poros_tamano=.5,suciedad=.25,gallina=0,celulas=.35,granitos=0,granitos_relieve=0,lunares=.15,pecas=0,venas=.2,manchas=.3,rojeces=.3,brillo=.45,aspereza=.5,translucidez=.02,barniz=0,textura=.5,rubor=.35),
    'HIPER':dict(poros=1,poros_tamano=.5,suciedad=1,gallina=0,celulas=1,granitos=.5,granitos_relieve=.5,lunares=1,pecas=.3,venas=1,manchas=1,rojeces=1,brillo=.5,aspereza=.55,translucidez=.012,barniz=0,textura=.4,rubor=.4),
}
_cache={}


def hex_linear(value):
    value=value.lstrip('#');rgb=np.array([int(value[i:i+2],16)/255 for i in (0,2,4)])
    return core.to_linear(rgb).tolist()


def info(ob):
    raw=ob.get('sstp_piel_info')
    return json.loads(raw) if raw else {}


def active(ob):return bool(ob.get('sstp_piel_info'))


def main_slot(ob):
    base=core.state(ob).get('exact_base_slots')
    index=base if base and len(base)==len(ob.data.polygons) else [p.material_index for p in ob.data.polygons]
    count=np.bincount(index,minlength=len(ob.material_slots))
    return int(np.argmax(count))


def shader_of(mat):
    return next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')


def source_image(mat):
    """First image behind Base Color; painter stacks keep the protected base first."""
    socket=shader_of(mat).inputs['Base Color'];seen=[]
    while socket.is_linked:
        node=socket.links[0].from_node
        if node.type=='TEX_IMAGE' and node.image:seen.append(node.image)
        if node.type=='TEX_IMAGE':break
        socket=next((s for s in node.inputs if s.is_linked and s.type=='RGBA'),None)
        if socket is None:break
    return seen[0] if seen else None


def lab(srgb):
    c=np.where(srgb>.04045,((srgb+.055)/1.055)**2.4,srgb/12.92)
    x=(c*[.4124,.3576,.1805]).sum(-1)/.95047;y=(c*[.2126,.7152,.0722]).sum(-1);z=(c*[.0193,.1192,.9505]).sum(-1)/1.08883
    f=lambda t:np.where(t>.008856,np.cbrt(t),7.787*t+16/116)
    fx,fy,fz=f(x),f(y),f(z)
    return np.stack((116*fy-16,500*(fx-fy),200*(fy-fz)),-1)


def blur(a,radius):
    """Three box passes; close enough to a Gaussian and needs only numpy."""
    if radius<1:return a
    r=int(radius)
    for _ in range(3):
        for axis in (0,1):
            c=np.cumsum(np.swapaxes(a,0,axis),0,dtype=np.float32)
            c=np.concatenate((np.zeros_like(c[:1]),c),0);n=c.shape[0]-1
            hi=np.minimum(np.arange(n)+r+1,n);lo=np.maximum(np.arange(n)-r,0)
            a=np.swapaxes((c[hi]-c[lo])/(hi-lo).reshape((-1,)+(1,)*(c.ndim-1)),0,axis)
    return a


def raster(ob,size):
    """Face id and rest position for every texel; UV islands bound all later work."""
    me=ob.data;me.calc_loop_triangles();tris=me.loop_triangles
    n=len(tris);loops=np.empty(n*3,np.int32);tris.foreach_get('loops',loops);loops=loops.reshape(-1,3)
    poly=np.empty(n,np.int32);tris.foreach_get('polygon_index',poly)
    uv=np.empty(len(me.loops)*2,np.float32);me.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)*size
    vert=np.empty(len(me.loops),np.int32);me.loops.foreach_get('vertex_index',vert)
    co=np.empty(len(me.vertices)*3,np.float32);me.vertices.foreach_get('co',co);co=co.reshape(-1,3)
    fid=np.full((size,size),-1,np.int32);pos=np.zeros((size,size,3),np.float32)
    for tri,face in zip(loops,poly):
        A,B,C=uv[tri];d=(B[1]-C[1])*(A[0]-C[0])+(C[0]-B[0])*(A[1]-C[1])
        if abs(d)<1e-9:continue
        x0=max(int(min(A[0],B[0],C[0])),0);x1=min(int(max(A[0],B[0],C[0]))+2,size)
        y0=max(int(min(A[1],B[1],C[1])),0);y1=min(int(max(A[1],B[1],C[1]))+2,size)
        if x1<=x0 or y1<=y0:continue
        xs=np.arange(x0,x1)+.5;ys=(np.arange(y0,y1)+.5)[:,None]
        u=((B[1]-C[1])*(xs-C[0])+(C[0]-B[0])*(ys-C[1]))/d
        v=((C[1]-A[1])*(xs-C[0])+(A[0]-C[0])*(ys-C[1]))/d
        w=1-u-v;inside=(u>=-.02)&(v>=-.02)&(w>=-.02)
        if not inside.any():continue
        p=co[vert[tri]]
        fid[y0:y1,x0:x1][inside]=face
        pos[y0:y1,x0:x1][inside]=(u[inside,None]*p[0]+v[inside,None]*p[1]+w[inside,None]*p[2])
    return fid,pos,co,vert


def excluded_faces(ob,pattern=r'cabello|hair|pelo|eyeball|eyes_other'):
    """Hair and eyeballs named by the character's own vertex groups."""
    me=ob.data;bad=np.zeros(len(me.vertices),bool)
    # Our own hide group holds everything but the hair: it never names hair.
    groups={g.index for g in ob.vertex_groups if re.search(pattern,g.name,re.I) and not re.search(r'^(DEF|ORG|MCH)|sin_',g.name) and g.name!=HIDE}
    if groups:
        for v in me.vertices:
            for e in v.groups:
                if e.group in groups and e.weight>.5:bad[v.index]=True;break
    # A Mask modifier shows what is really hidden: visible faces are never hair.
    shown=None
    for m in ob.modifiers:
        group=ob.vertex_groups.get(m.vertex_group) if m.type=='MASK' and m.show_viewport and m.vertex_group!=HIDE else None
        if group and not m.invert_vertex_group:
            shown=np.zeros(len(me.vertices),bool)
            for v in me.vertices:
                if any(e.group==group.index and e.weight>.5 for e in v.groups):shown[v.index]=True
    out=np.zeros(len(me.polygons),bool)
    for p in me.polygons:
        ids=list(p.vertices);out[p.index]=bad[ids].mean()>.5 and not (shown is not None and shown[ids].mean()>.5)
    return out


def components(ob,keep):
    """Label connected faces; a skin patch must be a real surface, not a colour stain."""
    me=ob.data;nf=len(me.polygons)
    edge=np.empty(len(me.loops),np.int32);me.loops.foreach_get('edge_index',edge)
    start=np.empty(nf,np.int32);me.polygons.foreach_get('loop_start',start)
    total=np.empty(nf,np.int32);me.polygons.foreach_get('loop_total',total)
    owner=np.repeat(np.arange(nf),total)
    order=np.argsort(edge,kind='stable');e=edge[order];f=owner[order]
    same=e[1:]==e[:-1];a=f[:-1][same];b=f[1:][same]
    use=keep[a]&keep[b];a,b=a[use],b[use]
    label=np.arange(nf)
    while True:
        old=label.copy()
        np.minimum.at(label,a,label[b]);np.minimum.at(label,b,label[a]);label=label[label]
        if np.array_equal(old,label):return label


def skin_distance(a,b,ref):
    """Distance to the skin's colour axis: highlights are the same skin, only paler."""
    ra,rb=float(ref[1]),float(ref[2]);n=max(np.hypot(ra,rb),1e-3)
    along=(a*ra+b*rb)/n/n;across=np.abs(a*rb-b*ra)/n
    # Below half the skin's colour it is a warm white: shirts and cords, not skin.
    past=np.where(along>1,along-1,np.where(along<.5,.5-along,0))*n
    return np.hypot(past,across)


def hair_faces(ob,table,centers,normals,valid,height):
    """Hair without a vertex group: the colour that grows down from the crown.

    It leaves the analysis only; nothing is hidden or edited on the mesh. A crown
    coloured like the face means a bald or covered head, so nothing is removed.
    """
    high=centers[valid,2].max()
    crown=valid&(centers[:,2]>high-.04*height)
    front=valid&(normals[:,1]<-.5)&(centers[:,2]<high-.1*height)&(centers[:,2]>high-.3*height)
    if not crown.any() or not front.any():return np.zeros(len(table),bool)
    top=np.median(table[crown],0);face=np.median(table[front],0)
    if np.linalg.norm((top-face)[1:])<14 and abs(top[0]-face[0])<18:return np.zeros(len(table),bool)
    # Dark hair and pale skin are both low in colour: closer to the crown than to
    # the face is the test, and a result that swallows the face is rejected.
    near=np.linalg.norm(table-top,axis=1);other=np.linalg.norm(table-face,axis=1)
    same=valid&(near<other)&(np.hypot(table[:,1]-top[1],table[:,2]-top[2])<22)
    label=components(ob,same)
    hair=same&np.isin(label,np.unique(label[crown&same]))
    return np.zeros(len(table),bool) if hair[front].mean()>.35 else hair


def skin_reference(table,area,centers,normals,valid,height):
    """Dominant skin-plausible colour on the head, weighted to the front of the face.

    Hair can be the largest warm surface there: saturated reds and the crown lose.
    """
    head=valid&(centers[:,2]>centers[valid,2].max()-.32*height)
    L,a,b=table[:,0],table[:,1],table[:,2]
    hue=np.degrees(np.arctan2(b,a));chroma=np.hypot(a,b)
    warm=head&(chroma>6)&(chroma<48)&(hue>25)&(hue<82)&(L>18)&(L<97)
    if area[warm].sum()==0:return None
    crown=centers[:,2]>centers[valid,2].max()-.09*height
    weight=area*np.where((normals[:,1]<-.5)&~crown,6,1)
    bins=np.floor(table[warm,1:3]/3).astype(int);keys=bins[:,0]*1000+bins[:,1]
    unique,inverse=np.unique(keys,return_inverse=True);weights=np.bincount(inverse,weight[warm])
    peak=table[warm][inverse==int(np.argmax(weights))]
    return np.median(peak,0)


def locate_mouth(L,a,pos,fid,centers,skin,height,bottom):
    """No rig: the mouth is the reddest horizontal band in the lower half of the face."""
    z=(centers[:,2]-bottom)/height
    head=skin&(z>.72)
    if head.sum()<20:return None,None
    p=centers[head];xc=float(np.median(p[:,0]));lo,hi=np.percentile(p[:,2],(1,99));span=float(hi-lo)
    width=float(np.percentile(p[:,0],98)-np.percentile(p[:,0],2));ymid=float(np.median(p[:,1]))
    area=(fid>=0)&(np.abs(pos[...,0]-xc)<.3*width)&(pos[...,2]>lo+.15*span)&(pos[...,2]<lo+.62*span)&(pos[...,1]<ymid)
    if area.sum()<30:return None,None
    a0=np.median(a[area]);L0=np.median(L[area])
    score=(a-a0)+.3*np.clip(L0-L,0,40)
    zs=pos[...,2][area];s=score[area]
    edges=np.linspace(zs.min(),zs.max(),25);band=np.clip(np.digitize(zs,edges)-1,0,23)
    # Count of red texels by height: a nose shadow is one patch, a mouth is a wide row.
    hits=np.bincount(band[s>5],minlength=24).astype(np.float32)
    if hits.max()<5:return None,None
    best=int(np.argmax(np.convolve(hits,np.ones(3),'same')))
    near=np.abs(band-best)<=1;row=near&(s>5)
    x=pos[...,0][area][row];y=pos[...,1][area][row]
    found=float(np.percentile(x,98)-np.percentile(x,2))
    lips=found if .2*width<found<.75*width else .42*width
    return np.array([float(np.median(x)),float(np.median(y)),float(np.median(zs[row]))]),lips


def mouth_anchor(ob,skin_centers,height):
    """Rig lips, then the mouth interior slot, then head proportions."""
    me=ob.data
    groups={g.index for g in ob.vertex_groups if re.search(r'lip',g.name,re.I) and not re.search(r'^(ORG|MCH)',g.name)}
    pts=[]
    if groups:
        for v in me.vertices:
            if any(e.group in groups and e.weight>.5 for e in v.groups):pts.append(v.co[:])
    if len(pts)>=12:
        p=np.array(pts);c=np.median(p,0);c[0]=0 if abs(c[0])<.02*height else c[0]
        return c,float(np.percentile(p[:,0],98)-np.percentile(p[:,0],2)),'rig'
    slot=main_slot(ob);inner=[p.center[:] for p in me.polygons if p.material_index!=slot]
    head=skin_centers[skin_centers[:,2]>np.percentile(skin_centers[:,2],70)] if len(skin_centers) else None
    width=float(np.ptp(head[:,0])) if head is not None and len(head) else .1*height
    if inner:
        p=np.array(inner);return np.median(p,0),.42*width,'interior'
    if head is None or not len(head):return None,None,None
    c=np.array([np.median(head[:,0]),np.percentile(head[:,1],3),np.percentile(head[:,2],25)])
    return c,.42*width,'proporcion'


def texture_lips(L,a,b,pos,fid,center,width,ref):
    """Lips exactly as painted: two-class split of redness around the mouth."""
    d=pos-center.astype(np.float32);R=width*.75
    # Lips are about a third as tall as wide: the nose's red shadow stays outside.
    gate=(fid>=0)&(np.abs(d[...,0])<R)&(d[...,2]<width*.3)&(d[...,2]>-width*.45)&(d[...,1]<R*.8)
    ring=(fid>=0)&(np.abs(d[...,0])<R*1.5)&(np.abs(d[...,2])<R*1.3)&(d[...,1]<R)&~gate
    if gate.sum()<30 or ring.sum()<30:return None,0
    skin=ring&(np.hypot(a-ref[1],b-ref[2])<16)&(L>ref[0]-30)
    if skin.sum()<30:skin=ring
    a0=np.median(a[skin]);b0=np.median(b[skin]);L0=np.median(L[skin])
    # Pink lips on peach skin are no redder, only less yellow: measure the whole hue shift.
    score=np.hypot(np.maximum(a-a0,0),b-b0)+.3*np.clip(L0-L,0,40)
    values=score[gate]
    hist,edges=np.histogram(values,64);mid=(edges[:-1]+edges[1:])/2
    w=np.cumsum(hist);m=np.cumsum(hist*mid);total=w[-1]
    between=np.where((w>0)&(w<total),(m[-1]*w/total-m)**2/(w*(total-w)+1e-9),0)
    t=float(mid[int(np.argmax(between))])
    hi=values[values>t];lo=values[values<=t]
    if not len(hi) or not len(lo):return None,0
    contrast=float(hi.mean()-lo.mean())
    share=len(hi)/len(values)
    if share<.05 or share>.75:return None,contrast
    # Fade toward the search limit, or its rectangle would print on the face.
    fade=np.clip((1-np.abs(d[...,0])/R)*4,0,1)*np.clip((1-d[...,2]/(width*.3))*4,0,1)*np.clip((1+d[...,2]/(width*.45))*4,0,1)
    field=np.where(gate,np.clip(.5+(score-t)/max(contrast*1.2,1e-3),0,1)*fade,0).astype(np.float32)
    return close_lips(field,gate),contrast


def close_lips(field,gate):
    """Lip highlights are pale: they sit inside the lip, so they belong to it."""
    high=field>.5
    if not high.any():return field
    ys,xs=np.nonzero(gate);y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    box=(slice(y0,y1),slice(x0,x1));part=high[box].astype(np.float32)
    closed=blur(part,max(2,int(np.sqrt(high.sum())*.1)))>.42
    closed&=gate[box];solid=part>0;solid|=closed;open_=~solid
    # Flood the outside; any low texel it cannot reach is an enclosed hole.
    seen=np.zeros_like(open_);seen[0,:]=open_[0,:];seen[-1,:]=open_[-1,:];seen[:,0]=open_[:,0];seen[:,-1]=open_[:,-1]
    seen|=open_&~gate[box]
    while True:
        grown=seen.copy();grown[1:]|=seen[:-1];grown[:-1]|=seen[1:];grown[:,1:]|=seen[:,:-1];grown[:,:-1]|=seen[:,1:];grown&=open_
        if np.array_equal(grown,seen):break
        seen=grown
    fill=solid|(open_&~seen)
    out=field.copy();out[box]=np.maximum(out[box],np.where(fill,.8,0))
    return blur(out,1)


def texel_size(pos,fid):
    """Typical 3D length of one texel, measured inside faces."""
    same=(fid[:,1:]==fid[:,:-1])&(fid[:,1:]>=0)
    if not same.any():return 1e-3
    d=np.linalg.norm(pos[:,1:]-pos[:,:-1],axis=-1)[same]
    return float(np.median(d)) or 1e-3


def seam_close(ch,pos,where,cell):
    """Close a mask across UV seams: texels at the same 3D spot share their value.

    Blurs in texture space see empty texels past an island border, so a seam
    through the lips drew a skin line. Each texel takes max(own, mean of its 3D
    cell), on two offset grids; interiors stay as they were.
    """
    if not where.any():return ch
    P=pos[where];v=ch[where];best=np.zeros_like(v)
    for off in (0,.5):
        k=np.floor(P/cell+off).astype(np.int64)
        key=(k[:,0]*73856093)^(k[:,1]*19349663)^(k[:,2]*83492791)
        _,inv=np.unique(key,return_inverse=True);inv=inv.ravel()
        best=np.maximum(best,(np.bincount(inv,v)/np.bincount(inv))[inv])
    out=ch.copy();out[where]=np.maximum(v,best);return out


def lip_offset(lips,pos,known,center,width):
    """Sideways offset of the painted lips from the mouth centre, per row midpoint."""
    d=pos-center.astype(np.float32);on=known&(lips>.35)&(np.abs(d[...,0])<width)
    if on.sum()<50:return 0.0
    x=d[...,0][on];z=d[...,2][on];step=width*.02;mids=[]
    for zz in np.arange(z.min(),z.max(),step):
        s=(z>=zz)&(z<zz+step)
        if s.sum()>=8:mids.append((np.percentile(x[s],2)+np.percentile(x[s],98))/2)
    return float(np.median(mids)) if len(mids)>=3 else 0.0


def recentre_lips(lips,paint,image,pos,known,center,width,size):
    """Move off-centre painted lips (colour and mask) to the mouth centre, in 3D.

    Writes only the add-on's clean repaint; the character's image is untouched.
    """
    off=lip_offset(lips,pos,known,center,width)
    if abs(off)<width*.03 or paint is None:return lips,0.0
    from mathutils.kdtree import KDTree
    d=pos-center.astype(np.float32)
    region=known&(np.abs(d[...,0])<width*1.1)&(np.abs(d[...,2])<width*.6)&(d[...,1]<width*.5)
    ys,xs=np.nonzero(region);P=pos[ys,xs]
    tree=KDTree(len(P))
    for i,p in enumerate(P):tree.insert(p,i)
    tree.balance()
    src=core.resize_linear(core.image_linear(image),size,size)
    new=lips.copy();touched=np.zeros(lips.shape,np.float32)
    targets=region&(blur((lips>.02).astype(np.float32),max(2,size//512))>0)
    for y,x in zip(*np.nonzero(targets)):
        q=pos[y,x].copy();q[0]+=off
        _,j,dist=tree.find(q)
        if j is None or dist>width*.05:continue
        sy,sx=ys[j],xs[j];new[y,x]=lips[sy,sx]
        paint[y,x,:3]=src[sy,sx,:3];touched[y,x]=1
    # Opaque over old and new lip area, feathered outward into skin.
    alpha=np.clip(blur(np.maximum(lips,new)*touched*2,1)*1.5,0,1)*touched
    paint[...,3]=np.maximum(paint[...,3],alpha)
    # Island borders outside every face still get sampled by linear filtering:
    # bleed the moved lips there, or the unmoved texels draw a seam line.
    r=max(2,size//512);w=blur(touched,r);edge=(touched==0)&(w>1e-3)
    for i in range(4):
        spread=blur(paint[...,i]*touched,r)/np.maximum(w,1e-6)
        paint[...,i]=np.where(edge,spread if i<3 else np.maximum(paint[...,3],spread),paint[...,i])
    new=np.where(edge&~known,blur(new*touched,r)/np.maximum(w,1e-6),new)
    return new.astype(np.float32),off


def geometric_lips(pos,fid,center,width):
    """No lip colour available: a soft lens fitted to the mouth, upper lip thinner."""
    d=pos-center.astype(np.float32);x=d[...,0]/(width*.5);z=d[...,2]/width
    side=np.clip(1-x*x,0,1)**.6
    bow=1-.28*np.exp(-(x/.16)**2)
    upper=.15*side*bow;lower=.2*side
    inside=np.where(z>=0,z/np.maximum(upper,1e-4),-z/np.maximum(lower,1e-4))
    field=np.where((fid>=0)&(np.abs(x)<1.05)&(d[...,1]<width*.6),.5+(1-inside)*.8,0)
    return np.clip(field,0,1).astype(np.float32)


def stains(field,L,a,b,ref,pos,allowed,center,width,size):
    """Texels to cover: pale rims beside the skin and thin dark marks inside it.

    Eyes, brows and the mouth keep their paint: thin-mark closing skips a band across
    the eyes and the mouth box, and the rim test refuses anything clearly dark.
    """
    solid=(field>.5).astype(np.float32);reach=max(2,size//340)
    rim=(blur(solid,reach)>.06)&(field<.9)&(L>ref[0]-34)&(skin_distance(a,b,ref)<30)
    closed=blur(solid,max(3,size//170))>.5
    keep=np.zeros((size,size),bool)
    if center is not None:
        d=pos-center.astype(np.float32)
        mouth=(np.abs(d[...,0])<width*.8)&(np.abs(d[...,2])<width*.35)
        eyes=(d[...,2]>width*.65)&(d[...,2]<width*1.9)&(np.abs(d[...,0])<width*1.5)
        keep=mouth|eyes
    return ((rim|closed)&allowed&~keep|rim&allowed&~(keep&(L<ref[0]-20))).astype(np.float32)


def islands(ob,table,area,usable):
    """Majority colour of every UV island: clothes and skin never share one."""
    faces=[np.array(i['faces'],np.int32) for i in core.geometry(ob)['islands'].values()]
    owner=np.full(len(table),-1,np.int32);D=np.zeros((len(faces),3),np.float32);share=np.zeros(len(faces),np.float32)
    for n,part in enumerate(faces):
        part=part[usable[part]]
        if not len(part):continue
        owner[part]=n;c=table[part];w=area[part]
        q=np.floor(c/np.array([8,6,6],np.float32)).astype(np.int32)
        keys=q[:,0]*10000+(q[:,1]+50)*100+q[:,2]+50
        unique,inverse=np.unique(keys,return_inverse=True)
        top=c[inverse==int(np.argmax(np.bincount(inverse,w)))]
        D[n]=np.median(top,0)
        near=np.sqrt(((c-D[n])**2*np.array([.25,1,1],np.float32)).sum(1))<14
        share[n]=w[near].sum()/max(w.sum(),1e-9)
    return owner,D,share


def island_links(ob,owner):
    """Pairs of UV islands that meet along a mesh edge."""
    me=ob.data;nf=len(me.polygons)
    edge=np.empty(len(me.loops),np.int32);me.loops.foreach_get('edge_index',edge)
    total=np.empty(nf,np.int32);me.polygons.foreach_get('loop_total',total)
    faces=np.repeat(np.arange(nf),total);order=np.argsort(edge,kind='stable');e=edge[order];f=faces[order]
    same=e[1:]==e[:-1];a=owner[f[:-1][same]];b=owner[f[1:][same]]
    use=(a>=0)&(b>=0)&(a!=b)
    return a[use],b[use]


def repaint(L,a,b,known,where,owner,rest,D,clear,held):
    """Outlier texels of a clear island take its majority colour."""
    picked=owner[where];good=known&rest[where]&(picked>=0)&clear[np.maximum(picked,0)]
    use=np.maximum(picked,0)
    dist=np.sqrt((.5*(L-D[use,0]))**2+(a-D[use,1])**2+(b-D[use,2])**2)
    alpha=np.clip((dist-13)/7,0,1)*good*(1-held)
    colors=np.array([core.to_linear(np.clip(lab_to_srgb(d),0,1)) for d in D],np.float32)
    return blur(alpha.astype(np.float32),1),colors[use]


def eye_guard(L,a,b,pos,known,center,width,ref,head):
    """A soft oval on each eye, measured from its darks and whites, never a fixed box."""
    d=pos-center.astype(np.float32);chroma=np.hypot(a,b);tone=np.hypot(ref[1],ref[2])
    band=known&(d[...,2]>width*.5)&(d[...,2]<width*2.2)&(np.abs(d[...,0])<head*.5)&(d[...,1]<width*1.5)
    marks=band&((L<ref[0]-25)|((chroma<.35*tone)&(L>ref[0]-5)))
    out=np.zeros(L.shape,np.float32);center_=np.zeros(L.shape,np.float32);spots=[]
    for side in (d[...,0]<0,d[...,0]>=0):
        part=marks&side
        if part.sum()<10:continue
        z=d[...,2];top=np.percentile(z[part],92);eye=part&(z<top-.3*width)
        if eye.sum()<10:eye=part
        cx=np.median(d[...,0][eye]);cz=np.median(z[eye])
        rx=min(1.2*np.percentile(np.abs(d[...,0][eye]-cx),88),head*.17);rz=min(1.4*np.percentile(np.abs(z[eye]-cz),95),head*.12)
        spots.append((float(cx),float(cz)))
        q=((d[...,0]-cx)/max(rx,1e-4))**2+((z-cz)/max(rz,1e-4))**2
        out=np.maximum(out,np.clip(1.6*(1-q),0,1));center_=np.maximum(center_,np.clip(4*(1-q/.45),0,1))
    return out,center_,spots


def brows(L,a,b,pos,allowed,eyes,center,spots,ref,head,loose):
    """One clean colour per brow painted on the face, only just above its own eye.

    A brow with its own island is a mesh of its own: what lies under it is plain skin.
    """
    d=pos-center.astype(np.float32);size=L.shape[0]
    alpha=np.zeros((size,size),np.float32);rgb=np.zeros((size,size,3),np.float32);attached=0
    for cx,cz in spots:
        o=loose-center.astype(np.float32)
        if ((np.abs(o[:,0]-cx)<head*.18)&(o[:,2]>cz)&(o[:,2]<cz+head*.22)).sum()>=8:continue
        brow=allowed&(L<ref[0]-25)&(eyes<.2)&(d[...,1]<head*.25)&(np.abs(d[...,0]-cx)<head*.18)&(d[...,2]>cz)&(d[...,2]<cz+head*.22)
        if brow.sum()<20:continue
        attached+=1
        deep=brow&(L<=np.median(L[brow]))
        color=core.to_linear(np.clip(lab_to_srgb(np.array([np.median(L[deep]),np.median(a[deep]),np.median(b[deep])])),0,1))
        soft=np.clip(blur(brow.astype(np.float32),1)*2,0,1)
        rgb=np.where((soft>alpha)[...,None],np.array(color,np.float32),rgb);alpha=np.maximum(alpha,soft)
    return alpha,rgb,attached


def detect(object_name=None):
    ob=core.target(object_name);me=ob.data;slot=main_slot(ob);mat=ob.material_slots[slot].material
    image=source_image(mat)
    # 2K is enough: the mask is soft and lips keep the native texels under it.
    size=min(max(image.size),2048) if image else 2048
    fid,pos,co,vert=raster(ob,size);nf=len(me.polygons)
    centers=np.empty(nf*3,np.float32);me.polygons.foreach_get('center',centers);centers=centers.reshape(-1,3)
    area=np.empty(nf,np.float32);me.polygons.foreach_get('area',area)
    index=np.empty(nf,np.int32);me.polygons.foreach_get('material_index',index)
    # Exact face fills move faces to their own slots: skin is judged on the base slot.
    base=core.state(ob).get('exact_base_slots')
    if base and len(base)==nf:index=np.asarray(base,np.int32)
    normals=np.empty(nf*3,np.float32);me.polygons.foreach_get('normal',normals);normals=normals.reshape(-1,3)
    named=excluded_faces(ob);grouped=bool(named.any());valid=(index==slot)&~named
    height=float(np.ptp(co[:,2])) or 1.0;top=float(co[:,2].max());bottom=float(co[:,2].min())
    known=fid>=0
    if image:
        rgb=core.to_srgb(core.resize_linear(core.image_linear(image),size,size)[...,:3])
        tex=lab(np.clip(rgb,0,1)).astype(np.float32);del rgb
        L,a,b=tex[...,0],tex[...,1],tex[...,2]
        count=np.maximum(np.bincount(fid[known],minlength=nf),1)
        table=np.stack([np.bincount(fid[known],tex[...,i][known],nf)/count for i in range(3)],1)
        # Hair leaves first; a named hair group has already done it.
        hair=np.zeros(nf,bool) if grouped else hair_faces(ob,table,centers,normals,valid,height);valid=valid&~hair
        ref=skin_reference(table,area,centers,normals,valid,height)
        if ref is None:raise ValueError('La textura no tiene ningún color de piel reconocible en la cara.')
    else:ref=None;hair=np.zeros(nf,bool)
    textured=ref is not None
    if textured:
        distance=skin_distance(table[:,1],table[:,2],ref)
        like=valid&(distance<15)&(table[:,0]>ref[0]-32)
    else:like=valid.copy()
    label=components(ob,like)
    weight=np.bincount(label[like],area[like],nf);minimum=area[valid].sum()*.0006
    skin=like&(weight[label]>=minimum)
    if textured:
        # A real patch of skin holds colours close to the reference, not only pale ones.
        core_faces=like&(np.hypot(table[:,1]-ref[1],table[:,2]-ref[2])<12)
        share=np.bincount(label[like],area[like]*core_faces[like],nf)/np.maximum(weight,1e-9)
        skin&=share[label]>=.3
    if not skin.any():raise ValueError('No se encontró piel visible en este personaje.')
    # Body fractions. Hands hang below the hips in an A-pose: arms test first.
    z=(centers[:,2]-bottom)/height;x=np.abs(centers[:,0])/height
    zone=np.where(z>.70,0,np.where((x>.13)&(z>.3),2,np.where(z<.46,3,1)))
    center,width,anchor=mouth_anchor(ob,centers[skin],height)
    if textured and anchor!='rig':
        found,lips_width=locate_mouth(L,a,pos,fid,centers,skin,height,bottom)
        if found is not None:center,width,anchor=found,lips_width,'color'
    paint=None;attached=0;bare=np.zeros((size,size),bool)
    if center is not None:
        # Measured from the mouth: a rest mesh need not stand at the posed height.
        crown=centers[:,2]>center[2]-width*.6
        zone=np.where(centers[:,2]>center[2]-width*2,0,zone)
    if textured and center is not None:
        off=centers-center.astype(np.float32)
        mouth_f=(np.abs(off[:,0])<width*.8)&(np.abs(off[:,2])<width*.35)
        eyes_f=(off[:,2]>width*.6)&(off[:,2]<width*2)&(np.abs(off[:,0])<width*1.05)&(off[:,1]<width*1.5)
        guard=mouth_f|eyes_f
        usable=index==slot
        owner,D,share=islands(ob,table,area,usable)
        clear=share>=.55
        # At island level pale is not enough: a warm white shirt must fail here.
        tone_=np.hypot(ref[1],ref[2])
        warm=clear&(np.hypot(D[:,1],D[:,2])>=.45*tone_)&(np.hypot(D[:,1]-ref[1],D[:,2]-ref[2])<.8*tone_)&(D[:,0]>ref[0]-32)
        # A clear island decides for all its faces; a mixed one keeps the strict test.
        seen=owner>=0;decided=seen&clear[np.maximum(owner,0)]
        # The skull continues the face across UV seams, however stained it is.
        like_area=np.bincount(owner[seen],(area*like)[seen],len(D));all_area=np.maximum(np.bincount(owner[seen],area[seen],len(D)),1e-9)
        high=np.bincount(owner[seen],(area*crown)[seen],len(D))/all_area
        left,right=island_links(ob,owner);part_skin=(like_area/all_area>=.1)&(high>.5)
        if grouped:
            # With hair in its own group, the rest of the head above the mouth can only be skin.
            above=np.bincount(owner[seen],(area*(centers[:,2]>center[2]))[seen],len(D))/all_area
            free=np.bincount(owner[seen],(area*valid)[seen],len(D))/all_area
            part_skin=part_skin|((above>.5)&(free>.5))
        for _ in range(4):
            near=np.zeros(len(D),bool);near[left[warm[right]]]=True;near[right[warm[left]]]=True
            warm=warm|(near&part_skin)
        near=np.zeros(len(D),bool);near[left[warm[right]]]=True;near[right[warm[left]]]=True
        clear=clear|warm
        decided=seen&clear[np.maximum(owner,0)]
        skin=(seen&warm[np.maximum(owner,0)])|(skin&~decided)|(skin&guard)
        rest=usable&~skin
        d=pos-center.astype(np.float32)
        head=float(np.ptp(centers[skin&crown][:,0])) if (skin&crown).any() else width*3
        eyes,eye_core,spots=eye_guard(L,a,b,pos,known,center,width,ref,head)
        mouth=((np.abs(d[...,0])<width*.8)&(np.abs(d[...,2])<width*.35)).astype(np.float32)
        # Only the eye itself is held: its lids and surroundings are skin to paint.
        mark=((L<ref[0]-25)|((np.hypot(a,b)<.35*np.hypot(ref[1],ref[2]))&(L>ref[0]-5)))
        held=np.maximum.reduce((blur(mouth,max(4,size//170)),(mark&(eyes>0)).astype(np.float32),eye_core))
        small=all_area<area[usable].sum()*.01
        alpha,rgb=repaint(L,a,b,known,np.where(known,fid,0),owner,rest,D,clear,held)
        cover=skin[np.where(known,fid,0)]&known
        brow_alpha,brow_rgb,attached=brows(L,a,b,pos,cover,eyes,center,spots,ref,head,centers[rest&crown&small[np.maximum(owner,0)]&seen])
        rgb=np.where((brow_alpha>alpha)[...,None],brow_rgb,rgb);alpha=np.maximum(alpha,brow_alpha)
        # Brow islands: the whole piece takes its own dark tone, no skin rim left.
        brow_ids=set()
        for cx,cz in spots:
            o=centers-center.astype(np.float32)
            box=rest&crown&seen&(np.abs(o[:,0]-cx)<head*.22)&(o[:,2]>cz+head*.04)&(o[:,2]<cz+head*.26)
            for i in np.unique(owner[box]):
                # A brow lies almost wholly above the eye: eyes and hair do not.
                if small[i] and box[owner==i].mean()>=.75:brow_ids.add(int(i))
        where_=np.where(known,fid,0)
        for i in brow_ids:
            faces=owner==i;c_=table[faces];deep=c_[c_[:,0]<=np.percentile(c_[:,0],40)]
            color=np.array(core.to_linear(np.clip(lab_to_srgb(np.median(deep,0)),0,1)),np.float32)
            texels=known&faces[where_];rgb[texels]=color;alpha=np.where(texels,1,alpha)
        # A brow of its own mesh leaves the face's painted brow under it: that is skin.
        bare=np.zeros(L.shape,bool);loose=centers[rest&crown&small[np.maximum(owner,0)]&seen]-center.astype(np.float32)
        # Islands whose own majority is skin; a brow mesh is dark through and through.
        tinted=(np.hypot(D[:,1]-ref[1],D[:,2]-ref[2])<.8*tone_)&(D[:,0]>ref[0]-32)
        body=usable&~hair&~named&seen&tinted[np.maximum(owner,0)]
        for cx,cz in spots:
            if ((np.abs(loose[:,0]-cx)<head*.18)&(loose[:,2]>cz)&(loose[:,2]<cz+head*.22)).sum()<8:continue
            bare|=known&body[where_]&(eye_core<.2)&(L<ref[0]-12)&(d[...,1]<head*.25)&(np.abs(d[...,0]-cx)<head*.2)&(d[...,2]>cz-head*.02)&(d[...,2]<cz+head*.24)
        skin[np.unique(fid[bare])]=True;alpha=np.where(bare,0,alpha)
        # Hair goes by island too: every head island of its colour, never a brow.
        if hair.any() or named.any():
            tone_hair=np.median(table[(hair|named)&usable],0) if ((hair|named)&usable).any() else None
            if tone_hair is not None:
                alike=(high>.5)&~warm&(np.hypot(D[:,1]-tone_hair[1],D[:,2]-tone_hair[2])<18)&(np.abs(D[:,0]-tone_hair[0])<25)
                for i in brow_ids:alike[i]=False
                hair=hair|(seen&alike[np.maximum(owner,0)])
        paint=(np.dstack((rgb,alpha)).astype(np.float32))
    gated=np.zeros(nf,bool);gated[skin]=True
    if textured:
        close=skin_distance(a,b,ref);tone=np.clip((21-close)/8,0,1)*np.clip((L-(ref[0]-38))/10,0,1)
        red=gated[np.where(known,fid,0)]&known
        field=tone*red
        if paint is not None:
            # Mixed head islands (brow and lid folds): their skin texels are skin too.
            where_=np.where(known,fid,0);mixed=seen&(~clear[np.maximum(owner,0)]|near[np.maximum(owner,0)])&crown&usable&~skin
            field=np.maximum(field,tone*(mixed[where_]&known))
        if paint is not None:
            field=(field*held+np.maximum(field,red.astype(np.float32))*(1-held))*(1-brow_alpha)
            field=np.maximum(field,np.clip(blur(bare.astype(np.float32),max(2,size//512))*3,0,1)*red)
    else:
        red=gated[np.where(known,fid,0)]&known;field=red.astype(np.float32)
    clean=stains(field,L,a,b,ref,pos,red,center,width,size) if textured else np.zeros((size,size),np.float32)
    lips=None;contrast=0;source='ninguno'
    if center is not None:
        if textured:lips,contrast=texture_lips(L,a,b,pos,fid,center,width,ref)
        if lips is not None and contrast>=5:source='textura'
        else:lips=geometric_lips(pos,fid,center,width);source='geometria'
    if lips is None:lips=np.zeros((size,size),np.float32)
    centred=0.0
    if source=='textura' and paint is not None:
        lips,centred=recentre_lips(lips,paint,image,pos,known,center,width,size)
    # Shading of the texture as a ratio, so baked folds survive any new colour.
    if textured:
        lum=(L+16)/116;base=(ref[0]+16)/116
        # Shadows may darken freely; a painted highlight would glow on darker skin.
        light=np.clip(.5*(lum/base)**3,0,.56)
        light=blur(light,max(1,size//1024))
        if paint is not None:
            # Around eyes and brows the texture's light is the very halo to remove.
            calm=(paint[...,3]>.5)|(blur(brow_alpha,max(4,size//170))>.02)|(eyes>0)|(blur(bare.astype(np.float32),max(4,size//170))>.02)
            light=np.where(calm,.5,light)
    else:light=np.full((size,size),.5,np.float32)
    blush=np.zeros((size,size),np.float32)
    if center is not None:
        d=pos-center.astype(np.float32)
        for cx,cz,rx,rz,w in ((.95,.55,.55,.42,1),(-.95,.55,.55,.42,1),(0,.95,.28,.3,.7)):
            blush=np.maximum(blush,w*np.exp(-((d[...,0]/width-cx)/rx)**2-((d[...,2]/width-cz)/rz)**2))
    _cache[ob.name]={'pos':pos,'texel':texel_size(pos,fid),'field':field.astype(np.float32),'lips':lips,'light':light.astype(np.float32),'blush':blush,'fid':fid,'zone':zone,'skin':skin,'valid':valid,'size':size,'known':known,'clean':clean,'paint':paint,'cejas_piel':bare,'hair':hair|(named&excluded_faces(ob,r'cabello|hair|pelo'))}
    names=sorted({ZONES[i] for i in zone[skin]},key=ZONES.index)
    data={'slot':slot,'material':mat.name,'image':image.name if image else None,'size':size,'zonas':names,'labios':source,'contraste_labios':round(float(contrast),2),'anclaje_boca':anchor,'color_detectado':(core.to_linear(np.clip(lab_to_srgb(ref),0,1)).tolist() if textured else None),'caras_piel':int(skin.sum()),'caras_pelo_apartadas':int((hair|named).sum()),'cejas_unidas':int(attached),'altura':height,'labios_centrado_mm':round(-centred*1000,2)}
    return ob,data


def lab_to_srgb(v):
    fy=(v[0]+16)/116;fx=fy+v[1]/500;fz=fy-v[2]/200
    g=lambda t:t**3 if t**3>.008856 else (t-16/116)/7.787
    x,y,z=.95047*g(fx),g(fy),1.08883*g(fz)
    c=np.array([3.2406*x-1.5372*y-.4986*z,-.9689*x+1.8758*y+.0415*z,.0557*x-.204*y+1.057*z])
    c=np.clip(c,0,1);return np.where(c>.0031308,1.055*c**(1/2.4)-.055,12.92*c)


def write_mask(ob,zones=None):
    """Compose the zones the user left on into the channel-packed mask image."""
    cache=_cache[ob.name];size=cache['size']
    on=np.array([zones is None or z in zones for z in ZONES])
    faces=cache['skin']&on[cache['zone']]
    allowed=faces[np.where(cache['known'],cache['fid'],0)]&cache['known']
    base=np.maximum(cache['field'],cache['clean']) if ob.sstp_piel.limpiar else cache['field']
    skin=base*allowed
    # Lip faces are too red to pass as skin: only the zone switch limits them.
    head=cache['zone'][np.where(cache['known'],cache['fid'],0)]==0
    lip_ok=cache['known']&on[0]&head&cache['valid'][np.where(cache['known'],cache['fid'],0)]
    cell=cache['texel']*3
    # Seams cut through texture-space blurs: close lips and skin in 3D.
    lips=seam_close(cache['lips'],cache['pos'],lip_ok,cell)*lip_ok
    feather=max(1,size//1024)
    soft=blur(skin.astype(np.float32),feather)
    # Opaque up to the edge: any partial value lets the old texture show through.
    keep=np.maximum.reduce((soft,skin,np.clip(lips*2,0,1)*allowed))
    keep=seam_close(keep,cache['pos'],allowed,cell)*allowed
    # A covered mark must not come back as shadow through the texture light.
    light=np.where((lips>.35)|((cache['clean']>0)&ob.sstp_piel.limpiar),.5,cache['light'])
    out=np.stack((keep,lips,light,cache['blush']*skin),-1).astype(np.float32)
    # Outward bleed so linear filtering at seams never samples an empty neighbour.
    weight=blur((keep>0).astype(np.float32),2)
    out=np.where((keep>0)[...,None],out,np.dstack([blur(out[...,i]*(keep>0),2)/np.maximum(weight,1e-3) for i in range(4)]))
    name=ob.name+' · Piel máscara';image=bpy.data.images.get(name)
    if image is None or tuple(image.size)!=(size,size):
        if image:bpy.data.images.remove(image)
        image=bpy.data.images.new(name,size,size,alpha=True,float_buffer=False)
    image.colorspace_settings.name='Non-Color';image.alpha_mode='CHANNEL_PACKED'
    image.pixels.foreach_set(out.astype(np.float32).ravel());image.update();image.pack()
    return image


def paint_image(ob):
    """Region repaint in its own image; the character's texture is never written."""
    paint=_cache[ob.name]['paint'];name=ob.name+' · Piel limpia';image=bpy.data.images.get(name)
    size=_cache[ob.name]['size']
    if image is None or tuple(image.size)!=(size,size):
        if image:bpy.data.images.remove(image)
        image=bpy.data.images.new(name,size,size,alpha=True,float_buffer=True)
    image.colorspace_settings.name='Linear Rec.709';image.alpha_mode='CHANNEL_PACKED'
    data=paint if paint is not None else np.zeros((size,size,4),np.float32)
    image.pixels.foreach_set(data.ravel());image.update();image.pack()
    return image


def unhook(mat):
    """Give Base Color (or the paint layers above it) back its source before the layer's nodes go."""
    nt=mat.node_tree;mix=nt.nodes.get('Piel Limpia Mezcla')
    if not mix:return
    first=next(s for s in mix.inputs if s.type=='RGBA' and s.name=='A')
    out=next(s for s in mix.outputs if s.type=='RGBA')
    for link in list(out.links):
        target=link.to_socket
        if link.to_node.get('sstp_piel'):continue
        if first.is_linked:nt.links.new(first.links[0].from_socket,target)
        else:nt.links.remove(link);target.default_value=first.default_value


def insert_clean(nt,prev):
    """Place the clean repaint right over the protected base; paint layers go above it."""
    mix=nt.nodes.get('Piel Limpia Mezcla')
    if not mix or not mix.get('sstp_piel'):return prev
    nt.links.new(prev,next(s for s in mix.inputs if s.type=='RGBA' and s.name=='A'))
    return next(s for s in mix.outputs if s.type=='RGBA')


def lip_guard(nt,alpha):
    """Lip protector for paint layers: alpha × (1 − lip edge).

    Fills, brushes and erasers write layer pixels; with the protector on none of
    them may show over the lips. The edge is 0 when the protector is off.
    """
    edge=nt.nodes.get('Piel Borde Labios')
    if edge is None:return alpha
    inv=nt.nodes.new('ShaderNodeMath');inv.operation='SUBTRACT';inv.use_clamp=True;inv.inputs[0].default_value=1
    inv['sstp']=True;inv.label='Protector Labios';nt.links.new(edge.outputs[0],inv.inputs[1])
    m=nt.nodes.new('ShaderNodeMath');m.operation='MULTIPLY';m.use_clamp=True;m['sstp']=True;m.label='Protector Labios'
    nt.links.new(alpha,m.inputs[0]);nt.links.new(inv.outputs[0],m.inputs[1])
    return m.outputs[0]


def cover(nt,alphas):
    """Painted texels show the painted Principled color instead of the skin shader.

    «Piel Mezcla» picks the skin shader where the mask is red; without this the
    3D/UV brush wrote pixels that were never visible on skin.
    """
    mix=nt.nodes.get('Piel Mezcla');sep=nt.nodes.get('Piel Canales')
    if not mix or not sep:return
    for n in list(nt.nodes):
        if n.get('sstp_piel_cubre'):nt.nodes.remove(n)
    red=sep.outputs['Red']
    if not alphas:nt.links.new(red,mix.inputs[0]);return
    def add(op):
        n=nt.nodes.new('ShaderNodeMath');n.operation=op;n.use_clamp=True;n.label='Piel Pintura'
        n['sstp']=True;n['sstp_piel']=True;n['sstp_piel_cubre']=True;n.location=(-600,-900);return n
    total=alphas[0]
    for a in alphas[1:]:
        m=add('MAXIMUM');nt.links.new(total,m.inputs[0]);nt.links.new(a,m.inputs[1]);total=m.outputs[0]
    keep=add('SUBTRACT');keep.inputs[0].default_value=1;nt.links.new(total,keep.inputs[1])
    factor=add('MULTIPLY');factor.name='Piel Pintura Factor';nt.links.new(red,factor.inputs[0]);nt.links.new(keep.outputs[0],factor.inputs[1])
    nt.links.new(factor.outputs[0],mix.inputs[0])


def cover_constant(nt,alpha):
    """Face-fill materials: a fill of this alpha shows instead of the skin shader."""
    mix=nt.nodes.get('Piel Mezcla')
    if not mix or alpha<=0:return
    keep=nt.nodes.new('ShaderNodeMath');keep.operation='MULTIPLY';keep.use_clamp=True
    keep.name='Piel Relleno Caras';keep.label='Piel Relleno Caras';keep['sstp_piel']=True;keep.location=(-400,-900)
    keep.inputs[1].default_value=1-float(alpha)
    edge=nt.nodes.get('Piel Borde Labios')
    if edge is not None:
        # Protected lips keep the skin shader, as on unfilled faces: 1−α+α·edge.
        lip=nt.nodes.new('ShaderNodeMath');lip.operation='MULTIPLY_ADD';lip.use_clamp=True
        lip['sstp_piel']=True;lip.label='Piel Relleno Labios'
        nt.links.new(edge.outputs[0],lip.inputs[0]);lip.inputs[1].default_value=float(alpha);lip.inputs[2].default_value=1-float(alpha)
        nt.links.new(lip.outputs[0],keep.inputs[1])
    if mix.inputs[0].is_linked:nt.links.new(mix.inputs[0].links[0].from_socket,keep.inputs[0])
    else:keep.inputs[0].default_value=mix.inputs[0].default_value
    nt.links.new(keep.outputs[0],mix.inputs[0])


def _slot_ok(ob,slot):
    return active(ob) and int(slot)==info(ob)['slot']


def _texel(image,u,v):
    w,h=image.size;x=min(w-1,max(0,int(u*w)));y=min(h-1,max(0,int(v*h)));i=(y*w+x)*4
    return np.array(image.pixels[i:i+4],np.float32)


def clean(ob,slot,a):
    """Apply the clean repaint to a linear RGBA array of the base, as the shader does."""
    limpia=bpy.data.images.get(ob.name+' · Piel limpia')
    if not _slot_ok(ob,slot) or limpia is None or not ob.sstp_piel.limpiar:return a
    h,w=a.shape[:2];c=core.resize_linear(core.pixels(limpia),w,h);f=c[...,3:4]
    out=a.copy();out[...,:3]=out[...,:3]*(1-f)+c[...,:3]*f
    return out


def clean_at(ob,slot,u,v,rgb):
    limpia=bpy.data.images.get(ob.name+' · Piel limpia')
    if not _slot_ok(ob,slot) or limpia is None or not ob.sstp_piel.limpiar:return rgb
    c=_texel(limpia,u,v);return np.asarray(rgb,np.float32)*(1-c[3])+c[:3]*c[3]


def skin_at(ob,slot,u,v,rgb,cover=0.0,under=None):
    """Color seen at a UV point where the skin shader decides the surface.

    under is the cleaned original under the paint: the lips are tinted from it.
    """
    mask=bpy.data.images.get(ob.name+' · Piel máscara')
    n=nodes(ob) if _slot_ok(ob,slot) else None
    if mask is None or n is None or not n.get('Piel'):return rgb
    px=_texel(mask,u,v);m=float(px[0])*(1-float(cover))
    skin=np.array(n['Piel'].inputs['Color Base'].default_value[:3],np.float32)
    edge=n.get('Piel Borde Labios');tone=n.get('Piel Labios Tono');tint=n.get('Piel Color Labios')
    if edge and tone and tint:
        lo,hi=edge.inputs['From Min'].default_value,edge.inputs['From Max'].default_value
        e=float(np.clip((px[1]-lo)/max(hi-lo,1e-6),0,1))
        col=lambda node,name:np.array(next(s for s in node.inputs if s.type=='RGBA' and s.name==name).default_value[:3],np.float32)
        base=np.asarray(rgb if under is None else under,np.float32)*col(tone,'B')
        f=float(tint.inputs['Factor'].default_value) if not tint.inputs['Factor'].is_linked else 0.0
        skin=skin*(1-e)+(base*(1-f)+col(tint,'B')*f)*e
    return np.asarray(rgb,np.float32)*(1-m)+skin*m


def install(ob,data,image):
    if core.state(ob).get('slots'):
        # Prepared characters show the painter's copy; the skin goes where it is seen.
        data['material']=ob.material_slots[data['slot']].material.name
    unhook(bpy.data.materials[data['material']])
    mat=bpy.data.materials[data['material']]
    if mat.users>1 and not mat.node_tree.nodes.get('Piel') and not core.state(ob).get('slots'):
        # Fake users keep Tripo's material; a shared one must stay as it was.
        data['material_original']=mat.name
        mat=mat.copy();mat.name=data['material']+' · Piel';ob.material_slots[data['slot']].material=mat;data['material']=mat.name
    elif active(ob):data['material_original']=info(ob).get('material_original')
    nt=mat.node_tree
    if not bpy.data.node_groups.get(GROUP):
        with bpy.data.libraries.load(str(ASSET),link=False) as (src,dst):dst.node_groups=[GROUP]
    for n in list(nt.nodes):
        if n.get('sstp_piel'):nt.nodes.remove(n)
    shader=shader_of(mat);output=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)

    def add(kind,name):
        n=nt.nodes.new(kind);n.name=name;n.label=name;n['sstp_piel']=True;return n
    uv=add('ShaderNodeUVMap','Piel UV');uv.uv_map=ob.data.uv_layers.active.name
    tex=add('ShaderNodeTexImage','Piel Mascara');tex.image=image;tex.interpolation='Linear';nt.links.new(uv.outputs[0],tex.inputs['Vector'])
    sep=add('ShaderNodeSeparateColor','Piel Canales');nt.links.new(tex.outputs['Color'],sep.inputs[0])
    group=add('ShaderNodeGroup','Piel');group.node_tree=bpy.data.node_groups[GROUP]
    coord=add('ShaderNodeTexCoord','Piel Coordenadas')
    scale=add('ShaderNodeVectorMath','Piel Escala');scale.operation='MULTIPLY'
    nt.links.new(coord.outputs['Generated'],scale.inputs[0])
    # Generated follows the undeformed mesh, so skin never swims when the rig moves.
    scale.inputs[1].default_value=[v*2*1.7/data['altura'] for v in ob.data.texspace_size]
    nt.links.new(scale.outputs[0],group.inputs['Vector'])
    edge=add('ShaderNodeMapRange','Piel Borde Labios');nt.links.new(sep.outputs['Green'],edge.inputs['Value'])
    adapt=add('ShaderNodeMix','Piel Labios Tono');adapt.data_type='RGBA';adapt.blend_type='MULTIPLY';adapt.inputs['Factor'].default_value=1
    tint=add('ShaderNodeMix','Piel Color Labios');tint.data_type='RGBA'
    nt.links.new(next(s for s in adapt.outputs if s.type=='RGBA'),next(s for s in tint.inputs if s.type=='RGBA' and s.name=='A'))
    source=shader.inputs['Base Color'].links[0].from_socket if shader.inputs['Base Color'].is_linked else None
    clean=add('ShaderNodeTexImage','Piel Limpia');clean.image=paint_image(ob);nt.links.new(uv.outputs[0],clean.inputs['Vector'])
    strength=add('ShaderNodeMath','Piel Limpia Fuerza');strength.operation='MULTIPLY';nt.links.new(clean.outputs['Alpha'],strength.inputs[0])
    mix=add('ShaderNodeMix','Piel Limpia Mezcla');mix.data_type='RGBA';nt.links.new(strength.outputs[0],mix.inputs['Factor'])
    first=next(s for s in mix.inputs if s.type=='RGBA' and s.name=='A')
    if source:nt.links.new(source,first)
    else:first.default_value=shader.inputs['Base Color'].default_value
    nt.links.new(clean.outputs['Color'],next(s for s in mix.inputs if s.type=='RGBA' and s.name=='B'))
    out=next(s for s in mix.outputs if s.type=='RGBA')
    nt.links.new(out,shader.inputs['Base Color']);nt.links.new(out,next(s for s in adapt.inputs if s.type=='RGBA' and s.name=='A'))
    nt.links.new(next(s for s in tint.outputs if s.type=='RGBA'),group.inputs['Color Lips'])
    nt.links.new(edge.outputs[0],group.inputs['Color Lips_MASK'])
    nt.links.new(sep.outputs['Blue'],group.inputs['Luz Textura'])
    bare=add('ShaderNodeMath','Piel Sin Labios');bare.operation='SUBTRACT';bare.use_clamp=True
    nt.links.new(sep.outputs['Red'],bare.inputs[0]);nt.links.new(edge.outputs[0],bare.inputs[1])
    for name in ('Pores_MASK','Freckles_MASK','Pimples Mask'):nt.links.new(bare.outputs[0],group.inputs[name])
    blush=add('ShaderNodeMath','Piel Rubor');blush.operation='MULTIPLY';nt.links.new(tex.outputs['Alpha'],blush.inputs[0])
    nt.links.new(blush.outputs[0],group.inputs['Color Red_MASK'])
    mix=add('ShaderNodeMixShader','Piel Mezcla');nt.links.new(sep.outputs['Red'],mix.inputs[0])
    nt.links.new(shader.outputs['BSDF'],mix.inputs[1]);nt.links.new(group.outputs['Output'],mix.inputs[2])
    nt.links.new(mix.outputs[0],output.inputs['Surface'])
    for i,n in enumerate((uv,tex,sep,edge,group,mix)):n.location=(-1400+i*260,-600)


def relink(ob):
    """A freshly installed layer sits over Base Color; on a prepared character the
    painter rebuild puts it under the paint layers and lets paint cover the skin."""
    if not active(ob) or not core.state(ob).get('slots'):return
    core.rebuild(ob)


def nodes(ob):
    mat=ob.material_slots[info(ob)['slot']].material
    return mat.node_tree.nodes if mat else None


def push(ob):
    """Copy panel values to shader inputs; live, no mask or material rebuild."""
    n=nodes(ob)
    if n is None or not n.get('Piel'):return
    p=ob.sstp_piel;g=n['Piel'];n['Piel Limpia Fuerza'].inputs[1].default_value=1 if p.limpiar else 0
    for prop,socket in INPUTS.items():g.inputs[socket].default_value=getattr(p,prop)
    for prop,socket in COLORS.items():g.inputs[socket].default_value=(*getattr(p,prop)[:3],1)
    color=np.array(p.color[:3]);warm=p.subtono*.08
    g.inputs['Color Base'].default_value=(*np.clip(color*(1+warm,1,1-warm),0,1),1)
    # Same red on dark skin reads as paint: blush follows the skin like the lips do.
    detected=info(ob).get('color_detectado')
    ratio=np.clip((color/np.maximum(detected,1e-3))**.75,.15,1.6) if detected else np.ones(3)
    g.inputs['Color Red'].default_value=(*np.clip(np.array(p.rubor_color[:3])*ratio,0,1),1)
    n['Piel Rubor'].inputs[1].default_value=p.rubor
    edge=n['Piel Borde Labios'];shift=p.labios_borde*.35
    # Painted lips fade into the skin; a hard edge would cut them out.
    edge.inputs['From Min'].default_value=.22-shift if p.proteger_labios else 2;edge.inputs['From Max'].default_value=.55-shift if p.proteger_labios else 3
    # Lips follow the skin's shift, so an unchanged colour leaves them exact.
    next(s for s in n['Piel Labios Tono'].inputs if s.type=='RGBA' and s.name=='B').default_value=(*ratio,1)
    tint=n['Piel Color Labios'];tint.inputs['Factor'].default_value=p.labios_fuerza if p.labios_modo=='COLOR' else 0
    next(s for s in tint.inputs if s.type=='RGBA' and s.name=='B').default_value=(*p.labios_color[:3],1)
    mask_view(ob,p.labios_ver)


def mask_view(ob,on):
    """Solid colors for the review only: skin, lips, everything else."""
    mat=ob.material_slots[info(ob)['slot']].material;nt=mat.node_tree;n=nt.nodes
    output=next(x for x in n if x.type=='OUTPUT_MATERIAL' and x.is_active_output)
    view=n.get('Piel Ver')
    if on:
        if view is None:
            view=nt.nodes.new('ShaderNodeEmission');view.name='Piel Ver';view['sstp_piel']=True
            combine=nt.nodes.new('ShaderNodeCombineColor');combine.name='Piel Ver Color';combine['sstp_piel']=True
            nt.links.new(n['Piel Borde Labios'].outputs[0],combine.inputs[0]);nt.links.new(n['Piel Canales'].outputs['Red'],combine.inputs[1]);nt.links.new(combine.outputs[0],view.inputs[0])
        nt.links.new(view.outputs[0],output.inputs['Surface'])
    else:nt.links.new(n['Piel Mezcla'].outputs[0],output.inputs['Surface'])


def apply_style(ob,style):
    p=ob.sstp_piel;p['updating']=True
    for key,value in STYLES[style].items():setattr(p,key,value)
    p['updating']=False


def start(object_name=None,hide=False):
    """Detect and install. Reuses the panel's values on a character already textured."""
    ob,data=detect(object_name);first=not active(ob)
    p=ob.sstp_piel;zones=[z for z in ZONES if z in data['zonas'] and (first or getattr(p,'zona_'+z))]
    image=write_mask(ob,zones);install(ob,data,image)
    ob['sstp_piel_info']=json.dumps(data,ensure_ascii=False)
    if first:
        p['updating']=True
        for z in ZONES:setattr(p,'zona_'+z,z in data['zonas'])
        if data['color_detectado']:p.color=data['color_detectado']
        p['updating']=False
        apply_style(ob,p.estilo)
    relink(ob);push(ob);hair_group(ob);hide_hair(ob,hide)
    return data


HIDE='SSTP Sin pelo'


def hair_group(ob):
    """Verts kept when hair is hidden; exports and the mesh are not affected."""
    me=ob.data;hair=_cache[ob.name]['hair'];keep=np.zeros(len(me.vertices),bool)
    total=np.empty(len(me.polygons),np.int32);me.polygons.foreach_get('loop_total',total)
    verts=np.empty(len(me.loops),np.int32);me.loops.foreach_get('vertex_index',verts)
    keep[verts[np.repeat(~hair,total)]]=True
    group=ob.vertex_groups.get(HIDE)
    if group:ob.vertex_groups.remove(group)
    ob.vertex_groups.new(name=HIDE).add(np.flatnonzero(keep).tolist(),1,'REPLACE')


def hide_hair(ob,on):
    mod=ob.modifiers.get(HIDE)
    if on and not mod and ob.vertex_groups.get(HIDE):
        mod=ob.modifiers.new(HIDE,'MASK');mod.vertex_group=HIDE
    elif mod and not on:ob.modifiers.remove(mod)


def zones_changed(ob):
    data=info(ob)
    if ob.name not in _cache:
        keep=json.loads(ob['sstp_piel_info']);_,fresh=detect(ob.name);ob['sstp_piel_info']=json.dumps({**keep,**{k:fresh[k] for k in ('size',)}},ensure_ascii=False)
    write_mask(ob,[z for z in ZONES if z in data['zonas'] and getattr(ob.sstp_piel,'zona_'+z)])


def remove(object_name=None):
    ob=core.target(object_name)
    if not active(ob):return {'ok':True,'removed':False,'saved_blend':False}
    data=info(ob);mat=ob.material_slots[data['slot']].material;nt=mat.node_tree;unhook(mat)
    for n in list(nt.nodes):
        if n.get('sstp_piel'):nt.nodes.remove(n)
    output=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
    nt.links.new(shader_of(mat).outputs['BSDF'],output.inputs['Surface'])
    for name in (ob.name+' · Piel máscara',ob.name+' · Piel horneada',ob.name+' · Piel relieve',ob.name+' · Piel limpia'):
        image=bpy.data.images.get(name)
        if image:bpy.data.images.remove(image)
    hide_hair(ob,False)
    if ob.vertex_groups.get(HIDE):ob.vertex_groups.remove(ob.vertex_groups[HIDE])
    original=bpy.data.materials.get(data.get('material_original') or '')
    if original:
        ob.material_slots[data['slot']].material=original
        if mat.users==0:bpy.data.materials.remove(mat)
    del ob['sstp_piel_info'];_cache.pop(ob.name,None)
    return {'ok':True,'removed':True,'saved_blend':False}


def has_relief(ob):
    p=ob.sstp_piel
    return any(getattr(p,n)>0 for n in ('poros','celulas','granitos_relieve','gallina'))


def bake(ob,kind='EMIT'):
    """Bake only the skin colour; everything outside the mask stays the exact original.

    A disposable mesh carries the bake so Mask modifiers, shape keys and the mouth
    interior slot cannot alter it. The source object is not selected or edited.
    """
    data=info(ob);mat=ob.material_slots[data['slot']].material;size=data['size']
    name=ob.name+(' · Piel horneada' if kind=='EMIT' else ' · Piel relieve');image=bpy.data.images.get(name)
    if image is None or tuple(image.size)!=(size,size):
        if image:bpy.data.images.remove(image)
        image=bpy.data.images.new(name,size,size,alpha=True,float_buffer=True)
    image.colorspace_settings.name='Linear Rec.709' if kind=='EMIT' else 'Non-Color'
    scene=bpy.context.scene;engine=scene.render.engine;samples=scene.cycles.samples
    selected=list(bpy.context.selected_objects);current=bpy.context.view_layer.objects.active
    copy=mat.copy();nt=copy.node_tree
    clone=ob.copy();clone.data=ob.data.copy();clone.animation_data_clear();clone.data.animation_data_clear()
    clone.modifiers.clear();clone.shape_key_clear()
    bpy.context.collection.objects.link(clone)
    try:
        for slot in clone.material_slots:slot.link='OBJECT';slot.material=copy
        output=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
        if kind=='EMIT':
            emission=nt.nodes.new('ShaderNodeEmission');nt.links.new(nt.nodes['Piel'].outputs['Base Color'],emission.inputs['Color'])
            nt.links.new(emission.outputs[0],output.inputs['Surface'])
        else:nt.links.new(nt.nodes['Piel'].outputs['Output'],output.inputs['Surface'])
        target=nt.nodes.new('ShaderNodeTexImage');target.image=image;nt.nodes.active=target;target.select=True
        for item in list(bpy.context.selected_objects):item.select_set(False)
        clone.select_set(True);bpy.context.view_layer.objects.active=clone
        scene.render.engine='CYCLES';scene.cycles.samples=1
        outcome=bpy.ops.object.bake(type=kind,normal_space='TANGENT',margin=8,use_clear=True,target='IMAGE_TEXTURES')
        if 'FINISHED' not in outcome:raise RuntimeError('No se pudo hornear la piel')
        image.pack()
    finally:
        scene.render.engine=engine;scene.cycles.samples=samples
        mesh=clone.data;bpy.data.objects.remove(clone,do_unlink=True);bpy.data.meshes.remove(mesh);bpy.data.materials.remove(copy)
        for item in selected:
            if item.name in bpy.context.view_layer.objects:item.select_set(True)
        bpy.context.view_layer.objects.active=current
    return image


def flatten(ob,slot,base,cover=None):
    """Export colour: baked skin over the (already cleaned) base, under the paint.

    core.export_color applies the clean repaint before the paint layers; cover is
    the painted alpha, which shows paint instead of skin exactly like the shader.
    """
    if not active(ob) or int(slot)!=info(ob)['slot']:return base
    h,w=base.shape[:2];image=bake(ob);mask=bpy.data.images[ob.name+' · Piel máscara']
    read=lambda im:core.resize_linear(core.pixels(im),w,h)
    skin=read(image);m=read(mask)[...,0:1]
    if cover is not None:m=m*(1-np.asarray(cover,np.float32)[...,None])
    out=base.copy()
    out[...,:3]=out[...,:3]*(1-m)+skin[...,:3]*m
    return out


def attach_relief(ob,mat,images):
    """glTF cannot run the bump nodes: skin relief travels as a normal map."""
    if not has_relief(ob):return
    baked=bake(ob,'NORMAL');mask=bpy.data.images[ob.name+' · Piel máscara']
    h,w=baked.size[1],baked.size[0]
    a=core.pixels(baked).copy();m=core.resize_linear(core.pixels(mask),w,h)[...,0:1]
    a[...,:3]=a[...,:3]*m+np.array([.5,.5,1],np.float32)*(1-m);a[...,3]=1
    image=bpy.data.images.new('SSTP GLB Relieve',w,h,alpha=False,float_buffer=False)
    image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(a.ravel());image.pack();images.append(image)
    nt=mat.node_tree;tex=nt.nodes.new('ShaderNodeTexImage');tex.image=image
    uv=nt.nodes.new('ShaderNodeUVMap');uv.uv_map=ob.data.uv_layers.active.name;nt.links.new(uv.outputs['UV'],tex.inputs['Vector'])
    normal=nt.nodes.new('ShaderNodeNormalMap');nt.links.new(tex.outputs['Color'],normal.inputs['Color'])
    nt.links.new(normal.outputs['Normal'],shader_of(mat).inputs['Normal'])


def status(object_name=None):
    ob=core.target(object_name)
    if not active(ob):return {'ok':True,'object':ob.name,'active':False,'saved_blend':False}
    p=ob.sstp_piel;data=info(ob)
    return {'ok':True,'object':ob.name,'active':True,'zonas':[z for z in data['zonas'] if getattr(p,'zona_'+z)],'zonas_detectadas':data['zonas'],'estilo':p.estilo,'labios':data['labios'],'labios_modo':p.labios_modo,'protector_labios':p.proteger_labios,'cejas_unidas':data.get('cejas_unidas',0),**({'aviso':'Las cejas están unidas a la malla. Deben ser islas separadas: pide al usuario quitarlas con cuidado; no se quitan automáticamente.'} if data.get('cejas_unidas') else {}),'saved_blend':False}


def agent_apply(object_name=None,style=None,tone=None,hex_color=None,subtone=None,blush=None,keep_texture=None,zones=None,lip_mode=None,lip_hex=None,lip_strength=None,lip_edge=None,features=None,clean=None):
    """One call for small agents: detect once, then adjust by name."""
    ob=core.target(object_name);before=core.fingerprint(ob)
    if tone is not None and tone not in TONES:return {'ok':False,'status':'needs_tone','tones':list(TONES),'saved_blend':False}
    if style is not None and style not in STYLES:return {'ok':False,'status':'needs_style','styles':list(STYLES),'saved_blend':False}
    unknown=sorted(set(features or {})-set(INPUTS))
    if unknown:return {'ok':False,'status':'needs_feature','unknown':unknown,'features':list(INPUTS),'saved_blend':False}
    data=info(ob) if active(ob) else start(ob.name)
    p=ob.sstp_piel
    if style:p.estilo=style
    if tone:p.color=hex_linear(TONES[tone])
    if hex_color:p.color=hex_linear(hex_color)
    for prop,value in (('subtono',subtone),('rubor',blush),('textura',keep_texture),('labios_modo',lip_mode),('labios_fuerza',lip_strength),('labios_borde',lip_edge)):
        if value is not None:setattr(p,prop,value)
    if lip_hex:p.labios_color=hex_linear(lip_hex)
    for key,value in (features or {}).items():setattr(p,key,value)
    if clean is not None:p.limpiar=clean
    if zones is not None:
        for z in ZONES:setattr(p,'zona_'+z,z in zones)
    push(ob);after=core.fingerprint(ob)
    if not all(before[k]==after[k] for k in ('vertices','edges','loops','faces','uv','shape_keys','modifiers','animation','shape_drivers')):
        raise RuntimeError('La comprobación de conservación falló.')
    return {**status(ob.name),'detectado':data,'mesh_unchanged':True}
