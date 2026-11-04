// Relieve del lugar: cuadrícula DEM -> muestreo bilineal en metros locales (X este, Z sur, Y arriba).
export class Terrain{
  constructor({width,depth,resolution,heights,origin=null,flat=false}){
    this.width=width;this.depth=depth;this.n=resolution;
    this.origin=origin??heights.reduce((lo,value)=>Math.min(lo,value),Infinity);
    this.h=Float32Array.from(heights,v=>flat?0:v-this.origin);
  }
  static flat(width,depth){return new Terrain({width,depth,resolution:2,heights:[0,0,0,0],origin:0});}
  // Fuera del área se prolonga el borde (el contexto lejano usa su propio suelo).
  height(x,z){
    const n=this.n,fx=Math.min(n-1,Math.max(0,(x/this.width+.5)*(n-1))),fz=Math.min(n-1,Math.max(0,(z/this.depth+.5)*(n-1)));
    const i=Math.min(n-2,Math.floor(fx)),j=Math.min(n-2,Math.floor(fz)),u=fx-i,v=fz-j,h=this.h;
    return (h[j*n+i]*(1-u)+h[j*n+i+1]*u)*(1-v)+(h[(j+1)*n+i]*(1-u)+h[(j+1)*n+i+1]*u)*v;
  }
  // Filtro gaussiano separable (σ en metros). La prolongación lineal de los bordes conserva las pendientes: una cuesta real sigue intacta y desaparecen los bultos de copas, tejados y ruido del DEM.
  smoothed(sigma){
    const n=this.n,s=sigma/(this.width/(n-1));
    if(!(s>=.5)||n<3)return this;
    const R=Math.min(n-1,Math.ceil(3*s)),k=[];let total=0;
    for(let i=-R;i<=R;i++){const w=Math.exp(-i*i/(2*s*s));k.push(w);total+=w;}
    const pass=(src,stride,step)=>{const out=new Float32Array(src.length);
      for(let line=0;line<n;line++){const base=line*stride,get=x=>src[base+x*step];
        // Fuera del borde: recta ajustada a las R muestras vecinas, así el borde también se filtra.
        const fit=(from,dir)=>{let sx=0,sy=0,sxx=0,sxy=0;for(let q=0;q<=R;q++){const x=from+dir*q,y=get(x);sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}const m=R+1,g=(m*sxy-sx*sy)/(m*sxx-sx*sx||1);return [g,(sy-g*sx)/m];};
        const [g0,c0]=fit(0,1),[g1,c1]=fit(n-1,-1);
        const at=x=>x<0?c0+g0*x:x>=n?c1+g1*x:get(x);
        for(let i=0;i<n;i++){let v=0;for(let t=-R;t<=R;t++)v+=k[t+R]*at(i+t);out[base+i*step]=v/total;}}
      return out;};
    const h=pass(pass(this.h,n,1),1,n),t=new Terrain({width:this.width,depth:this.depth,resolution:n,heights:[0,0,0,0],origin:this.origin});
    t.n=n;t.h=h;return t;
  }
  slope(x,z,d=2){return Math.hypot(this.height(x+d,z)-this.height(x-d,z),this.height(x,z+d)-this.height(x,z-d))/(2*d);}
  range(){let lo=Infinity,hi=-Infinity;for(const v of this.h){lo=Math.min(lo,v);hi=Math.max(hi,v);}return [lo,hi];}
}
