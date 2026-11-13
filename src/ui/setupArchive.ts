import type Phaser from 'phaser';
import { LORE, SHELF_ORDER, isKnown, loreProgress, type ArchiveShelf, type LoreEntry } from '../domain/lore';
import { loadMeta } from '../domain/metaProgress';

const SHELF_LABEL: Readonly<Record<ArchiveShelf, string>> = {
  characters: 'Wanderer record', items: 'Relic record', enemies: 'Bestiary record', realms: 'History',
};

/**
 * Fills the Grand Archive from the lore data and what has been discovered:
 * found entries can be opened to read, and locked ones say how to find them.
 */
export function setupArchive(lobbyGame: Phaser.Game): void {
  const dialog = document.querySelector<HTMLDialogElement>('#archive-dialog');
  if (!dialog) return;
  const openEntries = new Set<string>();

  const render = (): void => {
    const known = loadMeta().lore;
    for (const shelf of SHELF_ORDER) {
      const panel = dialog.querySelector<HTMLElement>(`[data-archive-panel="${shelf}"]`);
      const tab = dialog.querySelector<HTMLElement>(`[data-archive-tab="${shelf}"] em`);
      if (!panel) continue;
      const entries = LORE.filter((item) => item.shelf === shelf);
      const found = entries.filter((item) => isKnown(known, item)).length;
      if (tab) tab.textContent = `${found}/${entries.length}`;
      panel.replaceChildren(...entries.map((item, index) => renderEntry(item, index, isKnown(known, item))));
    }
    const { found, total } = loreProgress(known);
    const percent = Math.round((found / total) * 100);
    const bar = dialog.querySelector<HTMLElement>('#archive-progress-bar');
    if (bar) bar.style.width = `${percent}%`;
    const text = dialog.querySelector<HTMLElement>('#archive-progress-text');
    if (text) text.textContent = `${percent}%`;
  };

  const renderEntry = (item: LoreEntry, index: number, unlocked: boolean): HTMLElement => {
    const article = document.createElement('article');
    article.className = `${unlocked ? 'is-found' : 'is-locked'}${openEntries.has(item.id) && unlocked ? ' is-open' : ''}`;
    const number = document.createElement('span');
    number.textContent = unlocked ? String(index + 1).padStart(2, '0') : '?';
    const copy = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = unlocked ? item.title : 'Unrecorded';
    const subtitle = document.createElement('small');
    subtitle.textContent = unlocked ? item.subtitle : `How to find it: ${item.hint}`;
    copy.append(title, subtitle);
    if (unlocked) {
      const body = document.createElement('p');
      body.className = 'lore-text';
      body.textContent = item.text;
      copy.append(body);
    }
    const state = document.createElement('i');
    state.textContent = unlocked ? SHELF_LABEL[item.shelf].toUpperCase() : 'LOCKED';
    article.append(number, copy, state);
    if (unlocked) {
      article.tabIndex = 0;
      article.setAttribute('role', 'button');
      article.setAttribute('aria-expanded', String(openEntries.has(item.id)));
      const toggle = (): void => {
        if (openEntries.has(item.id)) openEntries.delete(item.id); else openEntries.add(item.id);
        article.classList.toggle('is-open');
        article.setAttribute('aria-expanded', String(openEntries.has(item.id)));
      };
      article.addEventListener('click', toggle);
      article.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
      });
    }
    return article;
  };

  lobbyGame.events.on('archive-collection', render);
  render();
}
