// Moneda de los precios.  La carta guarda precios en dólares (USD: la moneda de
// Ecuador, El Salvador y Panamá; base neutra) y se convierten con tasas FIJAS
// aproximadas y redondeo «de carta».  No es un conversor real: es para que el
// estudiante lea precios verosímiles en la moneda que elija.

export const MONEDAS = {
  USD: { nombre: 'Dólar', porUSD: 1 },
  MXN: { nombre: 'Peso mexicano', porUSD: 18 },
  COP: { nombre: 'Peso colombiano', porUSD: 4000 },
  PEN: { nombre: 'Sol peruano', porUSD: 3.7 },
  CLP: { nombre: 'Peso chileno', porUSD: 950 },
  EUR: { nombre: 'Euro', porUSD: .92 },
};
export const MONEDA_POR_DEFECTO = 'USD';

const miles = (n, sep) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
const dos = (v, dec, sep) => { const [e, d] = v.toFixed(2).split('.'); return `${miles(+e, sep)}${dec}${d}`; };

/** Precio redondeado en la moneda pedida (número). */
export function convertir(usd, codigo = MONEDA_POR_DEFECTO) {
  const v = usd * (MONEDAS[codigo] ?? MONEDAS.USD).porUSD;
  switch (codigo) {
    case 'MXN': return Math.max(5, Math.round(v / 5) * 5);          // $65 · $70
    case 'COP': case 'CLP': return Math.max(100, Math.round(v / 100) * 100);   // $9.500 · $3.200
    case 'PEN': return Math.max(.5, Math.round(v * 2) / 2);          // S/ 12.50
    default: return Math.max(.25, Math.round(v * 4) / 4);             // 4.25 · 4.50
  }
}

/** Texto del precio: US$4.50 · $80 · $18.000 · S/ 16.50 · $4.300 · 4,25 € */
export function formatear(usd, codigo = MONEDA_POR_DEFECTO) {
  const v = convertir(usd, codigo);
  switch (codigo) {
    case 'MXN': return `$${miles(v, ',')}`;
    case 'COP': case 'CLP': return `$${miles(v, '.')}`;
    case 'PEN': return `S/ ${dos(v, '.', ',')}`;
    case 'EUR': return `${dos(v, ',', '.')} €`;
    default: return `US$${dos(v, '.', ',')}`;
  }
}
