"""Adaptive, self-contained web textures; work images are never modified."""
import json
import struct
import tempfile
from pathlib import Path
import bpy
import numpy as np
from . import core


def quality_error(original, smaller, surface_mask=None):
    """Compare reconstructed sRGB pixels, including small patches, in bounded RAM."""
    height,width=original.shape[:2];sh,sw=smaller.shape[:2]
    x=np.clip((np.arange(width)+.5)*sw/width-.5,0,sw-1)
    xi=x.astype(int);xj=np.minimum(xi+1,sw-1);fx=(x-xi).astype(np.float32)[None,:,None]
    squared=0.;count=0;worst_patch=0.;hist=np.zeros(256,np.int64)
    for start in range(0,height,64):
        end=min(height,start+64)
        y=np.clip((np.arange(start,end)+.5)*sh/height-.5,0,sh-1)
        yi=y.astype(int);yj=np.minimum(yi+1,sh-1);fy=(y-yi).astype(np.float32)[:,None,None]
        top=smaller[yi[:,None],xi[None,:],:3]*(1-fx)+smaller[yi[:,None],xj[None,:],:3]*fx
        bottom=smaller[yj[:,None],xi[None,:],:3]*(1-fx)+smaller[yj[:,None],xj[None,:],:3]*fx
        delta=np.abs(original[start:end,:,:3]-(top*(1-fy)+bottom*fy))
        error=np.mean(delta*delta,axis=2)
        valid=surface_mask[start:end] if surface_mask is not None else np.ones(error.shape,bool)
        squared+=float(error[valid].sum());count+=int(valid.sum())
        hist+=np.bincount(np.minimum(255,np.rint(delta.max(2)[valid]*255).astype(np.int32)),minlength=256)
        # Local tests prevent a small face/eye from disappearing in global averages.
        for y0 in range(0,end-start,16):
            for x0 in range(0,width,16):
                patch=error[y0:y0+16,x0:x0+16][valid[y0:y0+16,x0:x0+16]]
                if patch.size:worst_patch=max(worst_patch,float(patch.mean()))
    rmse=float(np.sqrt(squared/max(1,count)))
    p99=int(np.searchsorted(np.cumsum(hist),max(1,count*.99)))
    patch=float(np.sqrt(worst_patch))
    return {'rmse_255':round(rmse*255,4),'p99_255':p99,'patch_rmse_255':round(patch*255,4),
            'accepted':rmse<=2.5/255 and p99<=12 and patch<=8/255}


