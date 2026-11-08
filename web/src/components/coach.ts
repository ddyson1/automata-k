/**
 * The coach: one line at a time, under the question, in a lesson.
 *
 * It says what to look at or do next, offers the one control that does it, and
 * moves on by itself once it has happened. It never asks to be told that you
 * did the thing: it can see the canvas, the symbols fed in, the guesses made
 * and the runs of the suite, and each step says what it is waiting for in
 * those terms. See web/src/lessons.ts for the steps themselves.
 *
 * When the last step is done it becomes the lesson's end: the idea in a
 * sentence or two, and the way on.
 */

import type { Lesson } from '../../../src/engine/lessons';
import { EPSILON } from '../../../src/engine/types';
import { fill, h, on, setText } from '../dom';
import type {
  LessonContext,
  LessonScript,
  Prediction,
  RunSummary,
  Step,
} from '../lessons';
import type { Machine } from '../../../src/engine/types';

/** Everything the coach judges by, counted from when the lesson opened. */
export interface LessonFacts {
  machine: Machine;
  /** The string fed in so far, since it was last cleared. */
  fed: string;
  /** Every symbol fed, across clears. */
  feeds: number;
  predictions: readonly Prediction[];
  runs: readonly RunSummary[];
}

export interface CoachCallbacks {
  onFeed: (symbol: string) => void;
  onClear: () => void;
  onPredict: (input: string, said: boolean) => void;
  onRun: () => void;
  /** On to whatever follows this lesson. */
  onOnward: () => void;
  onClimb: () => void;
  /** The last step is done. Called once. */
  onDone: () => void;
  /** A different step is up. */
  onStep: (step: Step | null) => void;
}

export interface Coach {
  el: HTMLElement;
  /** Judge the step that is up against what is true now, and move on if it is done. */
  update(facts: LessonFacts): void;
  /** A guess's string stopped before its end, so the guess can be called again. */
  cancel(): void;
  /** Whether a guess has been called and its string is still playing. */
  readonly waiting: boolean;
  readonly step: Step | null;
}

const show = (w: string): string => (w === '' ? EPSILON : w);

/** A guess, and how it went, in a line. */
export function predictionLine(p: Prediction): { right: boolean; text: string } {
  const right = p.said === p.accepted;
  const verdict = p.accepted ? 'accepted' : 'rejected';
  const why = p.stuck ? `it got stuck in ${p.where}` : `it ended in ${p.where}`;
  return {
    right,
    text: right
      ? `You called it: ${show(p.input)} is ${verdict}, because ${why}.`
      : `You said ${p.said ? 'accept' : 'reject'}, but ${show(p.input)} is ${verdict}: ${why}.`,
  };
}

