/**
 * The air in the chamber.
 *
 * A few dozen motes drifting slowly upward through the haze, so the stage
 * reads as a volume the machine hangs in rather than a sheet it is drawn on.
 * They are decoration and nothing else: aria-hidden, behind everything, never
 * in the way of a pointer.
 *
 * Cheap on purpose. One small canvas, about thirty frames a second, nothing at
 * all while the page is hidden, and a single still frame when motion is
 * unwelcome.
 */

import { reducedMotion } from '../haptics';
import { h } from '../dom';

export interface Motes {
  el: HTMLCanvasElement;
  destroy(): void;
}

interface Mote {
  x: number;
  y: number;
  z: number;
  s: number;
}

export function createMotes(): Motes {
  const el = h('canvas', { class: 'motes', 'aria-hidden': 'true' });
  const ctx = el.getContext('2d');
  const motes: Mote[] = Array.from({ length: 44 }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: 0.3 + Math.random() * 0.7,
    s: Math.random() * Math.PI * 2,
  }));

  let w = 0;
  let hgt = 0;
  let colour = '23 32 43';
  let raf = 0;
  let last = 0;
  let alive = true;

  function measure(): void {
    const rect = el.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = rect.width;
    hgt = rect.height;
    el.width = Math.max(1, Math.round(w * dpr));
    el.height = Math.max(1, Math.round(hgt * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    colour = getComputedStyle(el).getPropertyValue('--mote-rgb').trim() || colour;
  }

  function draw(t: number): void {
    if (!ctx || w === 0) return;
    ctx.clearRect(0, 0, w, hgt);
    const still = reducedMotion();
    for (const p of motes) {
      const y = (((p.y - (still ? 0 : t * 0.006 * p.z)) % 1) + 1) % 1;
      const x = p.x + (still ? 0 : Math.sin(t * 0.3 + p.s) * 0.004);
      const a = (0.05 + 0.11 * (0.5 + 0.5 * Math.sin((still ? 0 : t) * 0.9 + p.s))) * p.z;
      const size = 0.7 + p.z * 1.1;
      ctx.fillStyle = `rgb(${colour} / ${a.toFixed(3)})`;
      ctx.fillRect(x * w, y * hgt, size, size);
    }
  }

  function frame(now: number): void {
    if (!alive) return;
    if (document.hidden || reducedMotion()) {
      raf = 0;
      draw(now / 1000);
      return;
    }
    if (now - last > 32) {
      last = now;
      draw(now / 1000);
    }
    raf = requestAnimationFrame(frame);
  }

  function wake(): void {
    if (!alive || raf) return;
    raf = requestAnimationFrame(frame);
  }

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    measure();
    draw(performance.now() / 1000);
  });
  observer?.observe(el);
  const onVisible = (): void => wake();
  document.addEventListener('visibilitychange', onVisible);
  // The theme can change under it; its colour comes from a token.
  const themeWatch = new MutationObserver(() => {
    colour = getComputedStyle(el).getPropertyValue('--mote-rgb').trim() || colour;
    wake();
  });
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });
  requestAnimationFrame(() => {
    measure();
    wake();
  });

  return {
    el,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      themeWatch.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
