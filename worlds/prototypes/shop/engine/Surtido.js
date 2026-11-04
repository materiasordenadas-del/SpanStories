// Surtido de La Estrella por modo (Colombia, precios en COP).  Datos puros: sin three.
// Cada producto: id, nombre (con artículo, para la etiqueta al pulsarlo), precio en
// COP (o `libra` para el fruver), forma, tamaño [ancho, alto, fondo] en m y colores
// [envase, etiqueta].  Sin marcas reales.  `ZONAS` dice qué va en cada estante.

const P = (id, nombre, cop, forma, tam, colores, extra = {}) => ({ id, nombre, cop, forma, tam, colores, ...extra });

export const PRODUCTOS = {
  // ── Granos y abarrotes ──
  arroz: P('arroz', 'el arroz (1 kg)', 4800, 'bolsa', [.14, .22, .07], ['#f7f3e6', '#2f6fb0']),
  frijol: P('frijol', 'el fríjol (500 g)', 6900, 'bolsa', [.12, .18, .06], ['#f4ede0', '#8a3b2a']),
  lenteja: P('lenteja', 'la lenteja (500 g)', 3900, 'bolsa', [.12, .18, .06], ['#f4ede0', '#6f8a3a']),
  panela: P('panela', 'la panela', 3200, 'caja', [.12, .1, .12], ['#b8773a', '#f4e2b8']),
  aceite: P('aceite', 'el aceite (1 litro)', 9800, 'botella', [.08, .28, .08], ['#f2c64a', '#d8453a']),
  azucar: P('azucar', 'el azúcar (1 kg)', 4500, 'bolsa', [.13, .21, .07], ['#ffffff', '#d8453a']),
  sal: P('sal', 'la sal (500 g)', 1900, 'bolsa', [.1, .16, .05], ['#ffffff', '#2f6fb0']),
  pasta: P('pasta', 'la pasta (500 g)', 3300, 'caja', [.12, .2, .05], ['#1f4f9c', '#f4c542']),
  harina: P('harina', 'la harina de maíz para arepas (1 kg)', 4200, 'bolsa', [.15, .23, .07], ['#f4c542', '#d8453a']),
  // ── Café y chocolate ──
  cafe: P('cafe', 'el café molido (500 g)', 16900, 'bolsa', [.13, .2, .07], ['#6a3b22', '#e8c07a']),
  chocolate: P('chocolate', 'el chocolate de mesa', 7900, 'caja', [.14, .07, .1], ['#5a2e1c', '#f1d8a8']),
  aromatica: P('aromatica', 'la aromática (20 sobres)', 3800, 'caja', [.12, .08, .07], ['#6fa05a', '#ffffff']),
  // ── Paquetes y dulces ──
  papas: P('papas', 'el paquete de papas', 2500, 'bolsa', [.16, .22, .07], ['#f4c542', '#d8453a'], { inflada: true }),
  platanitos: P('platanitos', 'los platanitos', 2200, 'bolsa', [.15, .21, .07], ['#4f8a4a', '#f4c542'], { inflada: true }),
  galletas: P('galletas', 'las galletas', 3500, 'caja', [.2, .06, .06], ['#2f6fb0', '#f4c542']),
  chocolatina: P('chocolatina', 'la chocolatina', 1800, 'caja', [.11, .02, .04], ['#7a2e8a', '#ffffff']),
  mani: P('mani', 'el maní', 2900, 'bolsa', [.1, .15, .05], ['#e8873a', '#8a3b2a']),
  bocadillo: P('bocadillo', 'el bocadillo de guayaba', 3000, 'caja', [.14, .05, .1], ['#b8323a', '#4f8a4a']),
  chicles: P('chicles', 'los chicles', 800, 'caja', [.06, .02, .03], ['#38b3a8', '#ffffff']),
  // ── Aseo ──
  detergente: P('detergente', 'el detergente en polvo (1 kg)', 12900, 'bolsa', [.18, .26, .08], ['#2f6fb0', '#ffffff']),
  jabon: P('jabon', 'el jabón de barra', 3600, 'caja', [.1, .05, .07], ['#4fb0d8', '#ffffff']),
  lavaloza: P('lavaloza', 'el lavaloza', 7400, 'frasco', [.1, .12, .1], ['#6fc05a', '#ffffff']),
  papel: P('papel', 'el papel higiénico (4 rollos)', 8900, 'caja', [.2, .12, .2], ['#f7f7f2', '#7ab3e0']),
  blanqueador: P('blanqueador', 'el blanqueador', 5200, 'botella', [.1, .26, .1], ['#ffffff', '#2f6fb0']),
  suavizante: P('suavizante', 'el suavizante', 9900, 'botella', [.11, .27, .09], ['#9b7fd1', '#ffffff']),
  // ── Bebidas ──
  gaseosa: P('gaseosa', 'la gaseosa (1,5 litros)', 5900, 'botella', [.09, .3, .09], ['#b8323a', '#ffffff'], { transparente: true }),
  gaseosaVerde: P('gaseosaVerde', 'la gaseosa de limón (1,5 litros)', 5600, 'botella', [.09, .3, .09], ['#6fc05a', '#ffffff'], { transparente: true }),
  gaseosaNaranja: P('gaseosaNaranja', 'la gaseosa de naranja (1,5 litros)', 5600, 'botella', [.09, .3, .09], ['#f39a2e', '#ffffff'], { transparente: true }),
  agua: P('agua', 'el agua (600 ml)', 1800, 'botella', [.065, .22, .065], ['#bfe3f2', '#2f6fb0'], { transparente: true }),
  jugo: P('jugo', 'el jugo de caja (1 litro)', 4600, 'caja', [.09, .2, .06], ['#f39a2e', '#4f8a4a']),
  // ── Enlatados y conservas ──
  atun: P('atun', 'el atún en lata', 6900, 'lata', [.085, .045, .085], ['#c8ccd0', '#2f6fb0']),
  sardinas: P('sardinas', 'las sardinas', 5400, 'lata', [.09, .04, .09], ['#c8ccd0', '#d8453a']),
  maiz: P('maiz', 'el maíz tierno', 4300, 'lata', [.075, .11, .075], ['#c8ccd0', '#f4c542']),
  salsa: P('salsa', 'la salsa de tomate', 5600, 'frasco', [.07, .18, .07], ['#c8342c', '#ffffff']),
  mayonesa: P('mayonesa', 'la mayonesa', 6800, 'frasco', [.08, .14, .08], ['#f7f1d8', '#2f6fb0']),
  mermelada: P('mermelada', 'la mermelada de mora', 7200, 'frasco', [.075, .1, .075], ['#5a1f4a', '#f4e2b8']),
  // ── Refrigerados ──
  leche: P('leche', 'la leche en bolsa (1,1 litros)', 4600, 'bolsaLeche', [.16, .09, .22], ['#f7f7f2', '#2f6fb0']),
  yogur: P('yogur', 'el yogur (1 litro)', 7800, 'botella', [.085, .2, .085], ['#f7e4ef', '#c8347a']),
  kumis: P('kumis', 'el kumis', 3900, 'frasco', [.07, .12, .07], ['#f7f7f2', '#4f8a4a']),
  queso: P('queso', 'el queso campesino', 8500, 'caja', [.14, .05, .12], ['#f7f3e0', '#2f6fb0']),
  mantequilla: P('mantequilla', 'la mantequilla', 6400, 'caja', [.1, .05, .06], ['#f4d56a', '#ffffff']),
  huevos: P('huevos', 'los huevos (30)', 16500, 'caja', [.3, .07, .3], ['#e9d8b8', '#8a6038']),
  salchichas: P('salchichas', 'las salchichas', 9800, 'caja', [.18, .04, .1], ['#e89a8a', '#d8453a']),
  jamon: P('jamon', 'el jamón', 10900, 'caja', [.16, .03, .12], ['#f2b5b0', '#ffffff']),
  chorizo: P('chorizo', 'el chorizo', 12500, 'caja', [.2, .05, .12], ['#b8473a', '#f4e2b8']),
  // ── Panadería (isla) ──
  pandebono: P('pandebono', 'el pandebono', 1500, 'pan', [.08, .06, .08], ['#e8c27a', '#e8c27a']),
  almojabana: P('almojabana', 'la almojábana', 1500, 'pan', [.09, .06, .09], ['#f0d49a', '#f0d49a']),
  pantajado: P('pantajado', 'el pan tajado', 5900, 'bolsa', [.12, .12, .22], ['#f7efe0', '#d8453a']),
  // ── Fruver (precio por libra) ──
  tomate: P('tomate', 'el tomate', 0, 'fruta', [.075, .07, .075], ['#d8392c', '#d8392c'], { libra: 2800 }),
  cebolla: P('cebolla', 'la cebolla cabezona', 0, 'fruta', [.08, .075, .08], ['#c77a8a', '#c77a8a'], { libra: 2400 }),
  papa: P('papa', 'la papa', 0, 'fruta', [.08, .06, .065], ['#b58a58', '#b58a58'], { libra: 1900 }),
  platano: P('platano', 'el plátano', 0, 'fruta', [.22, .05, .05], ['#5f8f3a', '#5f8f3a'], { libra: 2600, largo: true }),
  banano: P('banano', 'el banano', 0, 'fruta', [.18, .04, .04], ['#f2d04a', '#f2d04a'], { libra: 1800, largo: true }),
  naranja: P('naranja', 'la naranja', 0, 'fruta', [.08, .08, .08], ['#f39a2e', '#f39a2e'], { libra: 2200 }),
  mango: P('mango', 'el mango', 0, 'fruta', [.1, .08, .075], ['#f2b53a', '#e2702e'], { libra: 3500 }),
  aguacate: P('aguacate', 'el aguacate', 0, 'fruta', [.09, .11, .09], ['#3f6b2e', '#3f6b2e'], { libra: 5200 }),
  limon: P('limon', 'el limón', 0, 'fruta', [.05, .05, .05], ['#6fb040', '#6fb040'], { libra: 3000 }),
  manzana: P('manzana', 'la manzana', 0, 'fruta', [.075, .07, .075], ['#c8342c', '#c8342c'], { libra: 5600 }),
  guayaba: P('guayaba', 'la guayaba', 0, 'fruta', [.07, .07, .07], ['#b8d06a', '#b8d06a'], { libra: 3200 }),
  maracuya: P('maracuya', 'el maracuyá', 0, 'fruta', [.08, .085, .08], ['#e8c93a', '#e8c93a'], { libra: 4800 }),
  zanahoria: P('zanahoria', 'la zanahoria', 0, 'fruta', [.16, .035, .035], ['#ef7f2a', '#ef7f2a'], { libra: 1700, largo: true }),

  // ── Tienda general ──
  vasos: P('vasos', 'el juego de vasos', 12900, 'caja', [.2, .14, .14], ['#bfe3f2', '#2f6fb0']),
  platos: P('platos', 'los platos (6)', 24900, 'platos', [.24, .1, .24], ['#f7f7f2', '#2f6fb0']),
  olla: P('olla', 'la olla', 45900, 'olla', [.24, .16, .24], ['#b8bec3', '#2a2c2f']),
  taza: P('taza', 'la taza', 5500, 'frasco', [.09, .1, .09], ['#f4c542', '#ffffff']),
  toallas: P('toallas', 'las toallas de cocina', 9900, 'caja', [.2, .12, .12], ['#f7a6a0', '#ffffff']),
  cuaderno: P('cuaderno', 'el cuaderno', 4500, 'caja', [.21, .28, .02], ['#2f6fb0', '#ffffff'], { dePie: true }),
  colores: P('colores', 'la caja de colores', 8900, 'caja', [.18, .1, .02], ['#f4c542', '#d8453a'], { dePie: true }),
  marcadores: P('marcadores', 'los marcadores', 9900, 'caja', [.14, .15, .03], ['#2a2c2f', '#6fc05a'], { dePie: true }),
  carpeta: P('carpeta', 'la carpeta', 3200, 'caja', [.24, .31, .015], ['#d8453a', '#ffffff'], { dePie: true }),
  pegante: P('pegante', 'el pegante', 2500, 'frasco', [.05, .12, .05], ['#ffffff', '#e8873a']),
  pelota: P('pelota', 'la pelota', 12000, 'bola', [.2, .2, .2], ['#e8873a', '#ffffff']),
  carrito: P('carrito', 'el carrito de juguete', 18900, 'caja', [.22, .12, .1], ['#2f6fb0', '#f4c542']),
  rompecabezas: P('rompecabezas', 'el rompecabezas', 24900, 'caja', [.3, .22, .05], ['#6fc05a', '#f4c542'], { dePie: true }),
  muneca: P('muneca', 'la muñeca', 39900, 'caja', [.16, .32, .08], ['#f2a6c8', '#ffffff']),
  bloques: P('bloques', 'los bloques de construcción', 29900, 'caja', [.26, .2, .16], ['#d8453a', '#f4c542']),
  tornillos: P('tornillos', 'la caja de tornillos', 6500, 'caja', [.1, .06, .07], ['#80878d', '#f4c542']),
  cinta: P('cinta', 'la cinta aislante', 4200, 'lata', [.1, .03, .1], ['#2a2c2f', '#2a2c2f']),
  pintura: P('pintura', 'la pintura (galón)', 58900, 'lata', [.17, .2, .17], ['#c8ccd0', '#2f6fb0']),
  bombillo: P('bombillo', 'el bombillo LED', 7900, 'caja', [.07, .13, .07], ['#f4c542', '#ffffff']),
  linterna: P('linterna', 'la linterna', 15900, 'caja', [.07, .2, .05], ['#2a2c2f', '#f4c542'], { dePie: true }),
  // colgados (panel ranurado)
  espatula: P('espatula', 'la espátula', 7900, 'colgado', [.09, .26, .02], ['#2a2c2f', '#d8453a']),
  cucharon: P('cucharon', 'el cucharón', 6900, 'colgado', [.09, .28, .02], ['#b8bec3', '#2f6fb0']),
  pinzas: P('pinzas', 'las pinzas de cocina', 8500, 'colgado', [.07, .24, .02], ['#6fc05a', '#ffffff']),
  rallador: P('rallador', 'el rallador', 9900, 'colgado', [.1, .22, .02], ['#b8bec3', '#f4c542']),
  pelador: P('pelador', 'el pelador', 5900, 'colgado', [.07, .18, .02], ['#e8873a', '#ffffff']),
  tijeras: P('tijeras', 'las tijeras', 8900, 'colgado', [.08, .2, .02], ['#2f6fb0', '#ffffff']),
  // regalos
  florero: P('florero', 'el florero', 29900, 'frasco', [.11, .26, .11], ['#6fb0c8', '#6fb0c8']),
  portarretrato: P('portarretrato', 'el portarretratos', 19900, 'caja', [.16, .21, .03], ['#8a6038', '#f7f1e3'], { dePie: true }),
  vela: P('vela', 'la vela aromática', 15900, 'frasco', [.09, .1, .09], ['#f2e6c8', '#c8347a']),
  cojin: P('cojin', 'el cojín', 34900, 'bolsa', [.34, .3, .12], ['#e8873a', '#f4c542'], { inflada: true }),
  tazaDeco: P('tazaDeco', 'la taza decorada', 16900, 'frasco', [.09, .1, .09], ['#7fb7be', '#ffffff']),
  // exposición especial (electrodomésticos)
  licuadora: P('licuadora', 'la licuadora', 189900, 'licuadora', [.2, .42, .2], ['#d8453a', '#dff0f6']),
  arrocera: P('arrocera', 'la olla arrocera', 149900, 'olla', [.3, .26, .3], ['#f7f7f2', '#2a2c2f']),
  ventilador: P('ventilador', 'el ventilador', 129900, 'ventilador', [.42, .8, .3], ['#f7f7f2', '#2f6fb0']),
  plancha: P('plancha', 'la plancha', 89900, 'caja', [.26, .14, .12], ['#2f6fb0', '#f7f7f2']),
  sanduchera: P('sanduchera', 'la sanduchera', 99900, 'caja', [.26, .1, .24], ['#2a2c2f', '#d8453a']),
  // regreso a clases (isla)
  morral: P('morral', 'el morral', 69900, 'bolsa', [.3, .4, .15], ['#2f6fb0', '#f4c542'], { inflada: true }),
  lonchera: P('lonchera', 'la lonchera', 32900, 'caja', [.22, .18, .1], ['#f2a6c8', '#ffffff']),
  cartuchera: P('cartuchera', 'la cartuchera', 18900, 'bolsa', [.22, .08, .06], ['#6fc05a', '#2a2c2f']),
  // almacén (cajas cerradas, sin precio)
  cajaCarton: P('cajaCarton', 'una caja de mercancía', 0, 'caja', [.4, .3, .3], ['#c49a64', '#e8d7b8'], { sinPrecio: true }),
};

