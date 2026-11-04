// Constructor de la fachada colonial (extraído de HotelWorld.js del hotel, 30-09-2026).
// Necesita las utilidades add/block/text/palms del mundo y FACADE de dimensions.js (ver README).
  // Fachada colonial de Cartagena vista de frente desde la acera, como la entrada del
  // aeropuerto: muro encalado delante, portada de piedra coralina con ENTRADA y SALIDA.
  // A los lados del edificio solo hay acera: ahí irá el horizonte de la ciudad.
  function fachada(group){
    const half=F.width/2,top=F.floors*F1,P=F.portal,M=F.arches.main,S=F.arches.side,K=F.canopy;
    const spring=a=>a.height-a.width/2;
    const doors=[{x:0,a:M,rol:'entrada'},{x:S.x,a:S,rol:'salida'}];
    // Suelo: acera de piedra, bordillo y calle vacía.
    add(crearPisoHotel({ancho:F.wingSidewalk,fondo:F.sidewalk,color:'#e2d6bf'}),'piso','Acera de piedra del hotel',0,F.sidewalk/2,0,{id:'fachada-acera'});
    block('Bordillo de la acera',F.wingSidewalk,F.curb,.25,C.stone,0,F.sidewalk-.125,-F.curb,{tipo:'bordillo',id:'fachada-bordillo'});
    add(crearPisoHotel({ancho:F.wingSidewalk+40,fondo:F.street,color:'#6f7a7e'}),'piso','Calle frente al hotel',0,F.sidewalk+F.street/2,-F.curb,{id:'fachada-calle'});
    for(let i=0;i<14;i++)block('Línea central de la calle',2.6,.01,.12,C.ivory,-58+i*9,F.sidewalk+F.street/2,-F.curb,{tipo:'marca-vial',detalle:1,id:'fachada-marca-'+i});
    // Muro principal encalado (4 plantas) y portada de piedra coralina adelantada.
    const holes=doors.map(({x,a})=>({x,ancho:a.width,alto:spring(a)}));
    add(crearMuroConHuecos({ancho:F.width,alto:top,fondo:.4,color:C.lime,huecos:holes}),'muro','Muro de fachada encalado',0,-.2,0,{id:'fachada-muro'});
    add(crearMuroConHuecos({ancho:P.width,alto:P.height,fondo:P.depth,color:C.coral,huecos:holes}),'portada','Portada de piedra coralina',0,P.depth/2,0,{id:'fachada-portada'});
    block('Cornisa de la portada',P.width+.4,.3,P.depth+.3,C.coral,0,(P.depth+.3)/2,P.height,{tipo:'cornisa',id:'fachada-portada-cornisa'});
    text('HOTEL PALMA REAL',0,P.depth+.03,P.height-.55,8.6,'CARTAGENA DE INDIAS · ★★★★★');
    // Arcos, montantes vidriados y zaguanes detrás de las puertas.
    for(const {x,a,rol} of [...doors,{x:-S.x,a:S,rol:'ventana'}]){
      if(rol==='ventana'){add(crearVentanaArco({ancho:a.width-.4,alto:a.height-.6}),'ventana','Ventana de arco de la portada',x,P.depth+.06,.6,{id:'fachada-portada-ventana-oeste'});continue;}
      add(crearArco({ancho:a.width,alto:a.height,grosor:.4,fondo:.3,color:C.coral}),'arco','Arco de '+rol,x,P.depth+.15,0,{id:'fachada-arco-'+rol});
      const fan=new T.Group();pieza(fan,'montante',new T.CircleGeometry(a.width/2-.02,24,0,Math.PI),C.blue,[0,0,0],false);caja(fan,'radio',.05,a.width/2-.05,.04,C.darkWood,0,(a.width/2-.05)/2,.01,false);
      add(fan,'montante','Montante vidriado de '+rol,x,P.depth+.01,spring(a),{id:'fachada-montante-'+rol,fijo:true}).position.set(x,spring(a),P.depth+.01);
      block('Fondo del zaguán de '+rol,a.width+.4,spring(a),.12,C.ivory,x,-2.7,0,{id:'fachada-zaguan-'+rol});
      add(crearPisoHotel({ancho:a.width,fondo:2.6,color:C.stone}),'piso','Piso del zaguán de '+rol,x,-1.3,0,{id:'fachada-zaguan-piso-'+rol});
      const door=crearPorton({ancho:a.width-.04,alto:spring(a)-.02});
      add(door,'puerta',rol==='entrada'?'Portón de ENTRADA al lobby':'Puerta de SALIDA a la calle',x,.15,0,{id:'fachada-puerta-'+rol,accion:rol==='entrada'?()=>{door.userData.abierta=true;onNavigate('lobby');}:()=>{door.userData.abierta=!door.userData.abierta;onAction('salida-calle');}});
    }
    text('SALIDA',S.x,P.depth+.03,S.height+.55,1.6);
    // Marquesina sobre la entrada, colgada de la portada con tirantes de hierro.
    const canopy=new T.Group(),z0=P.depth;
    caja(canopy,'losa',K.width,.3,K.depth,C.green,0,K.y+.15,z0+K.depth/2);
    caja(canopy,'fascia',K.width+.06,.4,.08,C.gold,0,K.y+.2,z0+K.depth,false);
    for(const s of [-1,1]){caja(canopy,'canto-'+s,.08,.4,K.depth,C.gold,s*K.width/2,K.y+.2,z0+K.depth/2,false);
      const dy=2,dz=K.depth-.15,rod=caja(canopy,'tirante-'+s,.05,.05,Math.hypot(dy,dz),C.iron,s*(K.width/2-.4),K.y+.3+dy/2,z0+dz/2);rod.rotation.x=Math.atan2(dy,dz);}
    add(canopy,'marquesina','Marquesina de la entrada',0,0,0,{id:'fachada-marquesina',fijo:true});
    text('ENTRADA',0,z0+K.depth+.05,K.y+.2,3.2);
    const crest=new T.Group();const disc=cilindro(crest,'escudo',.75,.12,C.gold);disc.rotation.x=Math.PI/2;const inner=cilindro(crest,'campo',.6,.14,C.green);inner.rotation.x=Math.PI/2;
    add(crest,'escudo','Escudo de piedra Palma Real',0,P.depth+.07,K.y+1.05,{id:'fachada-escudo'});
    for(const x of F.centerBays.filter(x=>x))add(crearVentanaArco({ancho:F.window.width,alto:2.6}),'ventana','Ventana del atrio sobre la portada',x,P.depth+.06,K.y-.35,{id:'fachada-portada-ventana-p1-'+(x<0?'oeste':'este')});
    // Alas laterales: arcos en PB, balcones de madera en P1 y P3, balcón de hierro en P2.
    // Cada pieza se construye a +x y se repite en -x con el mismo código (simetría real).
    for(const s of [-1,1])for(const [b,bx] of F.bays.entries()){
      const x=s*bx,lado=s<0?'oeste':'este',tag=lado+'-'+(b+1);
      add(crearVentanaArco({ancho:2.2,alto:2.9}),'ventana','Ventana de arco · planta baja',x,.06,.8,{id:'fachada-ventana-pb-'+tag});
      for(let f=1;f<F.floors;f++){
        const y=f*F1,wood=f!==2;
        add(crearVentanaBalconera({ancho:F.window.width,alto:F.window.height}),'ventana','Ventana balconera · piso '+(f+1),x,.08,y+.12,{id:'fachada-ventana-'+f+'-'+tag});
        if(wood){const balcon=crearBalconMadera({ancho:F.balcony.width,fondo:F.balcony.depth,techo:3.15});add(balcon,'balcon','Balcón de madera · piso '+(f+1),0,0,y,{id:'fachada-balcon-'+f+'-'+tag,fijo:true}).position.set(x,y,0);}
        else{block('Losa del balcón de hierro',F.balcony.width,.14,.7,C.coral,x,.35,y-.02,{tipo:'balcon',id:'fachada-losa-'+f+'-'+tag});
          add(crearBaranda({ancho:F.balcony.width,alto:1}),'baranda','Baranda de hierro · piso '+(f+1),x,.64,y+.12,{id:'fachada-baranda-'+f+'-'+tag});}
        // La buganvilla nace del pasamanos del balcón de madera (alto 1,05 m) y cuelga hacia la calle.
        if(wood&&((f===1&&b===1)||(f===3&&b===0)))add(crearBuganvilla({ancho:F.balcony.width-.3}),'buganvilla','Buganvilla del balcón',0,0,0,{id:'fachada-buganvilla-'+f+'-'+tag,detalle:1,fijo:true}).position.set(x,y+1.05,F.balcony.depth+.08);
      }
    }
    // Ventanas altas sobre la portada (P2 y P3), con baranda de hierro tipo francés.
    for(const x of F.centerBays)for(let f=2;f<F.floors;f++){const y=f===2?P.height+.35:f*F1+.12,h=f===2?2.2:F.window.height;const tag=f+'-'+(x<0?'oeste':x>0?'este':'centro');
      add(crearVentanaBalconera({ancho:F.window.width,alto:h}),'ventana','Ventana sobre la portada · piso '+(f+1),x,.08,y,{id:'fachada-ventana-centro-'+tag});
      add(crearBaranda({ancho:F.window.width+.3,alto:.9}),'baranda','Baranda francesa · piso '+(f+1),x,.22,y,{id:'fachada-baranda-centro-'+tag});}
    // Impostas, zócalo, esquineras, cornisa y cubierta de teja.
    for(let f=1;f<F.floors;f++)for(const s of [-1,1])block('Imposta de piedra',half-P.width/2,.2,.16,C.coral,s*(half+P.width/2)/2,.08,f*F1-.1,{tipo:'imposta',id:'fachada-imposta-'+f+'-'+(s<0?'oeste':'este')});
    for(const s of [-1,1])block('Zócalo de piedra coralina',half-P.width/2,F.plinth,.14,C.coral,s*(half+P.width/2)/2,.07,0,{tipo:'zocalo',id:'fachada-zocalo-'+(s<0?'oeste':'este')});
    for(const s of [-1,1]){const q=new T.Group();for(let i=0;i*0.5<top;i++)caja(q,'sillar-'+i,i%2?.6:.9,.46,.5,C.coral,-s*(i%2?.3:.45),.23+i*.5,0);
      add(q,'esquinera','Esquinera de sillares',0,0,0,{id:'fachada-esquinera-'+(s<0?'oeste':'este'),fijo:true}).position.set(s*half,0,.25);}
    block('Cornisa de coronación',F.width+.6,F.cornice,.6,C.coral,0,.3,top,{tipo:'cornisa',id:'fachada-cornisa'});
    const roof=crearAleroTeja({ancho:F.width+.8,vuelo:F.eave,fondo:9});add(roof,'cubierta','Cubierta y alero de teja de barro',0,0,0,{id:'fachada-cubierta',fijo:true}).position.set(0,top+F.cornice,0);
    // Faroles de hierro: entre los vanos de PB y a los lados de la portada.
    for(const s of [-1,1]){for(const fx of [13,18])add(crearFarol(),'farol','Farol colonial',s*fx,.27,3.1,{id:'fachada-farol-'+fx+'-'+(s<0?'oeste':'este')});
      add(crearFarol(),'farol','Farol de la portada',s*(P.width/2-.55),P.depth+.27,3.6,{id:'fachada-farol-portada-'+(s<0?'oeste':'este')});}
    // Acera: palmeras en alcorque, farolas y alfombra de bienvenida (exterior real).
    palms([[-12.8,4.8],[12.8,4.8],[-18,4.8],[18,4.8],[-8.6,P.depth+1.4],[8.6,P.depth+1.4]],5);
    for(const x of [-26,-10,10,26])add(crearLampara({alto:4.8}),'farola','Farola de la acera',x,F.sidewalk-.7);
    add(crearAlfombra({ancho:3.6,fondo:2.6,color:C.green}),'alfombra','Alfombra de bienvenida',0,P.depth+1.5);
    group.userData.front=P.depth;
  }
