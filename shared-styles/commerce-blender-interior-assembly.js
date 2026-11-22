// Ensamblador puro de interiores con volumen para el kit de Blender: una receta por categoría de comercio.
// Sistema local del vano (origen centro inferior sobre el muro, +Z a la calle). El visitante mira siempre desde +Z, por eso las
// piezas libres miran a +Z y las de pared tienen la espalda contra el muro. La caja es el límite: nada sale de (limpio × alto × profundidad).
import {rng,hashString} from '../data/rng.js';

const r3=v=>Math.round(v*1000)/1000;
// Receta: skins (suelo/fondo/techo, listas de alternativas), pared (piezas apoyadas en fondo/izq/der), libre (en el suelo),
// colgantes (lámparas con cable), techo (piezas pegadas al techo). x∈[-1,1] del ancho útil; z∈[0,1] de la profundidad (0 = vidrio).
const R=(skins,pared,libre,colgantes,extra={})=>({skins,pared,libre,colgantes,...extra});
export const RECETAS={
  panaderia:R({suelo:['suelo.hidraulico_terracota','suelo.baldosa_roja','suelo.damero_crema'],fondo:['fondo.azulejo_blanco','fondo.ladrillo_visto'],techo:['techo.vigas','techo.liso']},
    [{m:'horno.ladrillo',en:'fondo',x:.62},{m:'estanteria.pan.$',en:'fondo',x:-.55},{m:'pizarra.menu_pan',en:'fondo',x:.0,y:1.55},{m:'estanteria.pan.$',en:'izq',z:.45},{m:'sacos.harina',en:'fondo',x:.05,opc:true}],
    [{m:'mostrador.vitrina_pan',x:-.22,z:.3,giro:0},{m:'mostrador.madera',x:.5,z:.34,giro:0,sobre:['caja.registradora']}],
    [{m:'lampara.cupula',x:-.55,z:.35},{m:'lampara.cupula',x:0,z:.35},{m:'lampara.cupula',x:.55,z:.35}]),
  carniceria:R({suelo:['suelo.baldosa_roja','suelo.damero_crema'],fondo:['fondo.azulejo_blanco'],techo:['techo.liso','techo.vigas']},
    [{m:'jamones.rail',en:'techo-fondo',x:-.2},{m:'salchichas.cadena',en:'fondo',x:.55,y:2.1},{m:'estanteria.cajas.$',en:'izq',z:.5},{m:'pizarra.menu_cafe',en:'fondo',x:.55,y:1.2}],
    [{m:'mostrador.vitrina_carne',x:-.1,z:.32,giro:0},{m:'mostrador.bascula_hielo',x:.6,z:.55,giro:0},{m:'mostrador.pintado',x:-.7,z:.7,giro:0,sobre:['balanza','caja.registradora'],opc:true}],
    [{m:'lampara.industrial',x:-.5,z:.3},{m:'lampara.industrial',x:.2,z:.3},{m:'lampara.industrial',x:.7,z:.4}]),
  fruteria:R({suelo:['suelo.baldosa_roja','suelo.tablones_oscuro'],fondo:['fondo.listones_madera','fondo.ladrillo_visto'],techo:['techo.vigas']},
    [{m:'cajas.apiladas',en:'fondo',x:.65},{m:'pizarra.menu_cafe',en:'fondo',x:-.3,y:1.7},{m:'estanteria.frascos.$',en:'izq',z:.55}],
    [{m:'fruteria.escalonada_a',x:-.45,z:.45,giro:0},{m:'fruteria.escalonada_b',x:.45,z:.55,giro:0},{m:'mostrador.madera',x:.0,z:.9,giro:0,sobre:['balanza'],opc:true}],
    [{m:'lampara.canasta',x:-.5,z:.35},{m:'lampara.canasta',x:.5,z:.35}]),
  supermercado:R({suelo:['suelo.terrazo','suelo.damero_crema'],fondo:['fondo.enlucido_dado','fondo.azulejo_blanco'],techo:['techo.liso']},
    [{m:'nevera.vitrina',en:'fondo',x:-.7},{m:'nevera.vitrina',en:'fondo',x:-.25},{m:'estanteria.cajas.$',en:'fondo',x:.4},{m:'estanteria.botellas.$',en:'der',z:.5}],
    [{m:'gondola.doble',x:-.15,z:.45,giro:0},{m:'gondola.doble',x:.55,z:.6,giro:0},{m:'mostrador.pintado',x:-.75,z:.2,giro:0,sobre:['caja.registradora'],opc:true}],
    [{m:'lampara.industrial',x:-.5,z:.4},{m:'lampara.industrial',x:.1,z:.4},{m:'lampara.industrial',x:.65,z:.4}]),
  farmacia:R({suelo:['suelo.terrazo','suelo.damero_crema'],fondo:['fondo.enlucido_dado','fondo.pintura_petroleo'],techo:['techo.liso']},
    [{m:'cajonera.botica',en:'fondo',x:0},{m:'estanteria.frascos.$',en:'izq',z:.5},{m:'estanteria.cajas.$',en:'der',z:.5}],
    [{m:'mostrador.marmol',x:-.1,z:.42,giro:0,sobre:['caja.registradora']},{m:'banco.espera',x:.62,z:.18,giro:0,opc:true}],
    [{m:'lampara.globo',x:-.55,z:.35},{m:'lampara.globo',x:0,z:.35},{m:'lampara.globo',x:.55,z:.35}]),
  ropa:R({suelo:['suelo.tablones_roble','suelo.terrazo'],fondo:['fondo.pintura_petroleo','fondo.listones_madera','fondo.enlucido_dado'],techo:['techo.liso']},
    [{m:'espejo.arco',en:'fondo',x:.62},{m:'mesa.expositora',en:'fondo',x:-.4},{m:'percha.pared',en:'izq',z:.55,y:1.6},{m:'estanteria.ropa_plegada.$',en:'der',z:.6}],
    [{m:'perchero.rail_a',x:-.5,z:.4,giro:0},{m:'maniqui.vestido',x:.05,z:.28,giro:0},{m:'perchero.rail_b',x:.55,z:.55,giro:0},{m:'maniqui.vaquero',x:.9,z:.3,giro:0,opc:true}],
    [{m:'luz.riel',x:-.3,z:.45,techo:true},{m:'luz.riel',x:.4,z:.45,techo:true}]),
  calzado:R({suelo:['suelo.tablones_roble','suelo.terrazo'],fondo:['fondo.pintura_petroleo','fondo.listones_madera'],techo:['techo.liso']},
    [{m:'estanteria.zapatos.$',en:'fondo',x:.55},{m:'espejo.redondo',en:'fondo',x:-.1,y:.9},{m:'estanteria.zapatos.$',en:'izq',z:.5},{m:'estanteria.zapatos.$',en:'der',z:.5}],
    [{m:'zapatos.escalonado',x:-.5,z:.45,giro:0},{m:'banco.espera',x:.15,z:.2,giro:0}],
    [{m:'luz.riel',x:-.2,z:.4,techo:true},{m:'luz.riel',x:.5,z:.4,techo:true}]),
  libreria:R({suelo:['suelo.tablones_oscuro'],fondo:['fondo.empapelado_rayas','fondo.enlucido_dado'],techo:['techo.casetones','techo.vigas']},
    [{m:'estanteria.libros.a',en:'fondo',x:-.6},{m:'estanteria.libros.b',en:'fondo',x:.0},{m:'estanteria.libros.a',en:'fondo',x:.6},{m:'estanteria.libros.b',en:'izq',z:.45},{m:'estanteria.libros.a',en:'der',z:.45},{m:'escalera.libros',en:'fondo',x:-.1,z:.18}],
    [{m:'mesa.libros',x:.15,z:.52,giro:0}],
    [{m:'lampara.cupula',x:.15,z:.52},{m:'lampara.globo',x:-.6,z:.35},{m:'lampara.globo',x:.8,z:.35}]),
  cafe:R({suelo:['suelo.damero_negro','suelo.hidraulico_turquesa'],fondo:['fondo.azulejo_verde','fondo.ladrillo_visto'],techo:['techo.estano','techo.vigas']},
    [{m:'mostrador.bar_cafe',en:'fondo',x:-.2},{m:'estanteria.botellas.$',en:'fondo',x:.7},{m:'pizarra.menu_cafe',en:'fondo',x:-.2,y:1.75},{m:'cuadros.galeria',en:'izq',z:.5,y:1.3}],
    [{m:'mesa.cafe',x:-.55,z:.6,giro:0},{m:'mesa.cafe',x:.45,z:.6,giro:0}],
    [{m:'lampara.industrial',x:-.55,z:.55},{m:'lampara.industrial',x:.45,z:.55},{m:'lampara.industrial',x:-.1,z:.25}]),
  restaurante:R({suelo:['suelo.tablones_oscuro','suelo.hidraulico_terracota'],fondo:['fondo.ladrillo_visto','fondo.empapelado_rayas'],techo:['techo.vigas']},
    [{m:'estanteria.botellas.$',en:'fondo',x:.62},{m:'pizarra.menu_cafe',en:'fondo',x:-.1,y:1.5},{m:'cuadros.galeria',en:'izq',z:.5,y:1.2},{m:'cuadros.galeria',en:'der',z:.5,y:1.2}],
    [{m:'mesa.puesta',x:-.5,z:.5,giro:0},{m:'mesa.puesta',x:.15,z:.45,giro:0},{m:'mostrador.madera',x:.75,z:.92,giro:0,sobre:['caja.registradora']}],
    [{m:'lampara.gota',x:-.5,z:.5},{m:'lampara.gota',x:.15,z:.45},{m:'lampara.gota',x:-.15,z:.3},{m:'lampara.gota',x:.7,z:.6}]),
  belleza:R({suelo:['suelo.damero_negro','suelo.terrazo'],fondo:['fondo.pintura_petroleo','fondo.empapelado_rayas'],techo:['techo.liso']},
    [{m:'espejo.arco',en:'fondo',x:-.55},{m:'espejo.arco',en:'fondo',x:.1},{m:'estanteria.frascos.$',en:'izq',z:.5},{m:'cuadros.galeria',en:'der',z:.5,y:1.3}],
    [{m:'mostrador.madera',x:.8,z:.92,giro:0,sobre:['caja.registradora']},{m:'silla.barbero',x:-.55,z:.72,giro:0},{m:'silla.barbero',x:.1,z:.72,giro:0},{m:'poste.barbero',x:.85,z:.2,giro:0}],
    [{m:'lampara.globo',x:-.55,z:.5},{m:'lampara.globo',x:.1,z:.5}]),
  electronica:R({suelo:['suelo.terrazo'],fondo:['fondo.pintura_petroleo'],techo:['techo.liso']},
    [{m:'pantallas.pared',en:'fondo',x:0,y:.7},{m:'estanteria.cajas.$',en:'izq',z:.5},{m:'estanteria.cajas.$',en:'der',z:.5}],
    [{m:'mesa.tecnologia',x:-.25,z:.5,giro:0},{m:'mesa.tecnologia',x:.5,z:.7,giro:0}],
    [{m:'luz.riel',x:-.3,z:.4,techo:true},{m:'luz.riel',x:.5,z:.4,techo:true}]),
  bazar:R({suelo:['suelo.damero_crema','suelo.hidraulico_turquesa'],fondo:['fondo.empapelado_rayas','fondo.enlucido_dado'],techo:['techo.vigas','techo.liso']},
    [{m:'estanteria.cajas.$',en:'fondo',x:-.6},{m:'estanteria.frascos.$',en:'fondo',x:.0},{m:'estanteria.libros.$',en:'fondo',x:.6},{m:'cuadros.galeria',en:'izq',z:.5,y:1.2},{m:'cajas.apiladas',en:'der',z:.6}],
    [{m:'mesa.expositora',x:-.15,z:.45,giro:0},{m:'mostrador.madera',x:.6,z:.3,giro:0,sobre:['caja.registradora'],opc:true}],
    [{m:'lampara.canasta',x:-.5,z:.4},{m:'lampara.canasta',x:.3,z:.4},{m:'lampara.canasta',x:.8,z:.55}]),
  floristeria:R({suelo:['suelo.baldosa_roja','suelo.terrazo'],fondo:['fondo.ladrillo_visto','fondo.listones_madera'],techo:['techo.vigas']},
    [{m:'espejo.arco',en:'fondo',x:.65},{m:'estanteria.frascos.$',en:'izq',z:.55},{m:'mesa.expositora',en:'fondo',x:-.35}],
    [{m:'cubos.flores_a',x:-.25,z:.28,giro:0},{m:'cubos.flores_b',x:.4,z:.45,giro:0}],
    [{m:'lampara.globo',x:-.4,z:.4},{m:'lampara.globo',x:.4,z:.4}]),
  optica:R({suelo:['suelo.terrazo','suelo.damero_crema'],fondo:['fondo.enlucido_dado','fondo.pintura_petroleo'],techo:['techo.liso']},
    [{m:'expositor.gafas',en:'fondo',x:-.5,y:1.1},{m:'expositor.gafas',en:'fondo',x:.45,y:1.1},{m:'espejo.redondo',en:'izq',z:.5,y:.8},{m:'espejo.redondo',en:'der',z:.5,y:.8}],
    [{m:'mostrador.marmol',x:0,z:.5,giro:0,sobre:['caja.registradora']}],
    [{m:'luz.riel',x:-.3,z:.4,techo:true},{m:'luz.riel',x:.4,z:.4,techo:true}]),
  servicios:R({suelo:['suelo.terrazo','suelo.damero_crema'],fondo:['fondo.pintura_petroleo','fondo.enlucido_dado'],techo:['techo.liso']},
    [{m:'ventanilla.banco',en:'fondo',x:0},{m:'cuadros.galeria',en:'izq',z:.5,y:1.3},{m:'cuadros.galeria',en:'der',z:.5,y:1.3}],
    [{m:'banco.espera',x:-.55,z:.55,giro:0},{m:'banco.espera',x:.55,z:.55,giro:0}],
    [{m:'lampara.industrial',x:-.45,z:.45},{m:'lampara.industrial',x:.45,z:.45}]),
  generico:R({suelo:['suelo.damero_crema','suelo.tablones_roble','suelo.terrazo'],fondo:['fondo.enlucido_dado','fondo.empapelado_rayas'],techo:['techo.liso','techo.vigas']},
    [{m:'estanteria.cajas.$',en:'fondo',x:-.45},{m:'estanteria.libros.$',en:'fondo',x:.45},{m:'cuadros.galeria',en:'izq',z:.5,y:1.3}],
    [{m:'mostrador.madera',x:.1,z:.45,giro:0,sobre:['caja.registradora']},{m:'mesa.expositora',x:-.55,z:.6,giro:0,opc:true}],
    [{m:'lampara.cupula',x:-.45,z:.4},{m:'lampara.cupula',x:.45,z:.4}]),
};

