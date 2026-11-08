/**
 * The readout: what the machine is reading, and what it just did.
 *
 * A verdict is an answer; a trace is an explanation. Stepping a run shows the
 * live state set, the read head, and whichever extra memory the class has: a
 * stack for a pushdown automaton, a tape for a Turing machine.
 *
 * It lives in the chamber's bottom left corner: the input along one line with
 * the symbol being read underlined in energy, and under it one line of words
 * saying which rule fired. The memory is not in the readout at all. A stack is
 * architecture, so it stands on the stage beside the machine as a column, and
 * a tape runs across the stage above the readout. See `memory`.
 *
 * It also plays the whole suite. Run suite sends every string through the
 * machine in turn, quickly, so a verdict is something you watched happen
 * rather than a list of ticks that appeared. See `playAll`.
 *
 * Frames are capped at 400 by the engine, but the simulation itself always runs
 * to its real limit, so a capped trace still reports the true verdict.
 */

import { transitionPlain } from '../../../src/engine/formal';
import { run } from '../../../src/engine/simulate';
import { BLANK, EPSILON } from '../../../src/engine/types';
import type {
  Frame,
  Level,
  Machine,
  MachineKind,
  RunResult,
  StateId,
  Transition,
  TransitionId,
} from '../../../src/engine/types';
import { fill, h, on, setText } from '../dom';

export interface TraceCallbacks {
  /**
   * The active state set changed, so the diagram can light up. `via` is the
   * rule or rules that produced this step, and `stepped` is true when it is
   * one step on from the step shown before, so the diagram can show the rule
   * being used rather than only its result.
   */
  onActive: (states: readonly StateId[], via?: readonly TransitionId[], stepped?: boolean) => void;
  onClose: () => void;
}

export interface SuiteShow {
  /** Milliseconds per step, and between one string and the next. */
  per: number;
  gap: number;
  /** A string has started, or has finished. */
  onRow: (index: number, phase: 'run' | 'done') => void;
  onDone: () => void;
}

export interface PlayOptions {
  autoplay?: boolean;
  /**
   * Open on the last step rather than the first, as if the string had just
   * been read to its end. Feeding a machine one symbol at a time is this: the
   * step shown is the one the newest symbol took.
   */
  atEnd?: boolean;
  /**
   * Keep the verdict back until the last step is on screen. A guess made
   * before watching is only a guess if the answer is not already showing.
   */
  holdVerdict?: boolean;
  /** The last step has been shown, by playing or by stepping. Called once. */
  onEnd?: (result: RunResult) => void;
}

export interface TracePlayer {
  /** The readout itself: input, words, transport. */
  el: HTMLElement;
  /** The stack or the tape, which the level puts on the stage. */
  memory: HTMLElement;
  /** Start tracing a string. Returns false if the machine could not be run. */
  play(machine: Machine, level: Level, input: string, options?: PlayOptions): boolean;
  /** Send every string through the machine, one after another. */
  playAll(machine: Machine, level: Level, inputs: readonly string[], show: SuiteShow): void;
  /** A line under the readout about the run just shown, such as how a guess went. */
  remark(text: string, tone: 'pass' | 'fail'): void;
  stop(): void;
  readonly input: string | null;
  /** Whether the suite is being played. */
  readonly showing: boolean;
}

const STEP_MS = 620;