def adaptive_png(blob, suffix, surface_triangles=None):
    """Try power-of-two reductions; retain alpha masks and any failed detail test."""
    with tempfile.TemporaryDirectory(prefix='sstp-resolution-') as directory:
        source=Path(directory)/('source'+suffix);source.write_bytes(blob)
        image=bpy.data.images.load(str(source),check_existing=False)
        try:
            original=core.pixels(image).copy();height,width=original.shape[:2]
        finally:bpy.data.images.remove(image)
        row={'source_size':[width,height],'size':[width,height],'quality_tests':[],
             'reason':'native','resolution_changed':False}
        # Eyelashes, hair cards and other opacity edges retain native sampling.
        if np.any(original[...,3]<1):row['reason']='alpha_preserved';return None,row
        surface_mask=uv_surface_mask(surface_triangles,width,height) if surface_triangles is not None else None
        row['quality_scope']='UV surface' if surface_mask is not None else 'whole image'
        data=original;chosen=None
        while max(data.shape[:2])>512 and min(data.shape[:2])>=2:
            h,w=data.shape[:2]
            if h%2 or w%2:row['reason']='native_aspect_preserved';break
            # Area filtering in linear light, rather than dropping fine texels.
            linear=core.to_linear(data[:,:,:3])
            rgb=linear.reshape(h//2,2,w//2,2,3).mean(axis=(1,3))
            candidate=np.ones((h//2,w//2,4),np.float32);candidate[:,:,:3]=core.to_srgb(rgb)
            candidate=np.rint(np.clip(candidate,0,1)*255)/255
            metrics=quality_error(original,candidate,surface_mask)
            row['quality_tests'].append({'size':[w//2,h//2],**metrics})
            if not metrics['accepted']:row['reason']='detail_preserved';break
            chosen=candidate;data=candidate
        if chosen is None:return None,row
        # encoded_image expects linear RGB and writes an ordinary sRGB PNG.
        linear=chosen.copy();linear[:,:,:3]=core.to_linear(linear[:,:,:3])
        temporary=core.encoded_image('SSTP web resolution temporary',linear)
        try:
            destination=Path(directory)/'resized.png';temporary.file_format='PNG'
            temporary.filepath_raw=str(destination);temporary.save();result=destination.read_bytes()
        finally:bpy.data.images.remove(temporary)
        row.update(size=[chosen.shape[1],chosen.shape[0]],resolution_changed=True,
                   reason='smallest_verified' if row['reason']=='native' else row['reason'])
        return result,row


def uv_surface_mask(triangles,width,height):
    """Evaluate visible atlas texels, not unused padding or neighbouring islands."""
    mask=np.zeros((height,width),bool)
    for triangle in triangles:
        points=np.asarray(triangle,np.float64).copy();points[:,1]=1-points[:,1]
        a,b,c=points*np.array([width,height])
        low=np.maximum(np.floor(np.minimum(np.minimum(a,b),c)-.5).astype(int),0)
        high=np.minimum(np.ceil(np.maximum(np.maximum(a,b),c)-.5).astype(int),[width-1,height-1])
        xmin,ymin=low;xmax,ymax=high
        if xmax<xmin or ymax<ymin:continue
        det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        if abs(det)<1e-12:continue
        yy,xx=np.mgrid[ymin:ymax+1,xmin:xmax+1];xx=xx+.5;yy=yy+.5
        u=((xx-a[0])*(c[1]-a[1])-(yy-a[1])*(c[0]-a[0]))/det
        v=((b[0]-a[0])*(yy-a[1])-(b[1]-a[1])*(xx-a[0]))/det
        mask[ymin:ymax+1,xmin:xmax+1]|=(u>=-1e-8)&(v>=-1e-8)&(u+v<=1+1e-8)
    return mask if np.any(mask) else None


def color_surfaces(doc,binary,image_index):
    """Read standard triangle UV accessors. Unsupported mappings retain native size."""
    surfaces={};protected=set()
    def accessor(index):
        a=doc['accessors'][index]
        if 'sparse' in a or 'bufferView' not in a:raise ValueError('unsupported UV accessor')
        view=doc['bufferViews'][a['bufferView']]
        dtype=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']])
        width={'SCALAR':1,'VEC2':2}[a['type']]
        out=np.ndarray((a['count'],width),dtype=dtype,buffer=binary,
                       offset=view.get('byteOffset',0)+a.get('byteOffset',0),
                       strides=(view.get('byteStride',dtype.itemsize*width),dtype.itemsize))
        if a.get('normalized'):out=out.astype(np.float64)/np.iinfo(dtype).max
        return out
    for mesh in doc.get('meshes',[]):
        for primitive in mesh.get('primitives',[]):
            material=doc.get('materials',[])[primitive['material']] if 'material' in primitive else {}
            texture=material.get('pbrMetallicRoughness',{}).get('baseColorTexture')
            if not texture:continue
            image=image_index(doc['textures'][texture['index']])
            try:
                if primitive.get('mode',4)!=4 or texture.get('extensions'):raise ValueError('unsupported UV mapping')
                uv=accessor(primitive['attributes']['TEXCOORD_'+str(texture.get('texCoord',0))])
                if np.any(uv<0) or np.any(uv>1):raise ValueError('repeated UVs')
                indices=accessor(primitive['indices']).ravel() if 'indices' in primitive else np.arange(len(uv))
                surfaces.setdefault(image,[]).append(uv[indices.reshape(-1,3)])
            except (KeyError,ValueError):protected.add(image)
    return {i:np.concatenate(parts) for i,parts in surfaces.items() if i not in protected},protected


def lossless_webp(blob, suffix):
    """Accept compression only after Blender decodes identical RGBA samples."""
    with tempfile.TemporaryDirectory(prefix='sstp-web-') as directory:
        source=Path(directory)/('source'+suffix);source.write_bytes(blob)
        destination=Path(directory)/'lossless.webp'
        image=bpy.data.images.load(str(source),check_existing=False);decoded=None
        try:
            original=core.pixels(image).copy()
            # A clean loaded image may be copied verbatim despite file_format.
            # Mark only this disposable buffer dirty to force actual encoding.
            core.write_pixels(image,original)
            image.file_format='WEBP';image.filepath_raw=str(destination)
            image.save(quality=100)
            candidate=destination.read_bytes()
            if candidate[:4]!=b'RIFF' or candidate[8:12]!=b'WEBP':return None
            if len(candidate)>=len(blob):return None
            decoded=bpy.data.images.load(str(destination),check_existing=False)
            if tuple(decoded.size)!=tuple(image.size):return None
            if not np.array_equal(core.pixels(decoded),original):return None
            return candidate
        finally:
            if decoded:bpy.data.images.remove(decoded)
            bpy.data.images.remove(image)


def optimize_glb(filepath, auto_resolution=True):
    path=Path(filepath);raw=path.read_bytes()
    if raw[:4]!=b'glTF':raise ValueError('Archivo GLB inválido')
    length=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+length]);start=28+length
    binary=raw[start:]
    if len(doc.get('buffers',[]))!=1:raise ValueError('La optimización requiere un GLB autocontenido')
    replacements={};converted=set();rows=[]
    def image_index(texture):
        return texture.get('source',texture.get('extensions',{}).get('EXT_texture_webp',{}).get('source'))
    surfaces,protected=color_surfaces(doc,binary,image_index) if auto_resolution else ({},set())
    color_images=set();other_images=set();textures=doc.get('textures',[])
    for material in doc.get('materials',[]):
        base=material.get('pbrMetallicRoughness',{}).get('baseColorTexture')
        if base:color_images.add(image_index(textures[base['index']]))
        for info in (material.get('normalTexture'),material.get('occlusionTexture'),
                     material.get('emissiveTexture'),material.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')):
            if info:other_images.add(image_index(textures[info['index']]))
    for index,image in enumerate(doc.get('images',[])):
        if 'bufferView' not in image:continue
        view=doc['bufferViews'][image['bufferView']];offset=view.get('byteOffset',0)
        blob=binary[offset:offset+view['byteLength']]
        mime=image.get('mimeType','')
        resolution={};working=blob;working_mime=mime
        if auto_resolution and index in color_images-other_images-protected and mime in ('image/png','image/jpeg'):
            resized,resolution=adaptive_png(blob,'.png' if mime=='image/png' else '.jpg',surfaces.get(index))
            if resized:working=resized;working_mime='image/png'
        converted_blob=lossless_webp(working,'.png' if working_mime=='image/png' else '.jpg') if working_mime in ('image/png','image/jpeg') else None
        if converted_blob:
            replacements[image['bufferView']]=converted_blob;converted.add(index);image['mimeType']='image/webp'
        elif working is not blob:
            replacements[image['bufferView']]=working;image['mimeType']=working_mime
        rows.append({'image':index,'before_bytes':len(blob),'after_bytes':len(converted_blob or working),
                     'lossless':not resolution.get('resolution_changed',False),'encoding_lossless':True,**resolution})
    changed_resolution=any(r.get('resolution_changed') for r in rows)
    gpu_before=sum(r['source_size'][0]*r['source_size'][1]*4*4/3 for r in rows if 'source_size' in r)
    gpu_after=sum(r['size'][0]*r['size'][1]*4*4/3 for r in rows if 'size' in r)
    report={'images':rows,'webp_images':len(converted),'lossless':not changed_resolution,
            'resolution_changed':changed_resolution,'profile':'auto_web' if auto_resolution else 'native',
            'estimated_basecolor_gpu_bytes_before':round(gpu_before),'estimated_basecolor_gpu_bytes_after':round(gpu_after)}
    if not replacements:return {'before_bytes':len(raw),'after_bytes':len(raw),**report}
    for texture in doc.get('textures',[]):
        if texture.get('source') in converted:
            source=texture.pop('source')
            texture.setdefault('extensions',{})['EXT_texture_webp']={'source':source}
    if converted:
        for key in ('extensionsUsed','extensionsRequired'):
            if 'EXT_texture_webp' not in doc.setdefault(key,[]):doc[key].append('EXT_texture_webp')
    rebuilt=bytearray()
    for index,view in enumerate(doc['bufferViews']):
        offset=view.get('byteOffset',0)
        data=replacements.get(index,binary[offset:offset+view['byteLength']])
        rebuilt.extend(b'\0'*((-len(rebuilt))%4))
        view['byteOffset']=len(rebuilt);view['byteLength']=len(data);rebuilt.extend(data)
    doc['buffers'][0]['byteLength']=len(rebuilt)
    rebuilt.extend(b'\0'*((-len(rebuilt))%4))
    encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode()
    encoded+=b' '*((-len(encoded))%4)
    result=struct.pack('<4sII',b'glTF',2,12+8+len(encoded)+8+len(rebuilt))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(rebuilt),b'BIN\0')+rebuilt
    temporary=path.with_suffix('.sstp-web-tmp');temporary.write_bytes(result);temporary.replace(path)
    return {'before_bytes':len(raw),'after_bytes':len(result),**report}
