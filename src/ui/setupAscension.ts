import type Phaser from 'phaser';
import {
  CENTER, HEROES_PROGRESS, SLOTS_PER_FORM, equippedIn, formOf, nextFormGoal, nodeState, slotsFor, toggleEquip, unlockNode,
  type GridId, type GridNode, type HeroId, type HeroRecord,
} from '../domain/heroProgress';
import { isHeroUnlocked } from '../domain/heroUnlocks';
import { loadMeta, saveMeta } from '../domain/metaProgress';

const HERO_ORDER: readonly HeroId[] = ['li-yunfeng', 'seo-jiwon', 'tsukishiro-rei'];
const SHORT_NAMES: Readonly<Record<HeroId, string>> = { 'li-yunfeng': 'Li', 'seo-jiwon': 'Seo', 'tsukishiro-rei': 'Rei' };
const ROMAN = ['', 'I', 'II', 'III'] as const;

/** The Ascension Shrine: see a hero's Stages and spend Dao Insight on their two grids. */
export function setupAscension(lobbyGame: Phaser.Game): void {
  const dialog = document.querySelector<HTMLDialogElement>('#ascension-dialog');
  const body = document.querySelector<HTMLElement>('#ascension-body');
  if (!dialog || !body) return;
  let hero: HeroId = 'li-yunfeng';

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const change = (action: (record: HeroRecord) => void): void => {
    const meta = loadMeta();
    action(meta.heroes[hero]);
    saveMeta(meta);
    render();
    lobbyGame.events.emit('echo-shards-changed');
  };

  const renderGrid = (record: HeroRecord, gridId: GridId): HTMLElement => {
    const definition = HEROES_PROGRESS[hero];
    const section = el('section', 'ascension-grid');
    const equipped = equippedIn(record, gridId).length;
    const heading = el('header');
    heading.append(el('b', undefined, definition.gridNames[gridId]), el('small', undefined, `${equipped} / ${slotsFor(record)} equipped`));
    const cells = el('div', 'ascension-cells');
    for (let position = 0; position < 9; position += 1) {
      if (position === CENTER) {
        const base = el('div', 'ascension-node is-base');
        base.append(el('i', undefined, '界'), el('b', undefined, 'Base Kit'), el('small', undefined, 'Always active'));
        cells.append(base);
        continue;
      }
      const node = definition.nodes.find((candidate) => candidate.grid === gridId && candidate.position === position) as GridNode;
      const state = nodeState(hero, record, node);
      const button = el('button', `ascension-node is-${state}`);
      button.type = 'button';
      button.append(el('b', undefined, node.name), el('small', undefined, node.blurb));
      const footer = el('em');
      footer.textContent = state === 'equipped' ? 'EQUIPPED' : state === 'owned' ? 'EQUIP' : state === 'available' ? `◆ ${node.cost}` : state === 'form-locked' ? `STAGE ${ROMAN[node.form]}` : 'LOCKED';
      button.append(footer);
      button.title = `${node.name} — ${node.blurb}`;
      const act = state === 'available' ? record.points >= node.cost : state === 'equipped' || state === 'owned';
      button.disabled = !act;
      button.addEventListener('click', () => change((r) => { if (state === 'available') unlockNode(hero, r, node.id); else toggleEquip(hero, r, node.id); }));
      cells.append(button);
    }
    section.append(heading, cells);
    return section;
  };

  const render = (): void => {
    const meta = loadMeta();
    const record = meta.heroes[hero];
    const definition = HEROES_PROGRESS[hero];
    const form = formOf(record);

    const tabs = el('nav', 'ascension-tabs');
    for (const id of HERO_ORDER) {
      const tab = el('button', `ascension-tab${id === hero ? ' is-active' : ''}`, SHORT_NAMES[id]);
      tab.type = 'button';
      const unlocked = isHeroUnlocked(id);
      tab.disabled = !unlocked;
      if (!unlocked) tab.textContent = `🔒 ${SHORT_NAMES[id]}`;
      tab.addEventListener('click', () => { hero = id; render(); });
      tabs.append(tab);
    }

    const forms = el('ol', 'ascension-forms');
    definition.forms.forEach((title, index) => {
      const number = (index + 1) as 1 | 2 | 3;
      const item = el('li', number < form ? 'is-done' : number === form ? 'is-current' : 'is-future');
      item.append(el('i', undefined, ROMAN[number]), el('span', undefined, title));
      forms.append(item);
    });
    const goal = nextFormGoal(hero, record);
    const summary = el('div', 'ascension-summary');
    summary.append(
      el('b', undefined, `Stage ${ROMAN[form]} — ${definition.forms[form - 1]}`),
      el('p', undefined, goal ? `Next stage: ${goal}` : 'Every stage attained.'),
      el('p', 'ascension-points', `◆ ${record.points} Dao Insight   •   ${slotsFor(record)} of ${SLOTS_PER_FORM[3]} slots per grid open`),
    );

    const grids = el('div', 'ascension-grids');
    grids.append(renderGrid(record, 'arts'), renderGrid(record, 'dispositions'));
    const hint = el('p', 'ascension-hint', 'Earn Dao Insight on any expedition: rooms explored, wardens felled and tribulations survived. Open nodes next to ones you own; equip as many as your Stage allows.');
    body.replaceChildren(tabs, forms, summary, grids, hint);
  };

  lobbyGame.events.on('hall-station', (id: string) => {
    if (id !== 'shrine' || document.body.dataset.screen !== 'lobby' || document.querySelector('dialog[open]')) return;
    const selected = lobbyGame.registry.get('selectedHero') as HeroId | undefined;
    if (selected && isHeroUnlocked(selected)) hero = selected;
    render();
    lobbyGame.events.emit('lobby-dialogue-state', true);
    dialog.showModal();
  });
  dialog.addEventListener('close', () => lobbyGame.events.emit('lobby-dialogue-state', false));
}
