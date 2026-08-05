/**
 * The bottom sheet.
 *
 * Everything secondary arrives from the bottom edge, within reach: a grab
 * handle, drag to dismiss, tap the backdrop to dismiss, Escape to dismiss. On a
 * wide screen the same sheet becomes a centred panel, because a full-width bar
 * pinned to the bottom of a desktop window is a phone habit, not a good idea.
 */

import { h, on } from '../dom';

export interface Sheet {
  el: HTMLElement;
  body: HTMLElement;
  open(title: string): void;
  close(): void;
  readonly isOpen: boolean;
  onClose?: () => void;
}

const DISMISS_PX = 96;

export function createSheet(testId: string): Sheet {
  const heading = h('h2', { class: 't-title sheet-title', id: `${testId}-title` });
  const body = h('div', { class: 'sheet-body' });
  const handle = h('div', { class: 'grab', 'aria-hidden': 'true' });
  const closeButton = h(
    'button',
    { class: 'sheet-close', type: 'button', 'aria-label': 'Close' },
    '×',
  );

  const panel = h(
    'div',
    {
      class: 'sheet-panel',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': `${testId}-title`,
      'data-testid': testId,
    },
    handle,
    h('div', { class: 'sheet-head' }, heading, closeButton),
    body,
  );
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const el = h('div', { class: 'sheet', hidden: true }, backdrop, panel);

  const sheet: Sheet = {
    el,
    body,
    isOpen: false,
    open(title) {
      heading.textContent = title;
      el.hidden = false;
      // One frame later, so the transition has a starting point to run from.
      requestAnimationFrame(() => el.classList.add('is-open'));
      (sheet as { isOpen: boolean }).isOpen = true;
      panel.style.transform = '';
      closeButton.focus();
    },
    close() {
      if (!sheet.isOpen) return;
      el.classList.remove('is-open');
      (sheet as { isOpen: boolean }).isOpen = false;
      panel.style.transform = '';
      window.setTimeout(() => {
        if (!sheet.isOpen) el.hidden = true;
      }, 200);
      sheet.onClose?.();
    },
  };

  on(backdrop, 'click', () => sheet.close());
  on(closeButton, 'click', () => sheet.close());
  on(document as unknown as EventTarget, 'keydown', ((event: KeyboardEvent) => {
    if (event.key === 'Escape' && sheet.isOpen) sheet.close();
  }) as EventListener);

  // Drag the handle down to dismiss. Dragging up does nothing, so an
  // overshoot cannot leave the panel stuck above its resting position.
  let from: number | null = null;
  on(handle, 'pointerdown', (event) => {
    from = (event as PointerEvent).clientY;
    handle.setPointerCapture((event as PointerEvent).pointerId);
    panel.style.transition = 'none';
  });
  on(handle, 'pointermove', (event) => {
    if (from === null) return;
    const dy = Math.max(0, (event as PointerEvent).clientY - from);
    panel.style.transform = `translateY(${dy}px)`;
  });
  const release = (event: Event): void => {
    if (from === null) return;
    const dy = Math.max(0, (event as PointerEvent).clientY - from);
    from = null;
    panel.style.transition = '';
    if (dy > DISMISS_PX) sheet.close();
    else panel.style.transform = '';
  };
  on(handle, 'pointerup', release);
  on(handle, 'pointercancel', release);

  return sheet;
}
