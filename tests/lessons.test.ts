/**
 * The Learn floor: the lessons before level 1.
 *
 * A lesson is a level with a starting machine and a script. The machines are
 * held to their languages the way the campaign's solutions are, and each
 * script is checked against them: a step that asks for something on the
 * canvas must not be done by the machine the lesson starts with, and must be
 * done by the machine that finishes it, or the lesson either skips its own
 * point or cannot be finished.
 */

import { describe, expect, it } from 'vitest';

import { LESSONS, LESSON_BY_ID } from '../src/engine/lessons';
import { LEVELS, LEVEL_BY_ID, enumerateStrings } from '../src/engine/levels';
import { run, runSuite } from '../src/engine/simulate';
import { CANVAS } from '../src/engine/types';
import type { Machine } from '../src/engine/types';
import { validate } from '../src/engine/validate';
import { SCRIPTS, type LessonContext } from '../web/src/lessons';

const idle = (machine: Machine): LessonContext => ({
  machine,
  fed: '',
  fedNow: 0,
  predicted: [],
  ran: null,
});

describe('lessons', () => {
  it('are numbered in order and never share an id with a level', () => {
    expect(LESSONS.map((l) => l.index)).toEqual(LESSONS.map((_, i) => i + 1));
    for (const lesson of LESSONS) {
      expect(LEVEL_BY_ID[lesson.id], lesson.id).toBeUndefined();
      expect(LESSON_BY_ID[lesson.id]).toBe(lesson);
      expect(lesson.level.id).toBe(lesson.id);
      expect(lesson.level.type).toBe('DFA');
    }
    // The campaign is still the forty-two.
    expect(LEVELS).toHaveLength(42);
  });

  it.each(LESSONS)('$title: the finishing machine is its language, exhaustively', (lesson) => {
    const machine = lesson.answer;
    expect(validate(machine, lesson.level).ok).toBe(true);
    for (const w of enumerateStrings(lesson.level.alphabet, lesson.level.exhaustiveMaxLength)) {
      expect(run(machine, lesson.level, w).accepted, `"${w}"`).toBe(lesson.level.accepts(w));
    }
    expect(runSuite(machine, lesson.level).solved).toBe(true);
    expect(machine.states).toHaveLength(lesson.level.par);
  });

  it.each(LESSONS)('$title: the suite has strings to accept and strings to reject', (lesson) => {
    const verdicts = lesson.level.tests.map((w) => lesson.level.accepts(w));
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
    expect(new Set(lesson.level.tests).size).toBe(lesson.level.tests.length);
  });

  it.each(LESSONS)('$title: the starting machine runs, and sits on the sheet', (lesson) => {
    // Your own states starts from nothing, which is not a machine yet.
    if (lesson.start.states.length > 0) expect(validate(lesson.start, lesson.level).ok).toBe(true);
    for (const s of lesson.start.states) {
      expect(s.x).toBeGreaterThanOrEqual(CANVAS.stateRadius);
      expect(s.x).toBeLessThanOrEqual(CANVAS.width - CANVAS.stateRadius);
      expect(s.y).toBeGreaterThanOrEqual(CANVAS.stateRadius);
      expect(s.y).toBeLessThanOrEqual(CANVAS.height - CANVAS.stateRadius);
    }
  });

  it('start with something to do, except two that are about seeing what is already there', () => {
    // Reading hands over a finished machine to watch. Trapped hands over one
    // that already passes, because a missing arrow already behaves like a dead
    // state; the lesson is about making that dead state a real one.
    const solvedAtStart = LESSONS.filter((l) => runSuite(l.start, l.level).solved).map((l) => l.id);
    expect(solvedAtStart).toEqual(['lesson-reading', 'lesson-trapped']);
    const trapped = LESSON_BY_ID['lesson-trapped'];
    if (!trapped) throw new Error('no lesson-trapped');
    expect(run(trapped.start, trapped.level, '01').frames.at(-1)?.active).toEqual([]);
    expect(run(trapped.answer, trapped.level, '01').frames.at(-1)?.active).toEqual(['s0']);
  });

  it('every lesson has a script, and every script offers something at every step', () => {
    for (const lesson of LESSONS) {
      const script = SCRIPTS[lesson.id];
      expect(script, lesson.id).toBeDefined();
      expect(script?.steps.length).toBeGreaterThan(0);
      for (const step of script?.steps ?? []) {
        expect(step.say.length).toBeGreaterThan(0);
        // A step with nothing to press and nothing to wait for would never end.
        if (step.offer.kind !== 'next') expect(step.done, step.say).toBeDefined();
      }
      // Every lesson ends on a run of its suite, which is what a level asks for.
      expect(script?.steps.at(-1)?.offer.kind).toBe('run');
    }
  });

  it('a step done on the canvas is done by the finishing machine and not by the start', () => {
    for (const lesson of LESSONS) {
      for (const step of SCRIPTS[lesson.id]?.steps ?? []) {
        if (step.offer.kind !== 'canvas') continue;
        expect(step.done?.(idle(lesson.start)), `${lesson.id}: ${step.say}`).toBe(false);
        expect(step.done?.(idle(lesson.answer)), `${lesson.id}: ${step.say}`).toBe(true);
      }
    }
  });

  it('a state a step points at is on the canvas', () => {
    for (const lesson of LESSONS) {
      for (const step of SCRIPTS[lesson.id]?.steps ?? []) {
        if (!step.point) continue;
        // A named state is there from the start; one found on the canvas is
        // there once the lesson is finished.
        const at = typeof step.point === 'string' ? lesson.start : lesson.answer;
        const id = typeof step.point === 'string' ? step.point : step.point(idle(lesson.answer));
        const ids = new Set(at.states.map((s) => s.id));
        expect(id !== null && id !== undefined && ids.has(id), `${lesson.id}: ${step.say}`).toBe(
          true,
        );
      }
    }
  });

  it('a string a step asks about runs on the machine the step sees', () => {
    // The third lesson asks about 11 before the arrow is drawn and after: the
    // first run gets stuck, the second is accepted.
    const lesson = LESSON_BY_ID['lesson-arrows'];
    if (!lesson) throw new Error('no lesson-arrows');
    const before = run(lesson.start, lesson.level, '11');
    expect(before.accepted).toBe(false);
    expect(before.frames.at(-1)?.active).toEqual([]);
    expect(run(lesson.answer, lesson.level, '11').accepted).toBe(true);
  });

  it('the tools a lesson leaves on are the ones its canvas steps need', () => {
    const tools = (id: string) => SCRIPTS[id]?.tools;
    expect(tools('lesson-reading')).toMatchObject({ place: false, connect: false });
    expect(tools('lesson-reading')).toMatchObject({ accepting: false });
    expect(tools('lesson-accepting')).toMatchObject({ accepting: true, connect: false });
    expect(tools('lesson-accepting')).toMatchObject({ place: false });
    expect(tools('lesson-arrows')).toMatchObject({ connect: true, editRules: true, place: false });
    expect(tools('lesson-memory')).toMatchObject({ connect: true, place: false, accepting: false });
    expect(tools('lesson-own')).toMatchObject({ place: true, connect: true, accepting: true });
    expect(tools('lesson-trapped')).toMatchObject({ place: true, connect: true });
    expect(tools('lesson-trapped')).toMatchObject({ accepting: false });
  });
});
