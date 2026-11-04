// Marca de la cafetería: versión alternativa (pedida por el usuario el 2026-09-25)
// con los colores de una cadena de café latinoamericana, SIN su logo ni su sirena.
// El emblema es propio: una estrella blanca en un círculo verde.  Para cambiar el
// nombre en toda la escena (letrero, pantalla, diálogos, wifi) basta con tocar aquí.

export const MARCA = {
  nombre: 'STARBACK',
  lema: 'COFFEE',
  wifi: 'Starback_Clientes',
  colores: {
    verde: '#00704a',          // verde de marca
    verdeCasa: '#1e3932',      // verde oscuro (pizarras, letrero)
    verdeAcento: '#006241',
    verdeClaro: '#d4e9e2',
    dorado: '#cba258',
    crema: '#f2f0eb',
  },
};

/** Emblema propio: anillo blanco, círculo verde, estrella de cinco puntas y el nombre en arco. */
export function pintarEmblema(c, cx, cy, r, { texto = true } = {}) {
  const C = MARCA.colores;
  c.save();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = C.verde; c.beginPath(); c.arc(cx, cy, r * .93, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, cy, r * .6, 0, Math.PI * 2); c.fill();
  c.fillStyle = C.verde; c.beginPath(); c.arc(cx, cy, r * .55, 0, Math.PI * 2); c.fill();
  // estrella
  c.fillStyle = '#ffffff'; c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .19 : r * .44;
    c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  c.closePath(); c.fill();
  if (texto) {
    // nombre en arco arriba y lema abajo, dentro del anillo verde
    c.fillStyle = '#ffffff'; c.font = `700 ${r * .2}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const arco = (t, centro, sentido) => {
      const paso = .2 * (r * .2) / (r * .77) * 4.2;
      [...t].forEach((ch, i) => {
        const a = centro + (i - (t.length - 1) / 2) * paso * sentido;
        c.save(); c.translate(cx + Math.cos(a) * r * .77, cy + Math.sin(a) * r * .77); c.rotate(a + Math.PI / 2 * sentido); c.fillText(ch, 0, 0); c.restore();
      });
    };
    arco(MARCA.nombre, -Math.PI / 2, 1);
    arco(MARCA.lema, Math.PI / 2, -1);
    for (const a of [Math.PI, 0]) { c.beginPath(); c.arc(cx + Math.cos(a) * r * .77, cy, r * .035, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
}
