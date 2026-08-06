/**
 * The four corner icons.
 *
 * They were text glyphs, and two of them said the wrong thing. ⊞ is a grid,
 * and Tidy does not draw a grid or snap anything to one; it rearranges the
 * diagram. ⤢ is the fullscreen glyph, so on the button that frames the machine
 * it promised an expand and delivered a zoom to fit.
 *
 * Drawn rather than typed, so each one can say what its button does: Tidy is a
 * laid out graph, Fit is a frame closing around a shape. Undo and redo are
 * drawn too, only so all four carry the same weight; a hairline SVG next to a
 * 15px glyph looks like a rendering fault.
 *
 * None of them carries the whole meaning on its own, and none has to. Every
 * one of these buttons draws its own label on hover and on focus, and flashes
 * it after a press where there is no hover to draw it — see .tip in app.css.
 * The rule these were judged against is that a glyph must be distinct from the
 * three sitting beside it, not that it must be guessable in isolation.
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
 * Tidy: a laid out graph.
 *
 * The third go at this. ⊞ was a grid, and Tidy neither draws one nor snaps to
 * one. The wand carried a verb, but the wrong one — it says "do something
 * automatic", and at 18px in the corner it reads as a pushpin.
 *
 * Twelve candidates were drawn at 18px rather than argued about, and most died
 * on sight: three states in a row collapse into an ellipsis, layered bands are
 * the settings-sliders glyph, and four arrows gathering inward are Fit's own
 * corner brackets pointed the other way — sitting right next to Fit. What
 * survived is the thing the button leaves behind: states on ranks with the
 * edges between them, which is exactly what layoutMachine computes.
 */
export const tidyIcon = (): SVGSVGElement =>
  icon(
    svg('circle', { cx: 12, cy: 5.5, r: 2.4 }),
    svg('circle', { cx: 6, cy: 18, r: 2.4 }),
    svg('circle', { cx: 18, cy: 18, r: 2.4 }),
    path('M12 7.9v2.6'),
    path('M6 15.6V13h12v2.6'),
  );

/**
 * Fit: corner brackets, and nothing inside them.
 *
 * With a circle in the middle it was a camera's focus box, which is a promise
 * to take a picture. Empty brackets are the ordinary fit-to-view glyph, and
 * framing the machine is exactly what the button does.
 */
export const fitIcon = (): SVGSVGElement =>
  icon(path('M4 9V4h5'), path('M20 9V4h-5'), path('M4 15v5h5'), path('M20 15v5h-5'));