// Qué va en cada zona de estantes, por modo.  Clave de estante → lista de ids.
// Góndolas: `g{n}{lado}`; lados e/o = cuerpo, s/n = cabeceras.
export const ZONAS = {
  super: {
    g1o: ['arroz', 'frijol', 'lenteja', 'harina'], g1e: ['azucar', 'sal', 'panela', 'pasta', 'aceite'],
    g2o: ['cafe', 'chocolate', 'aromatica', 'galletas'], g2e: ['papas', 'platanitos', 'mani', 'bocadillo', 'chocolatina'],
    g3o: ['detergente', 'jabon', 'lavaloza', 'papel'], g3e: ['blanqueador', 'suavizante', 'papel', 'jabon'],
    g4o: ['gaseosa', 'gaseosaVerde', 'gaseosaNaranja', 'agua'], g4e: ['jugo', 'agua', 'gaseosa', 'jugo'],
    g1s: ['aceite', 'arroz'], g2s: ['cafe', 'galletas'], g3s: ['detergente', 'jabon'], g4s: ['gaseosa', 'agua'],
    g1n: ['arroz', 'panela'], g2n: ['galletas', 'mani'], g3n: ['papel', 'lavaloza'], g4n: ['agua', 'jugo'],
    mural: ['atun', 'sardinas', 'maiz', 'salsa', 'mayonesa', 'mermelada'],
    frio: ['leche', 'leche', 'yogur', 'kumis', 'queso', 'mantequilla', 'huevos', 'salchichas', 'jamon', 'chorizo', 'gaseosa', 'gaseosaVerde', 'agua', 'jugo'],
    fresco: ['tomate', 'cebolla', 'papa', 'platano', 'banano', 'naranja', 'mango', 'aguacate', 'limon', 'manzana', 'guayaba', 'maracuya', 'zanahoria', 'tomate', 'papa'],
    isla: ['pandebono', 'almojabana', 'pantajado'],
    impulso: ['chicles', 'chocolatina', 'mani'],
    escaparate: ['aceite', 'arroz', 'cafe'],
    almacen: ['cajaCarton'],
  },
  general: {
    g1o: ['vasos', 'platos', 'taza', 'toallas'], g1e: ['olla', 'vasos', 'taza'],
    g2o: ['cuaderno', 'colores', 'marcadores'], g2e: ['carpeta', 'pegante', 'cuaderno', 'colores'],
    g3o: ['carrito', 'rompecabezas', 'muneca'], g3e: ['pelota', 'bloques', 'carrito'],
    g4o: ['tornillos', 'cinta', 'bombillo', 'linterna'], g4e: ['pintura', 'tornillos', 'bombillo'],
    g1s: ['olla', 'taza'], g2s: ['cuaderno', 'colores'], g3s: ['pelota', 'carrito'], g4s: ['pintura', 'bombillo'],
    g1n: ['platos', 'vasos'], g2n: ['colores', 'pegante'], g3n: ['bloques', 'carrito'], g4n: ['bombillo', 'tornillos'],
    mural: ['olla', 'platos', 'vasos', 'toallas'],
    colgados: ['espatula', 'cucharon', 'pinzas', 'rallador', 'pelador', 'tijeras'],
    este: ['florero', 'portarretrato', 'vela', 'cojin', 'tazaDeco'],
    expo: ['licuadora', 'arrocera', 'ventilador', 'plancha', 'sanduchera', 'licuadora', 'olla'],
    isla: ['morral', 'lonchera', 'cartuchera', 'cuaderno'],
    impulso: ['chicles', 'chocolatina', 'pegante'],
    escaparate: ['morral', 'licuadora', 'pelota'],
    almacen: ['cajaCarton'],
  },
};

