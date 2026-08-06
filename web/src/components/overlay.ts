/**
 * The formal layer, on request.
 *
 * The brief is what the level asks. This is what the machine is: the tuple, the
 * transition function, the theory behind the language, and the analyses. It
 * slides over the brief rather than sitting beside it, because on any screen
 * narrow enough to matter there is only room for one of them, and because
 * having both permanently on show is the thing that made the last interface
 * exhausting.
 */

import type { Level, Machine, TransitionId } from '../../../src/engine/types';
import type { DeltaLine } from '../../../src/engine/formal';
import { h, on } from '../dom';
import { createLedger } from './ledger';
import type { Ledger } from './ledger';
import { buildAnalysis, defaultSection } from './analysis';
import type { AnalysisSection } from './analysis';
import { buildHint, buildTheory } from './theory';

export type OverlayTab = 'machine' | 'theory' | 'analysis' | 'hint';

const TABS: { key: OverlayTab; label: string }[] = [
  { key: 'machine', label: 'Machine' },
  { key: 'theory', label: 'Theory' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'hint', label: 'Stuck' },
];

export interface OverlayCallbacks {
  onClose: () => void;
  onHighlight: (ids: readonly TransitionId[]) => void;
  onActivateRule: (line: DeltaLine) => void;
  onAdopt: (machine: Machine, description: string) => void;
  onReveal: () => void;
}

export interface OverlayState {
  level: Level;
  machine: Machine;
  selected: readonly TransitionId[];
  shownSolution: boolean;
}

export interface Overlay {
  el: HTMLElement;
  open(tab: OverlayTab): void;
  close(): void;
  update(state: OverlayState): void;
  readonly isOpen: boolean;
}

export function createOverlay(callbacks: OverlayCallbacks): Overlay {
  const tabs = h('nav', { class: 'ov-tabs', role: 'tablist' });
  const body = h('div', { class: 'ov-body' });
  const close = h(
    'button',
    { class: 'ov-close', type: 'button', 'aria-label': 'Close', 'data-testid': 'overlay-close' },
    '×',
  );
  const grab = h('div', { class: 'ov-grab', 'aria-hidden': 'true' });

  const el = h(
    'aside',
    {
      class: 'overlay',
      'data-testid': 'overlay',
      role: 'dialog',
      'aria-label': 'The machine',
      hidden: true,
    },
    grab,
    h('div', { class: 'ov-head' }, tabs, close),
    body,
  );

  const ledger: Ledger = createLedger({
    onHighlight: callbacks.onHighlight,
    onActivate: callbacks.onActivateRule,
  });

  let tab: OverlayTab = 'machine';
  let analysisTab: AnalysisSection | null = null;
  let open = false;
  let state: OverlayState | null = null;

  const buttons = new Map<OverlayTab, HTMLButtonElement>();
  for (const entry of TABS) {
    const node = h(
      'button',
      {
        class: 'ov-tab',
        type: 'button',
        role: 'tab',
        'data-testid': `tab-${entry.key}`,
      },
      entry.label,
    );
    on(node, 'click', () => {
      tab = entry.key;
      paint();
    });
    buttons.set(entry.key, node);
    tabs.appendChild(node);
  }

  function paint(): void {
    for (const [key, node] of buttons) {
      const on_ = key === tab;
      node.classList.toggle('is-on', on_);
      node.setAttribute('aria-selected', String(on_));
    }
    if (!state) return;

    if (tab === 'machine') {
      if (body.firstChild !== ledger.el) {
        body.textContent = '';
        body.appendChild(ledger.el);
      }
      ledger.update({
        machine: state.machine,
        level: state.level,
        selected: state.selected,
      });
      return;
    }
    if (tab === 'theory') {
      buildTheory(body, state.level, state.machine);
      return;
    }
    if (tab === 'analysis') {
      buildAnalysis(body, state.machine, state.level, analysisTab ?? defaultSection(state.level), {
        onAdopt: callbacks.onAdopt,
        onSection: (section) => {
          analysisTab = section;
        },
      });
      return;
    }
    buildHint(body, {
      level: state.level,
      shown: state.shownSolution,
      onReveal: callbacks.onReveal,
    });
  }

  on(close, 'click', () => api.close());
  on(document as unknown as EventTarget, 'keydown', ((event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) api.close();
  }) as EventListener);

  // The overlay is a sheet on a phone, so it dismisses the way sheets do.
  let from: number | null = null;
  on(grab, 'pointerdown', (event) => {
    from = (event as PointerEvent).clientY;
    grab.setPointerCapture((event as PointerEvent).pointerId);
    el.style.transition = 'none';
  });
  on(grab, 'pointermove', (event) => {
    if (from === null) return;
    const dy = Math.max(0, (event as PointerEvent).clientY - from);
    el.style.transform = `translateY(${dy}px)`;
  });
  const release = (event: Event): void => {
    if (from === null) return;
    const dy = Math.max(0, (event as PointerEvent).clientY - from);
    from = null;
    el.style.transition = '';
    el.style.transform = '';
    if (dy > 90) api.close();
  };
  on(grab, 'pointerup', release);
  on(grab, 'pointercancel', release);

  const api: Overlay = {
    el,
    get isOpen() {
      return open;
    },
    open(next) {
      tab = next;
      analysisTab = null;
      open = true;
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('is-open'));
      paint();
      (buttons.get(next) as HTMLButtonElement | undefined)?.focus();
    },
    close() {
      if (!open) return;
      open = false;
      el.classList.remove('is-open');
      window.setTimeout(() => {
        if (!open) el.hidden = true;
      }, 200);
      callbacks.onClose();
    },
    update(next) {
      state = next;
      if (open) paint();
    },
  };

  return api;
}
