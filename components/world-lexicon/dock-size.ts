/**
 * Altura del panel inferior del Estudio (Secuencia / Dirección). Es la variable CSS `--dock-size` que usa la
 * rejilla de `.studio`; el visor (y el escenario «En escena» del Taller) ocupa el resto. Se recuerda en este
 * navegador. La comparten el asa del propio panel y la del Taller (que pide el cambio por `SCENE {op:'dock'}`).
 */
const KEY = 'estudio.alturaPanelInferior';
export const DOCK_DEFAULT = 320;
/** Lo justo para la cabecera del panel (pestañas y botones). */
export const DOCK_MIN = 44;

const clamp = (px: number) => Math.max(DOCK_MIN, Math.min(Math.round(window.innerHeight * 0.7), Math.round(px)));

export function getDockSize(): number {
  const v = parseFloat(document.documentElement.style.getPropertyValue('--dock-size'));
  return Number.isFinite(v) && v > 0 ? v : DOCK_DEFAULT;
}

export function setDockSize(px: number, save = true): number {
  if (!Number.isFinite(px)) return getDockSize();
  const v = clamp(px);
  document.documentElement.style.setProperty('--dock-size', `${v}px`);
  if (save) try { localStorage.setItem(KEY, String(v)); } catch { /* sin almacenamiento: solo esta sesión */ }
  return v;
}

export function restoreDockSize() {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (v > 0) setDockSize(v, false);
  } catch { /* sin almacenamiento */ }
}
