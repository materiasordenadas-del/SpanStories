/**
 * Coloca las etiquetas de traducción rápida de un texto ya pintado.
 *
 * Todas las etiquetas de una línea van en una sola fila y cada traducción queda centrada sobre su palabra.
 * Las de palabras tocadas seguidas se estiran hasta tocarse y forman una barra. Si una traducción no cabe,
 * el texto abre un espacio antes de su palabra, igual que la línea se abre hacia arriba para la etiqueta.
 * Solo escribe estilos en línea que React no gestiona: --nudge, --extL, --extR, --rL, --rR y margin-left.
 */

const GAP = 6;
const JOIN_GAP = 9;
/** Lo máximo que una traducción se aparta del centro de su palabra antes de abrir espacio en el texto. */
const ALIGN_SLACK = 2;
/** Una etiqueta puede asomar un poco por la derecha de la columna de lectura. */
const RIGHT_OVERFLOW = 24;

type Item = {
  readonly host: HTMLElement;
  readonly chip: HTMLElement;
  readonly run: string;
  width: number;
  natural: number;
  top: number;
  nudge: number;
  left: number;
  right: number;
  minLeft: number;
  leftNeighbor: Item | null;
  extL: number;
  extR: number;
};

/** Elemento que recibe el espacio: el grupo con su puntuación de apertura, o la expresión si la palabra es la primera. */
function spacerOf(root: HTMLElement, host: HTMLElement): HTMLElement {
  let node = host;
  for (;;) {
    const outer = node.parentElement?.closest<HTMLElement>("[data-gloss-expression], [data-gloss-group]");
    if (outer == null || !root.contains(outer) || outer.querySelector("[data-gloss-host]") !== node) return node;
    node = outer;
  }
}

export function layoutQuickGloss(root: HTMLElement): void {
  for (const spaced of root.querySelectorAll<HTMLElement>("[data-gloss-spaced]")) {
    spaced.style.removeProperty("margin-left");
    spaced.removeAttribute("data-gloss-spaced");
  }
  const bounds = root.getBoundingClientRect();
  const items: Item[] = [];
  let previous: Item | null = null;

  for (const host of root.querySelectorAll<HTMLElement>('[data-gloss-host][data-gloss-state="on"]')) {
    const chip = host.querySelector<HTMLElement>(":scope > [data-gloss-row] > [data-gloss-chip]");
    const words = host.querySelector<HTMLElement>(":scope > [data-gloss-words]");
    if (chip === null || words === null) continue;
    for (const property of ["--nudge", "--extL", "--extR"]) chip.style.setProperty(property, "0px");
    chip.style.removeProperty("--rL");
    chip.style.removeProperty("--rR");

    const item: Item = { host, chip, run: host.dataset.glossRun ?? "", width: 0, natural: 0, top: 0, nudge: 0, left: 0, right: 0, minLeft: bounds.left, leftNeighbor: null, extL: 0, extR: 0 };
    // Posición natural: la etiqueta centrada sobre su palabra, sin corrimiento ni estiramiento.
    const measure = () => {
      const rect = chip.getBoundingClientRect();
      item.width = rect.width;
      item.natural = rect.left;
      item.top = words.getBoundingClientRect().top;
    };
    const place = (target: Item, nudge: number) => {
      target.nudge = nudge;
      target.left = target.natural + nudge;
      target.right = target.left + target.width;
    };

    measure();
    if (previous !== null && Math.abs(previous.top - item.top) > 6) previous = null;
    if (previous !== null && previous.run === item.run) item.leftNeighbor = previous;
    const gap = item.leftNeighbor === null ? GAP : JOIN_GAP;
    item.minLeft = previous === null ? bounds.left : previous.right + gap;
    place(item, Math.max(0, item.minLeft - item.natural));

    if (previous !== null) {
      let deficit = item.minLeft - item.natural;
      if (deficit > 0) {
        // 1 · La etiqueta de la izquierda cede un poco, 2 · esta avanza un poco, 3 · el texto abre el resto.
        const back = Math.max(0, Math.min(deficit / 2, previous.nudge + ALIGN_SLACK, previous.left - previous.minLeft));
        place(previous, previous.nudge - back);
        item.minLeft = previous.right + gap;
        deficit -= back;
        const own = Math.min(deficit, ALIGN_SLACK);
        deficit -= own;
        place(item, own);
        if (deficit > 0.5) {
          const spacer = spacerOf(root, host);
          spacer.style.marginLeft = `${deficit}px`;
          spacer.setAttribute("data-gloss-spaced", "");
          const lineTop = previous.top;
          measure();
          if (Math.abs(item.top - lineTop) > 6) {
            // El espacio mandó la palabra a la línea siguiente: allí no hace falta.
            spacer.style.removeProperty("margin-left");
            spacer.removeAttribute("data-gloss-spaced");
            measure();
            item.leftNeighbor = null;
            item.minLeft = bounds.left;
            place(item, Math.max(0, bounds.left - item.natural));
          } else {
            place(item, own);
          }
        }
      }
    }
    if (item.right > bounds.right + RIGHT_OVERFLOW) place(item, item.nudge - Math.min(item.nudge + ALIGN_SLACK, item.right - bounds.right - RIGHT_OVERFLOW));
    items.push(item);
    previous = item;
  }

  // Las etiquetas de un mismo grupo se estiran hacia el medio del hueco hasta tocarse. El corrimiento
  // de la caja compensa el estiramiento para que texto y flecha sigan sobre su palabra.
  for (const item of items) {
    const neighbor = item.leftNeighbor;
    if (neighbor === null) continue;
    const half = (item.left - neighbor.right) / 2 + 0.5;
    neighbor.extR = half;
    item.extL = half;
  }
  for (const item of items) {
    const style = item.chip.style;
    style.setProperty("--extL", `${item.extL}px`);
    style.setProperty("--extR", `${item.extR}px`);
    style.setProperty("--nudge", `${item.nudge + (item.extR - item.extL) / 2}px`);
    if (item.extL > 0) style.setProperty("--rL", "0"); else style.removeProperty("--rL");
    if (item.extR > 0) style.setProperty("--rR", "0"); else style.removeProperty("--rR");
  }
}
