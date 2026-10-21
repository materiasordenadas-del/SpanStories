// Carta de la Trattoria La Nonna.  Cada plato sabe cómo se pide en español:
// `uno` es la forma con artículo indefinido y `varios` el plural sin número.
// `plato` elige el modelo que aparece en la mesa al pedir.

export const SECCIONES = [
  { id: 'entrantes', titulo: 'Antipasti', es: 'Entrantes' },
  { id: 'pasta', titulo: 'Primi', es: 'Pasta' },
  { id: 'pizza', titulo: 'Pizze', es: 'Pizzas' },
  { id: 'segundos', titulo: 'Secondi', es: 'Segundos' },
  { id: 'postres', titulo: 'Dolci', es: 'Postres' },
  { id: 'bebidas', titulo: 'Bevande', es: 'Bebidas' },
];

export const PLATOS = [
  { id: 'bruschetta', seccion: 'entrantes', it: 'Bruschetta al pomodoro', es: 'Pan tostado con tomate, ajo y albahaca', precio: 5, uno: 'una bruschetta', varios: 'bruschettas', plato: 'bruschetta', icono: '🍅' },
  { id: 'caprese', seccion: 'entrantes', it: 'Insalata caprese', es: 'Tomate, mozzarella fresca y albahaca', precio: 8, uno: 'una ensalada caprese', varios: 'ensaladas caprese', plato: 'ensalada', icono: '🥗' },
  { id: 'minestrone', seccion: 'entrantes', it: 'Minestrone', es: 'Sopa de verduras de la nonna', precio: 7, uno: 'una sopa minestrone', varios: 'sopas minestrone', plato: 'sopa', icono: '🥣' },
  { id: 'carbonara', seccion: 'pasta', it: 'Spaghetti alla carbonara', es: 'Espaguetis con huevo, queso pecorino y panceta', precio: 12, uno: 'unos espaguetis a la carbonara', varios: 'raciones de espaguetis a la carbonara', plato: 'espaguetis', icono: '🍝' },
  { id: 'bolonesa', seccion: 'pasta', it: 'Tagliatelle al ragù', es: 'Tallarines con salsa boloñesa', precio: 13, uno: 'unos tallarines a la boloñesa', varios: 'raciones de tallarines a la boloñesa', plato: 'tallarines', icono: '🍝' },
  { id: 'lasana', seccion: 'pasta', it: 'Lasagna della nonna', es: 'Lasaña de carne al horno', precio: 13, uno: 'una lasaña', varios: 'lasañas', plato: 'lasana', icono: '🧀' },
  { id: 'ravioli', seccion: 'pasta', it: 'Ravioli ricotta e spinaci', es: 'Raviolis de ricota y espinacas', precio: 14, uno: 'unos raviolis de ricota', varios: 'raciones de raviolis de ricota', plato: 'raviolis', icono: '🥟' },
  { id: 'margarita', seccion: 'pizza', it: 'Pizza Margherita', es: 'Tomate, mozzarella y albahaca', precio: 10, uno: 'una pizza margarita', varios: 'pizzas margarita', plato: 'pizza', icono: '🍕' },
  { id: 'cuatroquesos', seccion: 'pizza', it: 'Pizza quattro formaggi', es: 'Cuatro quesos italianos', precio: 12, uno: 'una pizza cuatro quesos', varios: 'pizzas cuatro quesos', plato: 'pizzaBlanca', icono: '🍕' },
  { id: 'diavola', seccion: 'pizza', it: 'Pizza diavola', es: 'Tomate, mozzarella y salami picante', precio: 12, uno: 'una pizza diávola', varios: 'pizzas diávola', plato: 'pizzaSalami', icono: '🌶️' },
  { id: 'ossobuco', seccion: 'segundos', it: 'Ossobuco alla milanese', es: 'Jarrete de ternera guisado con puré', precio: 19, uno: 'un ossobuco', varios: 'ossobucos', plato: 'carne', icono: '🍖' },
  { id: 'pescado', seccion: 'segundos', it: 'Branzino al forno', es: 'Lubina al horno con limón', precio: 18, uno: 'una lubina al horno', varios: 'lubinas al horno', plato: 'pescado', icono: '🐟' },
  { id: 'tiramisu', seccion: 'postres', it: 'Tiramisù', es: 'Bizcocho con café, mascarpone y cacao', precio: 6, uno: 'un tiramisú', varios: 'tiramisús', plato: 'tiramisu', icono: '☕' },
  { id: 'pannacotta', seccion: 'postres', it: 'Panna cotta', es: 'Crema cocida con frutos rojos', precio: 6, uno: 'una panna cotta', varios: 'panna cottas', plato: 'pannacotta', icono: '🍮' },
  { id: 'helado', seccion: 'postres', it: 'Gelato artigianale', es: 'Helado artesano: vainilla, pistacho o chocolate', precio: 5, uno: 'un helado', varios: 'helados', plato: 'helado', icono: '🍨' },
  { id: 'vinotinto', seccion: 'bebidas', it: 'Chianti (calice)', es: 'Copa de vino tinto de la Toscana', precio: 5, uno: 'una copa de vino tinto', varios: 'copas de vino tinto', plato: 'vinoTinto', icono: '🍷' },
  { id: 'vinoblanco', seccion: 'bebidas', it: 'Pinot grigio (calice)', es: 'Copa de vino blanco', precio: 5, uno: 'una copa de vino blanco', varios: 'copas de vino blanco', plato: 'vinoBlanco', icono: '🥂' },
  { id: 'agua', seccion: 'bebidas', it: 'Acqua minerale', es: 'Agua mineral, con o sin gas', precio: 2.5, uno: 'un agua mineral', varios: 'aguas minerales', plato: 'agua', icono: '💧' },
  { id: 'refresco', seccion: 'bebidas', it: 'Aranciata', es: 'Refresco de naranja italiano', precio: 3, uno: 'un refresco de naranja', varios: 'refrescos de naranja', plato: 'refresco', icono: '🍊' },
  { id: 'cafe', seccion: 'bebidas', it: 'Caffè espresso', es: 'Café solo', precio: 1.8, uno: 'un café solo', varios: 'cafés solos', plato: 'cafe', icono: '☕' },
];

const NUMEROS = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
export const precio = n => `${n.toFixed(2).replace('.', ',').replace(',00', '')} €`;

/** «Quisiera una pizza margarita, dos copas de vino tinto y un tiramisú, por favor.» */
export function frasePedido(pedido, { cortesia = 'Quisiera' } = {}) {
  const partes = [];
  for (const { id, cantidad } of pedido) {
    const p = PLATOS.find(x => x.id === id); if (!p || cantidad < 1) continue;
    partes.push(cantidad === 1 ? p.uno : `${NUMEROS[cantidad] ?? cantidad} ${p.varios}`);
  }
  if (!partes.length) return '';
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
  return `${cortesia} ${lista}, por favor.`;
}

export function totalPedido(pedido) {
  return pedido.reduce((s, { id, cantidad }) => s + (PLATOS.find(x => x.id === id)?.precio || 0) * cantidad, 0);
}
