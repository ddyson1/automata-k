/**
 * The trace player.
 *
 * A verdict is an answer; a trace is an explanation. Stepping a run shows the
 * live state set, the read head, and whichever extra memory the class has: a
 * stack for a pushdown automaton, a tape for a Turing machine.
 *
 * Frames are capped at 400 by the engine, but the simulation itself always runs
 * to its real limit, so a capped trace still reports the true verdict.
 */

import { run } from '../../../src/engine/simulate';
import { BLANK, EPSILON } from '../../../src/engine/types';
import type { Frame, Level, Machine, RunResult, StateId } from '../../../src/engine/types';
import { fill, h, on, setText } from '../dom';

export interface TraceCallbacks {
  /** The active state set changed, so the diagram can light up. */
  onActive: (states: readonly StateId[]) => void;
  onClose: () => void;
}

export interface TracePlayer {
  el: HTMLElement;
  /** Start tracing a string. Returns false if the machine could not be run. */
  play(machine: Machine, level: Level, input: string): boolean;
  stop(): void;
  readonly input: string | null;
}

const STEP_MS = 620;

export function createTrace(callbacks: TraceCallbacks): TracePlayer {
  const heading = h('span', { class: 't-label' }, 'Trace');
  const verdict = h('span', { class: 't-mono-sm verdict', 'data-testid': 'trace-verdict' });
  const tape = h('div', { class: 'trace-input', 'data-testid': 'trace-input' });
  const memory = h('div', { class: 'trace-memory', 'data-testid': 'trace-memory' });
  const caption = h('p', { class: 't-small muted trace-caption', 'data-testid': 'trace-caption' });

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
    { class: 'trace', 'data-testid': 'trace', hidden: true },
    h('div', { class: 'band-head' }, heading, verdict, close),
    tape,
    memory,
    caption,
    h('div', { class: 'transport-row' }, back, playPause, forward, counter),
  );

  let result: RunResult | null = null;
  let current = 0;
  let input: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let machineLabels = new Map<StateId, string>();

  function stopTimer(): void {
    if (timer) clearInterval(timer);
    timer = null;
    setText(playPause, 'Play');
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
    if (!frame) {
      fill(memory);
      return;
    }
    if (frame.stack) {
      // Bottom first in the model; drawn top first, which is how a stack reads.
      fill(
        memory,
        h('span', { class: 't-label mem-label' }, 'Stack'),
        h(
          'div',
          { class: 'mem-row' },
          ...[...frame.stack].reverse().map((symbol, i) =>
            h('span', { class: `cellx t-mono${i === 0 ? ' is-head' : ''}` }, symbol),
          ),
        ),
      );
      return;
    }
    if (frame.tape) {
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
    callbacks.onActive(active);

    const names = active.map((id) => machineLabels.get(id) ?? id);
    const where = names.length === 0 ? 'nowhere' : names.join(', ');
    setText(caption, frame?.label ? `${frame.label} In ${where}.` : `In ${where}.`);
    setText(counter, `${Math.min(current + 1, result.frames.length)}/${result.frames.length}`);
    back.toggleAttribute('disabled', current === 0);
    forward.toggleAttribute('disabled', current >= result.frames.length - 1);
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
  });
  on(close, 'click', () => {
    stopTimer();
    el.hidden = true;
    input = null;
    result = null;
    callbacks.onActive([]);
    callbacks.onClose();
  });

  return {
    el,
    get input() {
      return input;
    },
    play(machine, level, value) {
      stopTimer();
      machineLabels = new Map(machine.states.map((s) => [s.id, s.label]));
      const outcome = run(machine, level, value);
      if (outcome.error) {
        input = value;
        result = outcome;
        el.hidden = false;
        setText(verdict, 'not run');
        verdict.className = 't-mono-sm verdict fail';
        fill(tape);
        fill(memory);
        setText(caption, outcome.error);
        setText(counter, '0/0');
        callbacks.onActive([]);
        return false;
      }
      input = value;
      result = outcome;
      current = 0;
      el.hidden = false;
      setVerdict();
      renderStep();
      if (outcome.note) setText(caption, `${caption.textContent} ${outcome.note}`);
      return true;
    },
    stop() {
      stopTimer();
      el.hidden = true;
      input = null;
      result = null;
      callbacks.onActive([]);
    },
  };
}
