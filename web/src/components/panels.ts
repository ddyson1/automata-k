/**
 * The formal layer.
 *
 * The brief is what the level asks. This is what the machine is: the tuple and
 * the transition function, the theory behind the language, the analyses, and
 * the hint.
 *
 * It used to be an overlay — a sheet that slid over the brief, with its own
 * tab strip and its own close button, opened by a "The machine ›" link in the
 * brief's footer. That is two navigations for one idea. The pane already had
 * to be a place you could be in more than one way; making the brief the first
 * tab rather than the backdrop removes the link, the close button, the slide,
 * the escape handler, the drag-to-dismiss, and the bookkeeping that put the
 * phone's sheet back where it was afterwards.
 *
 * So this is now just a body. The pane owns which tab is showing and tells it.
 */

import type { Level, Machine, TransitionId } from '../../../src/engine/types';
import type { DeltaLine } from '../../../src/engine/formal';
import { h } from '../dom';
import { createLedger } from './ledger';
import type { Ledger } from './ledger';
import { buildAnalysis, defaultSection } from './analysis';
import type { AnalysisSection } from './analysis';
import { buildHint, buildTheory } from './theory';

/** Everything the pane can show. `brief` is the brief's own body. */
export type PaneTab = 'brief' | 'machine' | 'theory' | 'analysis' | 'hint';

/** The tabs this component draws. */
export type PanelTab = Exclude<PaneTab, 'brief'>;

export interface PanelCallbacks {
  onHighlight: (ids: readonly TransitionId[]) => void;
  onActivateRule: (line: DeltaLine) => void;
  onAdopt: (machine: Machine, description: string) => void;
  onReveal: () => void;
}

export interface PanelState {
  level: Level;
  machine: Machine;
  selected: readonly TransitionId[];
  shownSolution: boolean;
}

export interface Panels {
  el: HTMLElement;
  /** Draw `tab`. Cheap to call again with the same one. */
  show(tab: PanelTab): void;
  /** New machine, same tab. Does nothing while the brief is showing. */
  update(state: PanelState): void;
}

export function createPanels(callbacks: PanelCallbacks): Panels {
  const el = h('div', { class: 'panel', 'data-testid': 'panel' });

  const ledger: Ledger = createLedger({
    onHighlight: callbacks.onHighlight,
    onActivate: callbacks.onActivateRule,
  });

  let tab: PanelTab | null = null;
  let analysisTab: AnalysisSection | null = null;
  let state: PanelState | null = null;

  function paint(): void {
    if (!state || tab === null) return;

    if (tab === 'machine') {
      if (el.firstChild !== ledger.el) {
        el.textContent = '';
        el.appendChild(ledger.el);
      }
      ledger.update({
        machine: state.machine,
        level: state.level,
        selected: state.selected,
      });
      return;
    }
    if (tab === 'theory') {
      buildTheory(el, state.level, state.machine);
      return;
    }
    if (tab === 'analysis') {
      buildAnalysis(el, state.machine, state.level, analysisTab ?? defaultSection(state.level), {
        onAdopt: callbacks.onAdopt,
        onSection: (section) => {
          analysisTab = section;
        },
      });
      return;
    }
    buildHint(el, {
      level: state.level,
      shown: state.shownSolution,
      onReveal: callbacks.onReveal,
    });
  }

  return {
    el,
    show(next) {
      // Coming back to Analysis from another tab starts at the reading that
      // suits the level again; switching sub tabs within it does not.
      if (next !== tab) analysisTab = null;
      tab = next;
      paint();
    },
    update(next) {
      state = next;
      paint();
    },
  };
}
