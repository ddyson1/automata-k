/**
 * The four corner icons.
 *
 * They were text glyphs, and two of them said the wrong thing. ⊞ is a grid,
 * and Tidy does not draw a grid or snap anything to one; it rearranges the
 * diagram. ⤢ is the fullscreen glyph, so on the button that frames the machine
 * it promised an expand and delivered a zoom to fit.
 *
 * Drawn rather than typed, so each one can say what its button does: Tidy is a
 * diagram being straightened into a row, Fit is a frame closing around a shape.
 * Undo and redo are drawn too, only so all four carry the same weight; a
 * hairline SVG next to a 15px glyph looks like a rendering fault.
 */

import { svg } from './dom';

const SIZE = 18;

function icon(...children: SVGElement[]): SVGSVGElement {
  return svg(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: SIZE,
      height: SIZE,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    ...children,
  );
}

const path = (d: string): SVGPathElement => svg('path', { d });

/** An arrow curving back on itself, anticlockwise. */
export const undoIcon = (): SVGSVGElement =>
  icon(path('M4 9h9a5 5 0 0 1 0 10H8'), path('M8 5 4 9l4 4'));

export const redoIcon = (): SVGSVGElement =>
  icon(path('M20 9h-9a5 5 0 0 0 0 10h5'), path('M16 5l4 4-4 4'));

/**
 * Tidy: a wand.
 *
 * Everything made of circles and lines was tried first, at the size these
 * actually render. Three joined dots come out as an overflow menu, two come
 * out as a link, and the fork comes out as the share glyph. What was missing
 * from the old ⊞ was the verb, not the noun, so the icon carries the verb and
 * the tooltip carries the noun.
 */
export const tidyIcon = (): SVGSVGElement =>
  icon(path('M4 20 14.5 9.5'), path('M13.6 4.4 15 7.9l3.5 1.4L15 10.7l-1.4 3.5-1.4-3.5-3.5-1.4 3.5-1.4z'));

/**
 * Fit: corner brackets, and nothing inside them.
 *
 * With a circle in the middle it was a camera's focus box, which is a promise
 * to take a picture. Empty brackets are the ordinary fit-to-view glyph, and
 * framing the machine is exactly what the button does.
 */
export const fitIcon = (): SVGSVGElement =>
  icon(path('M4 9V4h5'), path('M20 9V4h-5'), path('M4 15v5h5'), path('M20 15v5h-5'));
