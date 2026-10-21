// Carta de la cafetería STARBACK en español neutro.  Precios base en USD (Moneda.js):
// el tamaño chico cuesta `precio`; cada tamaño suma su `extra`.
// `nota` = variante regional que se enseña al pulsar (el panel y los carteles la usan).

export const TAMANOS = [
  { id: 'chico', nombre: 'Chico', oz: 12, ml: 355, extra: 0 },
  { id: 'mediano', nombre: 'Mediano', oz: 16, ml: 473, extra: .5 },
  { id: 'grande', nombre: 'Grande', oz: 20, ml: 591, extra: .9 },
];

export const SECCIONES = [
  { id: 'calientes', titulo: 'Bebidas calientes' },
  { id: 'frias', titulo: 'Bebidas frías' },
  { id: 'otras', titulo: 'Tés y más' },
];

export const BEBIDAS = [
  { id: 'americano', nombre: 'Café americano', seccion: 'calientes', precio: 2.75, genero: 'm' },
  { id: 'espresso', nombre: 'Espresso', seccion: 'calientes', precio: 2.25, genero: 'm', sinTamano: true },
  { id: 'capuchino', nombre: 'Capuchino', seccion: 'calientes', precio: 3.75, genero: 'm', leche: true },
  { id: 'latte', nombre: 'Latte', seccion: 'calientes', precio: 3.95, genero: 'm', leche: true },
  { id: 'moca', nombre: 'Moca', seccion: 'calientes', precio: 4.25, genero: 'm', leche: true },
  { id: 'chocolate', nombre: 'Chocolate caliente', seccion: 'calientes', precio: 3.5, genero: 'm', leche: true },
  { id: 'frio', nombre: 'Café frío', seccion: 'frias', precio: 3.25, genero: 'm', hielo: true },
  { id: 'frappe', nombre: 'Frappé de café', seccion: 'frias', precio: 4.75, genero: 'm', leche: true, hielo: true },
  { id: 'latteHelado', nombre: 'Latte helado', seccion: 'frias', precio: 4.25, genero: 'm', leche: true, hielo: true },
  { id: 'limonada', nombre: 'Limonada', seccion: 'frias', precio: 3.0, genero: 'f', hielo: true },
  { id: 'te', nombre: 'Té negro o verde', seccion: 'otras', precio: 2.5, genero: 'm' },
  { id: 'chai', nombre: 'Chai latte', seccion: 'otras', precio: 3.95, genero: 'm', leche: true },
  { id: 'infusion', nombre: 'Infusión de frutas', seccion: 'otras', precio: 2.5, genero: 'f',
    nota: 'En Colombia se dice «aromática».' },
];

export const LECHES = [
  { id: 'entera', nombre: 'leche entera', extra: 0 },
  { id: 'deslactosada', nombre: 'leche deslactosada', extra: 0 },
  { id: 'almendra', nombre: 'leche de almendra', extra: .6 },
  { id: 'avena', nombre: 'leche de avena', extra: .6 },
];

export const EXTRAS = [
  { id: 'shot', nombre: 'Carga extra de espresso', precio: .8 },
  { id: 'jarabe', nombre: 'Jarabe (vainilla, caramelo)', precio: .6 },
  { id: 'crema', nombre: 'Crema batida', precio: .5 },
];

// Pan de la vitrina: forma (para el lote de instancias), color y precio.
export const PAN = [
  { id: 'croissant', nombre: 'el cruasán', precio: 2.5, forma: 'cuerno', color: '#d99a4e', nota: 'También «croissant» o, en México, «cuerno».' },
  { id: 'muffin', nombre: 'el muffin de arándanos', precio: 2.75, forma: 'muffin', color: '#c98b52', nota: 'En México, «mantecada» o «panqué».' },
  { id: 'galleta', nombre: 'la galleta con chispas de chocolate', precio: 1.75, forma: 'disco', color: '#c9955a' },
  { id: 'brownie', nombre: 'el brownie', precio: 2.5, forma: 'cuadro', color: '#5b3a28' },
  { id: 'rol', nombre: 'el rol de canela', precio: 2.95, forma: 'rollo', color: '#c7874b' },
  { id: 'sandwich', nombre: 'el sándwich de jamón y queso', precio: 4.5, forma: 'sandwich', color: '#e8c78f', nota: 'En España y Argentina, «tostado» o «bocadillo» según el pan.' },
  { id: 'pastel', nombre: 'la rebanada de pastel de zanahoria', precio: 3.5, forma: 'cuna', color: '#f1e3c8', nota: 'En Colombia y Venezuela, «torta»; en España, «tarta».' },
];

export const bebida = id => BEBIDAS.find(b => b.id === id);
export const tamano = id => TAMANOS.find(t => t.id === id);
export const lecheDe = id => LECHES.find(l => l.id === id);

/** Precio de un pedido (USD). */
export function precioPedido({ bebida: b, tamano: t = 'chico', leche = 'entera' }) {
  const B = bebida(b); if (!B) return 0;
  const extraT = B.sinTamano ? 0 : (tamano(t)?.extra ?? 0);
  const extraL = B.leche ? (lecheDe(leche)?.extra ?? 0) : 0;
  return +(B.precio + extraT + extraL).toFixed(2);
}

/** «un latte mediano con leche de avena» — concordancia con el género de la bebida. */
export function describirPedido({ bebida: b, tamano: t = 'chico', leche = 'entera' }, { articulo = true } = {}) {
  const B = bebida(b); if (!B) return '';
  const f = B.genero === 'f';
  let s = `${articulo ? (f ? 'una ' : 'un ') : ''}${B.nombre.charAt(0).toLowerCase() + B.nombre.slice(1)}`;
  if (!B.sinTamano) {
    const T = tamano(t)?.nombre.toLowerCase() ?? 'chico';
    s += ' ' + (f ? T.replace(/o$/, 'a') : T);
  }
  if (B.leche && leche !== 'entera') s += ` con ${lecheDe(leche).nombre}`;
  return s;
}
