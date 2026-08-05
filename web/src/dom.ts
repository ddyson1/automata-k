/**
 * A very small element builder.
 *
 * There is no framework here on purpose. Components build their nodes once and
 * then mutate them; nothing re-creates a tree, and nothing diffs. That matters
 * most on the diagram, where a drag writes transform attributes directly and
 * must never travel through application state.
 */

export type Attrs = Record<string, string | number | boolean | null | undefined>;
export type Child = Node | string | number | null | undefined | false;

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyChildren(node: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

function applyAttrs(node: Element, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.setAttribute('class', String(value));
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  applyChildren(node, children);
  return node;
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs);
  applyChildren(node, children);
  return node;
}

/** Replace every child of `node` with `children`. */
export function fill(node: Element, ...children: Child[]): void {
  node.textContent = '';
  applyChildren(node, children);
}

/** Add or remove a class and return the element, for chaining. */
export function toggle<T extends Element>(node: T, name: string, on: boolean): T {
  node.classList.toggle(name, on);
  return node;
}

/** Set an attribute only when it actually changed. Cheap, and keeps the DOM quiet. */
export function setAttr(node: Element, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

/** Set text only when it actually changed, so selection inside it survives. */
export function setText(node: Node, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

export type Cleanup = () => void;

/** Attach a listener and hand back the function that removes it. */
export function on<K extends keyof HTMLElementEventMap>(
  node: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): Cleanup;
export function on(
  node: EventTarget,
  type: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): Cleanup;
export function on(
  node: EventTarget,
  type: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): Cleanup {
  node.addEventListener(type, handler, options);
  return () => node.removeEventListener(type, handler, options);
}
