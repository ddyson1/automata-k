/**
 * Notation rendering.
 *
 * The engine writes exponents as `^n`, `^R` and so on rather than as Unicode
 * superscripts. That is not a compromise: the type study measured every
 * non-ASCII character the app shows against nine families, and the superscript
 * codepoints were carried by none of them, so every build was silently falling
 * back to a system face or drawing tofu. `^x` is portable, and both renderers
 * can raise it themselves. This is the web half of that.
 *
 * `^` followed by a single letter or digit raises that one character. A `^`
 * before anything else, or at the end of a string, is left alone.
 */

const SUPERSCRIPTABLE = /^[A-Za-z0-9]$/;

/**
 * Render a notation string into a fragment, raising `^x` runs.
 * Everything else passes through as plain text, so it stays selectable and
 * copyable as the source string minus the carets.
 */
export function notation(source: string): DocumentFragment {
  const out = document.createDocumentFragment();
  let plain = '';

  const flush = (): void => {
    if (plain.length === 0) return;
    out.appendChild(document.createTextNode(plain));
    plain = '';
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i] as string;
    const next = source[i + 1];
    if (ch === '^' && next !== undefined && SUPERSCRIPTABLE.test(next)) {
      flush();
      const sup = document.createElement('sup');
      sup.className = 'sup';
      sup.textContent = next;
      out.appendChild(sup);
      i++;
      continue;
    }
    plain += ch;
  }
  flush();
  return out;
}

/** Set an element's content to a rendered notation string. */
export function setNotation(node: Element, source: string): void {
  if (node.getAttribute('data-src') === source) return;
  node.setAttribute('data-src', source);
  node.textContent = '';
  node.appendChild(notation(source));
}

/**
 * The same string with carets dropped, for places that cannot hold markup:
 * SVG labels, aria-labels, document titles.
 */
export function flatten(source: string): string {
  return source.replace(/\^([A-Za-z0-9])/g, '$1');
}
