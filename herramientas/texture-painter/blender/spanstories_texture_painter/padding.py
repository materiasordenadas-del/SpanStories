"""Texture gutters without painting across another UV island (NumPy only)."""
import numpy as np

MARGIN = 16


def blend_rgb(base, layer, opacity):
    """Blend straight RGB in bounded working sets, retaining base alpha exactly.

    Keep the original float32 arithmetic order, including opacity zero and NaNs.
    Small row blocks avoid three full-atlas RGB temporaries on every brush update.
    """
    rows = max(1, 32768 // max(1, base.shape[1]))
    for start in range(0, base.shape[0], rows):
        a = base[start:start + rows]
        b = layer[start:start + rows]
        alpha = (b[..., 3] * opacity).clip(0, 1)
        inverse = 1 - alpha
        for channel in range(3):
            a[..., channel] = a[..., channel] * inverse + b[..., channel] * alpha
    return base


def gutter_indices(occupied, margin=MARGIN):
    """Map empty gutter pixels to nearby surface texels, never to another gutter.

    Every occupied texel is a seed, including unpainted neighboring islands.
    Competition therefore stops the gutter at their shared empty-space boundary.
    The result is independent of painting order and can be cached per UV layout.
    """
    h, w = occupied.shape
    if not occupied.any():
        empty = np.empty(0, np.intp)
        return empty, empty
    # Only empty texels within the square margin can ever receive a seed.
    # Separable box dilation costs two cumulative sums, instead of running
    # 16 x 8 distance passes over every on-surface texel of a 2K/4K atlas.
    def expand(mask,axis):
        pads=[(0,0),(0,0)];pads[axis]=(margin+1,margin)
        sums=np.cumsum(np.pad(mask,pads),axis=axis,dtype=np.int32)
        hi=[slice(None),slice(None)];lo=hi.copy()
        hi[axis]=slice(2*margin+1,None);lo[axis]=slice(None,-(2*margin+1))
        return (sums[tuple(hi)]-sums[tuple(lo)])>0
    near=expand(expand(occupied,0),1)&~occupied
    if not near.any():
        empty=np.empty(0,np.intp);return empty,empty
    yy,xx=np.nonzero(near);yy=yy.astype(np.int32);xx=xx.astype(np.int32)
    sy=np.full((h,w),-1,np.int32);sx=sy.copy()
    seed_y,seed_x=np.nonzero(occupied);sy[occupied]=seed_y;sx[occupied]=seed_x
    best=np.full(len(yy),margin*margin+1,np.int32)
    neighbors=[]
    for dy,dx in ((-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)):
        valid=np.flatnonzero((yy-dy>=0)&(yy-dy<h)&(xx-dx>=0)&(xx-dx<w))
        neighbors.append((valid,yy[valid]-dy,xx[valid]-dx))
    changed_seeds=occupied.copy()
    for _ in range(margin):
        old_y, old_x = sy.copy(), sx.copy()
        next_changed=np.zeros((h,w),bool)
        changed = False
        for valid,ny,nx in neighbors:
            # An unchanged source already competed in the preceding pass;
            # destination distances only decrease, so it cannot win later.
            active=changed_seeds[ny,nx]
            if not active.any():continue
            valid=valid[active];ny=ny[active];nx=nx[active]
            cy,cx=old_y[ny,nx],old_x[ny,nx]
            distance=(yy[valid]-cy)**2+(xx[valid]-cx)**2
            better=(cy>=0)&(distance<best[valid])&(distance<=margin*margin)
            if better.any():
                dest=valid[better]
                sy[yy[dest],xx[dest]]=cy[better]
                sx[yy[dest],xx[dest]]=cx[better]
                best[dest]=distance[better]
                next_changed[yy[dest],xx[dest]]=True
                changed = True
        if not changed:
            break
        changed_seeds=next_changed
    gutter = (~occupied) & (sy>=0)
    destination = np.flatnonzero(gutter)
    source = (sy[gutter]*w+sx[gutter]).astype(np.intp)
    return destination, source


def apply_gutter(data, indices):
    """Copy straight RGBA, including erasure; preserve all on-surface pixels."""
    destination, source = indices
    out = data.copy()
    flat = out.reshape(-1,4)
    flat[destination] = flat[source]
    return out
