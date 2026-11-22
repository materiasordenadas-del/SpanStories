// Pantalla negra con barra 0–100 % que tapa el mundo solo durante la primera carga.
// Una vez retirada no vuelve a aparecer: el streaming posterior sigue en segundo plano.
export function crearCargaInicial(host, { doc = document, programar = requestAnimationFrame } = {}) {
  const raiz = doc.createElement('div');
  raiz.className = 'carga-inicial';
  raiz.setAttribute('role', 'progressbar');
  raiz.setAttribute('aria-label', 'Cargando el mundo');
  raiz.setAttribute('aria-valuemin', '0');
  raiz.setAttribute('aria-valuemax', '100');
  raiz.innerHTML = '<div class="carga-caja"><p class="carga-titulo">Cargando el mundo</p><div class="carga-barra"><span></span></div><p class="carga-cifra">0 %</p></div>';
  const relleno = raiz.querySelector('.carga-barra span'), cifra = raiz.querySelector('.carga-cifra');
  host.append(raiz);
  let actual = 0, terminada = false;
  const pintar = valor => {
    const pct = Math.round(valor * 100);
    relleno.style.width = pct + '%'; cifra.textContent = pct + ' %'; raiz.setAttribute('aria-valuenow', String(pct));
  };
  pintar(0);
  return {
    get terminada() { return terminada; },
    // La barra nunca retrocede.
    avance(fraccion) {
      if (terminada || !Number.isFinite(fraccion)) return;
      const valor = Math.min(.99, Math.max(actual, fraccion));
      if (valor !== actual) { actual = valor; pintar(valor); }
    },
    // Llega al 100 % y se retira cuando la escena ya se ha dibujado.
    terminar() {
      if (terminada) return;
      terminada = true; actual = 1; pintar(1);
      programar(() => programar(() => { raiz.dataset.salida = 'true'; setTimeout(() => raiz.remove(), 400); }));
    },
    fallar(mensaje) {
      if (terminada) return;
      terminada = true; raiz.dataset.error = 'true';
      raiz.querySelector('.carga-titulo').textContent = 'No se pudo cargar el mundo';
      cifra.textContent = mensaje;
    }
  };
}
