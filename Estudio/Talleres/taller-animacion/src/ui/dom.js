// Utilidades de DOM mínimas.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** append que ignora null / undefined / false y aplana listas (Element.append escribiría «null»). */
export function put(el, ...kids) {
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export function setTabs(container, attr, value, panesRoot, paneAttr) {
  $$(`[${attr}]`, container).forEach((b) => b.classList.toggle('on', b.getAttribute(attr) === value));
  $$(`[${paneAttr}]`, panesRoot).forEach((p) => p.classList.toggle('hidden', p.getAttribute(paneAttr) !== value));
}

export function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function prettyName(s) {
  const t = String(s).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