export function createCoach(
  lesson: Lesson,
  script: LessonScript,
  next: { title: string } | null,
  callbacks: CoachCallbacks,
): Coach {
  const dots = h('ol', { class: 'coach-dots', 'aria-hidden': 'true' });
  const dotNodes = script.steps.map(() => {
    const dot = h('li', { class: 'coach-dot' });
    dots.append(dot);
    return dot;
  });
  const badge = h('p', { class: 'coach-badge', 'data-testid': 'coach-badge', hidden: true });
  const line = h('p', { class: 'coach-line', 'data-testid': 'coach-line', 'aria-live': 'polite' });
  const offer = h('div', { class: 'coach-offer', 'data-testid': 'coach-offer' });
  const el = h(
    'section',
    {
      class: 'coach',
      'data-testid': 'coach',
      'aria-label': `Lesson ${lesson.index}, ${lesson.title}`,
    },
    dots,
    badge,
    line,
    offer,
  );

  let index = 0;
  let finished = false;
  /** Counts at the moment the step that is up began. */
  let base = { feeds: 0, predictions: 0, runs: 0 };
  let latest: LessonFacts | null = null;
  /** A guess called and not yet seen through. */
  let waiting = false;
  /** The guess the step before this one was waiting for, said once on this one. */
  let lastGuess: Prediction | null = null;
  /** The offer currently drawn, so it is only rebuilt when it changes. */
  let drawn = '';

  const current = (): Step | null => (finished ? null : (script.steps[index] ?? null));

  function contextOf(facts: LessonFacts): LessonContext {
    return {
      machine: facts.machine,
      fed: facts.fed,
      fedNow: facts.feeds - base.feeds,
      predicted: facts.predictions.slice(base.predictions),
      ran: facts.runs.length > base.runs ? (facts.runs.at(-1) ?? null) : null,
    };
  }

  function begin(facts: LessonFacts | null): void {
    base = {
      feeds: facts?.feeds ?? 0,
      predictions: facts?.predictions.length ?? 0,
      runs: facts?.runs.length ?? 0,
    };
    waiting = false;
    callbacks.onStep(current());
  }

  function advance(): void {
    const ctx = latest ? contextOf(latest) : null;
    lastGuess = ctx?.predicted.at(-1) ?? null;
    index++;
    if (index >= script.steps.length) {
      finished = true;
      callbacks.onStep(null);
      callbacks.onDone();
    } else begin(latest);
    paint();
  }

  function button(label: string, testId: string, action: () => void, kind = ''): HTMLElement {
    const node = h(
      'button',
      { class: `coach-b${kind ? ` ${kind}` : ''}`, type: 'button', 'data-testid': testId },
      label,
    );
    on(node, 'click', action);
    return node;
  }

  function paintOffer(step: Step | null): void {
    const key = finished ? 'end' : `${index}:${step?.offer.kind}:${waiting}`;
    if (key === drawn) return;
    drawn = key;
    if (finished) {
      const onward = next ? `Next: ${next.title}` : 'On to level 1';
      fill(
        offer,
        button(onward, 'coach-onward', () => callbacks.onOnward(), 'is-primary'),
        button('Back to the climb', 'coach-climb', () => callbacks.onClimb()),
      );
      return;
    }
    if (!step) return;
    const o = step.offer;
    if (o.kind === 'next') {
      fill(offer, button('Next', 'coach-next', () => advance(), 'is-primary'));
    } else if (o.kind === 'feed') {
      fill(
        offer,
        ...lesson.level.alphabet.map((symbol) =>
          button(symbol, `feed-${symbol}`, () => callbacks.onFeed(symbol), 'is-primary is-key'),
        ),
        button('Start again', 'feed-clear', () => callbacks.onClear()),
      );
    } else if (o.kind === 'predict') {
      if (waiting) {
        fill(offer, h('span', { class: 'coach-wait' }, `Watch ${show(o.input)} go through.`));
      } else {
        const call = (said: boolean) => () => {
          waiting = true;
          paint();
          callbacks.onPredict(o.input, said);
        };
        fill(
          offer,
          button('Accept', 'coach-accept', call(true), 'is-primary'),
          button('Reject', 'coach-reject', call(false), 'is-primary'),
        );
      }
    } else if (o.kind === 'run') {
      fill(offer, button('Run the suite', 'coach-run', () => callbacks.onRun(), 'is-primary'));
    } else {
      fill(offer);
    }
  }

  function paint(): void {
    const step = current();
    dotNodes.forEach((dot, i) => {
      dot.classList.toggle('is-done', finished || i < index);
      dot.classList.toggle('is-now', !finished && i === index);
    });
    el.classList.toggle('is-finished', finished);

    // The guess the last step was waiting for, said once, on the step after it.
    const ctx = latest ? contextOf(latest) : null;
    if (!finished && lastGuess) {
      const { right, text } = predictionLine(lastGuess);
      badge.hidden = false;
      badge.className = `coach-badge ${right ? 'is-right' : 'is-wrong'}`;
      setText(badge, `${right ? '✓' : '✗'} ${text}`);
    } else badge.hidden = true;

    if (finished) {
      setText(line, lesson.takeaway);
    } else if (step) {
      const help = ctx && step.help ? step.help(ctx) : null;
      setText(line, help ?? step.say);
      line.classList.toggle('is-help', help !== null);
    }
    paintOffer(step);
  }

  begin(null);
  paint();

  return {
    el,
    get waiting() {
      return waiting;
    },
    get step() {
      return current();
    },
    cancel() {
      if (!waiting) return;
      waiting = false;
      paint();
    },
    update(facts) {
      latest = facts;
      // A guess has landed: whatever the step thinks of it, it is no longer pending.
      if (waiting && facts.predictions.length > base.predictions) waiting = false;
      let guard = script.steps.length + 1;
      while (!finished && guard-- > 0) {
        const step = current();
        if (!step?.done || !step.done(contextOf(facts))) break;
        advance();
      }
      paint();
    },
  };
}