const huella=m=>({w:m.caja.max[0]-m.caja.min[0],d:m.caja.max[2]-m.caja.min[2],zc:(m.caja.max[2]+m.caja.min[2])/2,xc:(m.caja.max[0]+m.caja.min[0])/2,h:m.caja.max[1]});

// o: {category, limpio, alto, depth (desde el vidrio), seed, zVidrio, estado}
export function ensamblarInterior(catalogo,o){
  const receta=RECETAS[o.category]??RECETAS.generico,seed=String(o.seed??'0'),r=rng(hashString(seed+':interior')),L=o.limpio,Dp=o.depth,H=o.alto,zg=o.zVidrio??-.25,zb=zg-Dp;
  const out=[],omitidos=[],pick=(lista,tag)=>lista[hashString(seed+':'+tag)%lista.length];
  const put=(id,x,y,z,sx=1,sy=1,sz=1,giro=0,extra={})=>{const m=catalogo.modulo(id);out.push({modulo:id,familia:m.familia,posicion:[r3(x),r3(y),r3(z)],escala:[r3(sx),r3(sy),r3(sz)],giro:r3(giro),...extra});return m;};
  const has=id=>catalogo.modulos.has(id);
  const espejo=hashString(seed+':espejo')%2===1,X=x=>espejo?-x:x;
  // --- pieles: suelo, techo, fondo y laterales (el fondo girado ±90° hace de pared lateral)
  const piel=receta.skins,suelo=pick(piel.suelo,'suelo'),fondo=pick(piel.fondo,'fondo'),techo=pick(piel.techo,'techo');
  put(suelo,0,0,zg,L,1,Dp,0,{piel:'suelo'});put(techo,0,H,zg,L,1,Dp,0,{piel:'techo'});put(fondo,0,0,zb,L,H,1,0,{piel:'fondo'});
  put(fondo,-L/2,0,zg-Dp/2,Dp,H,1,Math.PI/2,{piel:'lateral'});put(fondo,L/2,0,zg-Dp/2,Dp,H,1,-Math.PI/2,{piel:'lateral'});
  // --- piezas de pared
  for(const it of receta.pared){
    if(it.opc&&r()<.4)continue;
    const id=it.m.replace('$',r()<.5?'a':'b');if(!has(id)){omitidos.push('módulo ausente: '+id);continue;}
    const mod=catalogo.modulo(id),f=huella(mod);
    if(f.h>H-.1){omitidos.push(id+': más alto que el interior');continue;}
    const y=it.y??0,zf=it.z??.5;
    if(it.en==='fondo'){
      if(f.w>L-.1){omitidos.push(id+': más ancho que el vano');continue;}
      // la espalda toca el muro: las de suelo tienen el origen en el centro de su huella (min z<0), las de pared en z=0
      const x=Math.max(-L/2+f.w/2+.03,Math.min(L/2-f.w/2-.03,X(it.x??0)*(L/2-f.w/2))),z=zb-mod.caja.min[2]+.005;
      put(id,x,y,z,1,1,1,0,{pared:'fondo'});
    }else if(it.en==='izq'||it.en==='der'){
      const s=it.en==='izq'?-1:1,giro=s<0?Math.PI/2:-Math.PI/2;
      if(f.w>Dp-.02){omitidos.push(id+': más ancho que la profundidad');continue;}
      const zc=zg-Math.max(f.w/2+.01,Math.min(Dp-f.w/2-.01,zf*Dp));
      put(id,s*(L/2+mod.caja.min[2])+s*.005,y,zc,1,1,1,giro,{pared:it.en});
    }else if(it.en==='techo-fondo'){
      put(id,Math.max(-L/2+.8,Math.min(L/2-.8,X(it.x??0)*L/2)),H-.3,zb+.5,1,1,1,0,{colgado:true});
    }
  }
  // --- piezas libres sobre el suelo: pasillo libre frente a la puerta y sin solapes entre piezas
  const puerta=o.puerta??null,pasillo=Math.min(.85,Dp*.62),ocupadas=[];
  const solapa=(x,z,f,[a0,a1,b0,b1])=>x-f.w/2<a1&&x+f.w/2>a0&&z-f.d/2<b1&&z+f.d/2>b0;
  for(const it of receta.libre){
    if(it.opc&&r()<.4)continue;
    const id=it.m;if(!has(id)){omitidos.push('módulo ausente: '+id);continue;}
    const mod=catalogo.modulo(id);let f=huella(mod),sx=1;
    // mostradores, bancos y góndolas se estrechan hasta un 62 % si no caben junto a la puerta
    const escalable=/^(mostrador|banco|gondola|ventanilla|mesa\.expositora)/.test(id);
    if(escalable&&puerta){const lado=Math.max(puerta.x0-(-L/2)-.12,L/2-puerta.x1-.12);if(f.w>lado&&lado/f.w>=.62){sx=lado/f.w;f={...f,w:f.w*sx};}}
    if(f.w>L-.1||f.d>Dp-.1){omitidos.push(id+': no cabe en el vano');continue;}
    const xmin=-L/2+f.w/2+.05,xmax=L/2-f.w/2-.05,zmin=zb+f.d/2+.05,zmax=zg-f.d/2-.12;
    let x=Math.max(xmin,Math.min(xmax,X(it.x)*L/2)),z=Math.min(zmax,Math.max(zmin,zg-it.z*Dp));
    // 1) fuera del pasillo de la puerta (pasillo = ancho de la puerta + 0,3 m, hasta `pasillo` m desde el vidrio)
    const delante=zz=>zg-(zz+f.d/2)<pasillo;
    if(puerta&&delante(z)&&x+f.w/2>puerta.x0&&x-f.w/2<puerta.x1){
      const cand=[puerta.x0-f.w/2-.02,puerta.x1+f.w/2+.02].filter(c=>c>=xmin-1e-6&&c<=xmax+1e-6).sort((p,q)=>Math.abs(p-x)-Math.abs(q-x));
      if(cand.length)x=cand[0];
      else{z=Math.max(zmin,Math.min(zmax,zg-pasillo-f.d/2-.02));if(delante(z)){omitidos.push(id+': bloquearía la puerta');continue;}}
    }
    // 2) sin solapar con otras piezas libres: busca el hueco válido más cercano a la posición deseada (rejilla de 10 cm)
    let ok=false,mejor=Infinity,bx=x,bz=z;
    for(let zz=zmax;zz>=zmin-1e-6;zz-=.1){
      for(let xx=xmin;xx<=xmax+1e-6;xx+=.1){
        if(puerta&&delante(zz)&&xx+f.w/2>puerta.x0&&xx-f.w/2<puerta.x1)continue;
        if(ocupadas.some(b=>solapa(xx,zz,f,b)))continue;
        const d=Math.hypot(xx-x,(zz-z)*1.4);if(d<mejor){mejor=d;bx=xx;bz=zz;ok=true;}
      }
    }
    x=bx;z=bz;
    if(!ok){omitidos.push(id+': sin hueco libre');continue;}
    ocupadas.push([x-f.w/2-.08,x+f.w/2+.08,z-f.d/2-.08,z+f.d/2+.08]);
    put(id,x,0,z,sx,1,1,it.giro??0,{libre:true});
    for(const s of it.sobre??[]){if(has(s))put(s,x+(s==='balanza'?.5:-.4),.93,z,1,1,1,0,{sobre:id});}
  }
  // --- lámparas con cable hasta el techo
  receta.colgantes.forEach((it,i)=>{
    const id=it.m;if(!has(id))return;const mod=catalogo.modulo(id),x=Math.max(-L/2+.42,Math.min(L/2-.42,X(it.x)*L/2)),z=zg-Math.max(.4,Math.min(Dp-.4,it.z*Dp));
    if(it.techo){put(id,x,H-.0,z,1,1,1,0,{colgado:true});return;}
    const largo=Math.max(.3,Math.min(1.0,H-2.35+((hashString(seed+':l'+i)%5)-2)*.08));
    put(id,x,H-largo,z,1,1,1,0,{colgado:true});put('lampara.cable',x,H,z,1,largo,1,0,{cable:true});void mod;
  });
  const triangulos=out.reduce((n,c)=>n+catalogo.modulo(c.modulo).triangulos,0);
  return {colocaciones:out,omitidos,triangulos,receta:o.category,piel:{suelo,fondo,techo}};
}
