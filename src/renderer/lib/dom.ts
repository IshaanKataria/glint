// Small DOM helpers shared by the overlay and dashboard renderers.
import { createElement, type IconNode } from 'lucide';
import type { Result } from '../../shared/contract';

type Attrs = Record<string, string | number | boolean | undefined | null | EventListener>;
type Child = Node | string | null | undefined | false;

/** Create an element: h('button.chip', { title: 'x', onclick }, 'label', icon(...)). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | `${K}.${string}` | `${K}#${string}`,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [base, ...rest] = tag.split('.');
  const [name, id] = base.split('#');
  const el = document.createElement(name as K);
  if (id) el.id = id;
  if (rest.length) el.className = rest.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = `${el.className} ${String(v)}`.trim();
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(c);
  return el;
}

/** A lucide line icon as an inline SVG (stroke = currentColor). */
export function icon(node: IconNode, size = 16, strokeWidth = 1.75): SVGElement {
  const svg = createElement(node);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ico');
  return svg;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Glint's mark: the concave four-point spark sqrt|x| + sqrt|y| <= 1 (same curve as assets/icon.png).
 * Each quadrant edge is exactly a quadratic Bézier with its control point at the centre.
 */
export function glintMark(size = 16, cls = 'glint-mark'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add(cls);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M12 1.5 Q12 12 22.5 12 Q12 12 12 22.5 Q12 12 1.5 12 Q12 12 12 1.5 Z');
  p.setAttribute('fill', 'currentColor');
  // Fattening stroke so the spark reads at 12-16px (the pure curve is hairline-thin near the tips).
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2.2');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}

/** Keycap row: kbd(['⌘', '↵']). */
export function kbds(keys: string[], cls = 'kc'): HTMLElement[] {
  return keys.map((k) => h(`kbd.${cls}`, { text: k }));
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`glint ui: missing ${sel}`);
  return el;
};

/** Human message for a failed Result (never contains secrets: main already strips them). */
export function errorText(r: Extract<Result<unknown>, { ok: false }>): string {
  const { code, message } = r.error;
  if (code === 'NOT_IMPLEMENTED') return 'This part of Glint is still being built. Try again once the service is ready.';
  if (code === 'NO_API_KEY') return 'No DeepSeek API key found. Set DEEPSEEK_API_KEY and restart Glint.';
  if (code === 'PERMISSION_DENIED') return `${message} (check System Settings › Privacy & Security).`;
  return message || code;
}
