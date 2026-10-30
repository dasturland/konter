// Tiny DOM helpers. Text is always inserted as text nodes, never as HTML.
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Restarts a CSS animation class on an element (used for number pops). */
export function retrigger(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Builds a small inline SVG icon from path data. Paths use a 24x24 view box and stroke only. */
export function icon(name, size = 22) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `icon icon-${name}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.3');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of ICONS[name] ?? []) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

const ICONS = {
  medkit: ['M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z', 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', 'M12 10.5v6M9 13.5h6'],
  shield: ['M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z'],
  bullet: ['M9 21V9c0-2.5 1.5-4.5 3-6 1.5 1.5 3 3.5 3 6v12z', 'M9 17h6'],
  bomb: ['M11 21a7 7 0 1 1 6.2-10.2', 'M16 7l2-2M18 3.5l1.5 1.5M19.5 8H22', 'M8.5 12.5a3.5 3.5 0 0 1 3-2'],
  kit: ['M3 9h18v10H3z', 'M8 9V6h8v3', 'M12 12v4M10 14h4'],
  pause: ['M9 6v12M15 6v12'],
  skull: ['M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3z', 'M9.5 12.5h.01M14.5 12.5h.01', 'M10 19v2M14 19v2'],
  crosshair: ['M12 4v5M12 15v5M4 12h5M15 12h5'],
};