export function createTrace(callbacks: TraceCallbacks): TracePlayer {
  const verdict = h('span', { class: 't-mono-sm verdict', 'data-testid': 'trace-verdict' });
  const inputLabel = h('span', { class: 't-label readout-label' }, 'Input');
  const tape = h('div', { class: 'trace-input', 'data-testid': 'trace-input' });
  const memory = h('div', { class: 'trace-memory', 'data-testid': 'trace-memory', hidden: true });
  const caption = h('p', { class: 'trace-caption', 'data-testid': 'trace-caption' });
  const remarkLine = h('p', { class: 'trace-remark', 'data-testid': 'trace-remark', hidden: true });

  const back = h(
    'button',
    { class: 'transport', type: 'button', 'aria-label': 'Previous step', 'data-testid': 'trace-back' },
    '‹',
  );
  const playPause = h(
    'button',
    { class: 'transport is-primary', type: 'button', 'data-testid': 'trace-play' },
    'Play',
  );
  const forward = h(
    'button',
    { class: 'transport', type: 'button', 'aria-label': 'Next step', 'data-testid': 'trace-forward' },
    '›',
  );
  const counter = h('span', { class: 't-mono-sm counter', 'data-testid': 'trace-counter' });
  const close = h(
    'button',
    { class: 'transport', type: 'button', 'aria-label': 'Close trace', 'data-testid': 'trace-close' },
    '×',
  );

  const el = h(
    'section',
    { class: 'trace readout', 'data-testid': 'trace', hidden: true, 'aria-label': 'Trace' },
    h('div', { class: 'readout-input' }, inputLabel, tape),
    caption,
    remarkLine,
    h('div', { class: 'transport-row' }, back, playPause, forward, counter, verdict, close),
  );

  let result: RunResult | null = null;
  let current = 0;
  /** The step last shown, so a step forward can be told from a jump. */
  let shownStep = -1;
  let input: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let machineLabels = new Map<StateId, string>();
  /** The machine being traced, so each step can say which rule it used. */
  let traced: { machine: Machine; kind: MachineKind; rules: Map<string, Transition> } | null = null;
  /** The suite being played, if it is. */
  let show: { timers: ReturnType<typeof setTimeout>[] } | null = null;
  /** Whether the verdict is being kept back, and who is waiting for the end. */
  let ending: { hold: boolean; onEnd?: (result: RunResult) => void; done: boolean } | null = null;

  /** What the step did, in words: the rule that fired, or where the machine now is. */
  function describe(frame: Frame | undefined, where: string): string {
    if (frame?.label) {
      const said = `${frame.label.charAt(0).toUpperCase()}${frame.label.slice(1)}`;
      // Nowhere to be is the end of the run, and worth saying as such.
      return frame.active.length === 0 ? `${said}, so the run stops.` : `${said}. In ${where}.`;
    }
    const fired = (frame?.via ?? [])
      .map((id) => traced?.rules.get(id))
      .filter((t): t is Transition => t !== undefined);
    if (traced && fired.length === 1) {
      const said = transitionPlain(fired[0] as Transition, traced.kind, traced.machine);
      return `${said.charAt(0).toUpperCase()}${said.slice(1)}.`;
    }
    if (fired.length > 1) return `${fired.length} rules fired at once. In ${where}.`;
    return `In ${where}.`;
  }

  function stopTimer(): void {
    if (timer) clearInterval(timer);
    timer = null;
    setText(playPause, 'Play');
  }

  function stopShow(): void {
    if (!show) return;
    for (const t of show.timers) clearTimeout(t);
    show = null;
    el.classList.remove('is-show');
  }

  function startTimer(): void {
    if (!result) return;
    if (current >= result.frames.length - 1) current = 0;
    setText(playPause, 'Pause');
    timer = setInterval(() => {
      if (!result || current >= result.frames.length - 1) {
        stopTimer();
        return;
      }
      current++;
      renderStep();
    }, STEP_MS);
  }

  function renderInput(frame: Frame | undefined): void {
    const source = input ?? '';
    if (source.length === 0) {
      fill(tape, h('span', { class: 'cellx is-empty t-mono' }, EPSILON));
      return;
    }
    const pos = frame?.pos ?? 0;
    fill(
      tape,
      ...[...source].map((ch, i) =>
        h(
          'span',
          { class: `cellx t-mono${i === pos ? ' is-head' : ''}${i < pos ? ' is-read' : ''}` },
          ch,
        ),
      ),
    );
  }

  function renderMemory(frame: Frame | undefined): void {
    memory.hidden = true;
    memory.classList.remove('is-stack', 'is-tape');
    if (!frame) {
      fill(memory);
      return;
    }
    if (frame.stack) {
      memory.hidden = false;
      memory.classList.add('is-stack');
      // Bottom first in the model, and bottom first on the stage: the column
      // stands on its $ the way the stack does.
      fill(
        memory,
        h('span', { class: 't-label mem-label' }, 'Stack'),
        h(
          'div',
          { class: 'mem-row' },
          ...frame.stack.map((symbol, i, all) =>
            h(
              'span',
              {
                class: `cellx t-mono${i === all.length - 1 ? ' is-head' : ''}${i === 0 ? ' is-base' : ''}`,
              },
              symbol,
            ),
          ),
        ),
      );
      return;
    }
    if (frame.tape) {
      memory.hidden = false;
      memory.classList.add('is-tape');
      fill(
        memory,
        h('span', { class: 't-label mem-label' }, 'Tape'),
        h(
          'div',
          { class: 'mem-row' },
          ...frame.tape.map((symbol, i) =>
            h(
              'span',
              { class: `cellx t-mono${i === frame.head ? ' is-head' : ''}` },
              symbol === BLANK ? BLANK : symbol,
            ),
          ),
        ),
      );
      return;
    }
    fill(memory);
  }

  function renderStep(): void {
    if (!result) return;
    const frame = result.frames[current];
    renderInput(frame);
    renderMemory(frame);

    const active = frame?.active ?? [];
    const stepped = current === shownStep + 1;
    shownStep = current;
    callbacks.onActive(active, frame?.via ?? [], stepped);

    if (show) return;
    const names = active.map((id) => machineLabels.get(id) ?? id);
    const where = names.length === 0 ? 'nowhere' : names.join(', ');
    setText(caption, describe(frame, where));
    setText(counter, `${Math.min(current + 1, result.frames.length)}/${result.frames.length}`);
    back.toggleAttribute('disabled', current === 0);
    forward.toggleAttribute('disabled', current >= result.frames.length - 1);

    if (ending && !ending.done && current >= result.frames.length - 1) {
      ending.done = true;
      if (ending.hold) setVerdict();
      ending.onEnd?.(result);
    }
  }

  function setVerdict(): void {
    if (!result) return;
    const outcome = result.outcome;
    const text =
      outcome === 'accept'
        ? 'accepted'
        : outcome === 'nonhalting'
          ? 'did not halt'
          : outcome === 'error'
            ? 'not run'
            : 'rejected';
    setText(verdict, text);
    verdict.className = `t-mono-sm verdict ${outcome === 'accept' ? 'pass' : outcome === 'reject' ? 'fail' : 'muted'}`;
  }

  function begin(machine: Machine, level: Level): void {
    machineLabels = new Map(machine.states.map((s) => [s.id, s.label]));
    traced = {
      machine,
      kind: level.type,
      rules: new Map(machine.transitions.map((t) => [t.id, t])),
    };
  }

  on(back, 'click', () => {
    stopTimer();
    current = Math.max(0, current - 1);
    renderStep();
  });
  on(forward, 'click', () => {
    stopTimer();
    if (result) current = Math.min(result.frames.length - 1, current + 1);
    renderStep();
  });
  on(playPause, 'click', () => {
    if (timer) {
      stopTimer();
      return;
    }
    startTimer();
  });
  on(close, 'click', () => {
    stopTimer();
    ending = null;
    remarkLine.hidden = true;
    el.hidden = true;
    memory.hidden = true;
    input = null;
    result = null;
    callbacks.onActive([]);
    callbacks.onClose();
  });

  return {
    el,
    memory,
    get input() {
      return show ? null : input;
    },
    get showing() {
      return show !== null;
    },
    play(machine, level, value, options = {}) {
      stopShow();
      stopTimer();
      remarkLine.hidden = true;
      begin(machine, level);
      const outcome = run(machine, level, value);
      ending = {
        hold: Boolean(options.holdVerdict),
        done: false,
        ...(options.onEnd ? { onEnd: options.onEnd } : {}),
      };
      if (outcome.error) {
        ending = null;
        input = value;
        result = outcome;
        el.hidden = false;
        setText(verdict, 'not run');
        verdict.className = 't-mono-sm verdict fail';
        fill(tape);
        fill(memory);
        memory.hidden = true;
        setText(caption, outcome.error);
        setText(counter, '0/0');
        callbacks.onActive([]);
        return false;
      }
      input = value;
      result = outcome;
      const last = Math.max(0, outcome.frames.length - 1);
      current = options.atEnd ? last : 0;
      // One step short of where it opens, so the step it opens on reads as a
      // step taken and the arrow that took it lights.
      shownStep = current - 1;
      el.hidden = false;
      if (options.holdVerdict) {
        setText(verdict, '');
        verdict.className = 't-mono-sm verdict';
      } else setVerdict();
      renderStep();
      if (outcome.note && !options.holdVerdict) {
        setText(caption, `${caption.textContent} ${outcome.note}`);
      }
      if (options.autoplay && current < last) startTimer();
      return true;
    },
    playAll(machine, level, inputs, options) {
      stopShow();
      stopTimer();
      remarkLine.hidden = true;
      ending = null;
      begin(machine, level);
      const mine = { timers: [] as ReturnType<typeof setTimeout>[] };
      show = mine;
      el.hidden = false;
      el.classList.add('is-show');
      setText(verdict, '');
      verdict.className = 't-mono-sm verdict';

      const later = (fn: () => void, ms: number): void => {
        mine.timers.push(
          setTimeout(() => {
            if (show === mine) fn();
          }, ms),
        );
      };

      const row = (index: number): void => {
        const value = inputs[index];
        if (value === undefined) {
          stopShow();
          el.hidden = true;
          memory.hidden = true;
          input = null;
          result = null;
          callbacks.onActive([]);
          options.onDone();
          return;
        }
        const outcome = run(machine, level, value);
        input = value;
        result = outcome;
        current = 0;
        shownStep = -1;
        setText(caption, `running ${index + 1} of ${inputs.length}`);
        options.onRow(index, 'run');
        const frames = outcome.error ? 0 : outcome.frames.length;
        if (frames > 0) renderStep();
        else renderInput(undefined);
        const step = (): void => {
          if (!result || current >= frames - 1) {
            options.onRow(index, 'done');
            later(() => row(index + 1), options.gap);
            return;
          }
          current++;
          renderStep();
          later(step, options.per);
        };
        later(step, options.per);
      };
      row(0);
    },
    remark(text, tone) {
      setText(remarkLine, text);
      remarkLine.className = `trace-remark ${tone}`;
      remarkLine.hidden = false;
    },
    stop() {
      stopShow();
      stopTimer();
      ending = null;
      remarkLine.hidden = true;
      el.hidden = true;
      memory.hidden = true;
      input = null;
      result = null;
      callbacks.onActive([]);
    },
  };
}