// Letreros de sección (colgantes sobre cada pasillo y rótulos de pared).
export const SECCIONES = {
  super: {
    pasillos: [['Granos', 'y abarrotes'], ['Café, paquetes', 'y dulces'], ['Aseo', 'y hogar'], ['Bebidas', 'y gaseosas']],
    mural: 'Enlatados y conservas', este: 'Fruver · Frutas y verduras', fondo: ['Lácteos', 'Huevos y carnes frías', 'Bebidas frías'],
    isla: ['Panadería del día', 'Pandebono y almojábana'], escaparate: 'Ofertas de la semana',
  },
  general: {
    pasillos: [['Hogar', 'y cocina'], ['Papelería', ''], ['Juguetes', ''], ['Ferretería', 'y eléctricos']],
    mural: 'Cocina · Utensilios colgados', este: 'Regalos y decoración', fondo: ['Exposición especial', 'Electrodomésticos para el hogar'],
    isla: ['Regreso a clases', 'Morrales y loncheras'], escaparate: 'Temporada escolar',
  },
};

// Ofertas de las cabeceras (texto independiente de la moneda salvo el ahorro).
export const OFERTAS = {
  super: [{ id: 'aceite', txt: '2 × 1' }, { id: 'cafe', txt: 'Lleve 3, pague 2' }, { id: 'detergente', txt: '−20 %' }, { id: 'gaseosa', txt: '2 × 1' }],
  general: [{ id: 'olla', txt: '−30 %' }, { id: 'cuaderno', txt: '3 × 2' }, { id: 'pelota', txt: '−25 %' }, { id: 'pintura', txt: '−15 %' }],
};
