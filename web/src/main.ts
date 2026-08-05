/**
 * Boot and routing.
 *
 * Hash routing, deliberately: the built app is a folder of static files with no
 * server rewrite rules, and it has to survive being served from an arbitrary
 * subpath as readily as from a domain root. A hash cannot 404.
 */

import './fonts.css';
import './theme.css';
import './app.css';

import { game } from './store';
import { createHomeView } from './views/home';
import { createLevelView } from './views/level';
import type { View } from './views/level';

const root = document.getElementById('root');
if (!root) throw new Error('no #root');

let current: View | null = null;

function applyTheme(): void {
  const choice = game.theme;
  if (choice === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choice);
}

function navigate(hash: string): void {
  if (window.location.hash === hash) mount();
  else window.location.hash = hash;
}

function mount(): void {
  const hash = window.location.hash || '#/';
  const level = /^#\/level\/([A-Za-z0-9-]+)$/.exec(hash);

  current?.destroy();
  const next = level ? createLevelView(level[1] as string, navigate) : createHomeView(navigate);
  current = next;

  root!.textContent = '';
  root!.appendChild(next.el);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', mount);
game.subscribe(applyTheme);

applyTheme();
mount();
