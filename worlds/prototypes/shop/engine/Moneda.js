// Moneda de los precios.  El surtido guarda precios en pesos colombianos (COP) y
// se convierten con tasas FIJAS aproximadas (no es un conversor real: es para que
// el estudiante lea precios verosímiles en su moneda) y redondeo «de góndola».

export const MONEDAS = {
  COP: { nombre: 'Peso colombiano', porCOP: 1, peso: 'libra' },
  MXN: { nombre: 'Peso mexicano', porCOP: 1 / 210, peso: 'kilo' },
  EUR: { nombre: 'Euro', porCOP: 1 / 4500, peso: 'kilo' },
  USD: { nombre: 'Dólar estadounidense', porCOP: 1 / 4000, peso: 'kilo' },
};
export const MONEDA_POR_DEFECTO = 'COP';

const miles = (n, sep) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
const dos = (v, dec, sep) => { const [e, d] = v.toFixed(2).split('.'); return `${miles(+e, sep)}${dec}${d}`; };

/** Precio redondeado en la moneda pedida (número). */
export function convertir(cop, codigo = MONEDA_POR_DEFECTO) {
  const M = MONEDAS[codigo] ?? MONEDAS.COP, v = cop * M.porCOP;
  if (codigo === 'COP') return v < 1000 ? Math.max(50, Math.round(v / 50) * 50) : Math.round(v / 100) * 100;
  if (codigo === 'MXN') return Math.max(.5, Math.round(v * 2) / 2);
  // euro y dólar: acabados en 9 (0,49 · 2,99)
  const paso = v < 1 ? .05 : .1;
  return Math.max(.09, +(Math.round(v / paso) * paso - .01).toFixed(2));
}

/** Texto del precio: $3.500 · $16.50 · 0,79 € · US$0.89 */
export function formatear(cop, codigo = MONEDA_POR_DEFECTO) {
  const v = convertir(cop, codigo);
  switch (codigo) {
    case 'MXN': return `$${dos(v, '.', ',')}`;
    case 'EUR': return `${dos(v, ',', '.')} €`;
    case 'USD': return `US$${dos(v, '.', ',')}`;
    default: return `$${miles(Math.round(v), '.')}`;
  }
}

/** Precio por peso: en Colombia la fruta se vende por libra (500 g); fuera, por kilo. */
export function formatearPeso(copLibra, codigo = MONEDA_POR_DEFECTO) {
  const M = MONEDAS[codigo] ?? MONEDAS.COP;
  return M.peso === 'libra' ? `${formatear(copLibra, codigo)} la libra` : `${formatear(copLibra * 2, codigo)} el kilo`;
}
