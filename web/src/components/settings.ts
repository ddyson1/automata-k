/**
 * Settings: how the app looks and how much it moves.
 *
 * Two choices, each with a "follow the system" option that is the default,
 * so a viewer who never opens this gets what their device already asks for.
 * Both write through the game store, which owns persistence; main.ts turns
 * them into attributes on <html> that theme.css and haptics.ts read.
 */

import { h, on } from '../dom';
import { game } from '../store';
import type { MotionChoice, ThemeChoice } from '../store';
import { createSheet } from './sheet';
import type { Sheet } from './sheet';

interface Option<T extends string> {
  value: T;
  label: string;
}

const THEMES: Option<ThemeChoice>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const MOTIONS: Option<MotionChoice>[] = [
  { value: 'system', label: 'System' },
  { value: 'reduce', label: 'Reduce' },
  { value: 'full', label: 'Full' },
];

function choiceGroup<T extends string>(
  name: string,
  legend: string,
  hint: string,
  options: Option<T>[],
  current: () => T,
  choose: (value: T) => void,
): { el: HTMLElement; sync: () => void } {
  const inputs = options.map((option) => {
    const input = h('input', {
      type: 'radio',
      name,
      value: option.value,
      'data-testid': `${name}-${option.value}`,
    }) as HTMLInputElement;
    on(input, 'change', () => {
      if (input.checked) choose(option.value);
    });
    return { input, label: h('label', { class: 'seg-opt' }, input, h('span', {}, option.label)) };
  });
  const el = h(
    'fieldset',
    { class: 'setting' },
    h('legend', { class: 't-label' }, legend),
    h('div', { class: 'seg' }, ...inputs.map((i) => i.label)),
    h('p', { class: 't-small muted setting-hint' }, hint),
  );
  const sync = (): void => {
    for (const { input } of inputs) input.checked = input.value === current();
  };
  return { el, sync };
}

export function createSettings(): { sheet: Sheet; open: () => void } {
  const sheet = createSheet('settings');
  const theme = choiceGroup(
    'theme',
    'Theme',
    'System follows your device’s light or dark setting.',
    THEMES,
    () => game.theme,
    (value) => game.setTheme(value),
  );
  const motion = choiceGroup(
    'motion',
    'Motion',
    'Reduce stills transitions and turns off vibration. System follows your device.',
    MOTIONS,
    () => game.motion,
    (value) => game.setMotion(value),
  );
  sheet.body.append(theme.el, motion.el);

  return {
    sheet,
    open() {
      theme.sync();
      motion.sync();
      sheet.open('Settings');
    },
  };
}
