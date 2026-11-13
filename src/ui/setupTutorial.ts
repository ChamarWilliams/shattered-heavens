import type Phaser from 'phaser';
import { loadMeta, saveMeta } from '../domain/metaProgress';
import { ALL_HINTS, HINTS_BY_ID, PRACTICE_DONE, renderHint, shouldShow, type TutorialHint } from '../domain/tutorial';
import type { GameSettings } from '../game/settings';

const TIP_SECONDS = 14;

/**
 * The guidance card. Scenes ask for a hint by id ('tutorial-hint'); the card
 * shows each one once, in order, and records it as seen the moment it shows.
 * Practice steps close when the scene reports them done ('tutorial-step-done');
 * tips close on "Got it" or after a while.
 */
export function setupTutorial(lobbyGame: Phaser.Game): void {
  const card = document.querySelector<HTMLElement>('#tutorial-card');
  const title = document.querySelector<HTMLElement>('#tutorial-title');
  const text = document.querySelector<HTMLElement>('#tutorial-text');
  const ok = document.querySelector<HTMLButtonElement>('#tutorial-ok');
  const skip = document.querySelector<HTMLButtonElement>('#tutorial-skip');
  if (!card || !title || !text || !ok || !skip) return;
  const queue: TutorialHint[] = [];
  let current: TutorialHint | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const enabled = (): boolean => (lobbyGame.registry.get('gameSettings') as GameSettings | undefined)?.tutorialHints !== false;
  const markSeen = (ids: readonly string[]): void => {
    const meta = loadMeta();
    for (const id of ids) if (!meta.tutorial.includes(id)) meta.tutorial.push(id);
    saveMeta(meta);
  };

  const render = (hint: TutorialHint): void => {
    const mode = document.documentElement.dataset.inputMode === 'touch' ? 'touch' : 'desktop';
    title.textContent = hint.title;
    text.replaceChildren(...renderHint(hint.text, mode).map((part) => {
      if ('text' in part) return document.createTextNode(part.text);
      const key = document.createElement('kbd');
      key.textContent = part.key;
      return key;
    }));
    ok.hidden = hint.kind === 'step';
  };

  const visible = (): boolean => document.body.dataset.screen === 'lobby';

  const showNext = (): void => {
    clearTimeout(timer);
    // Hints wait (unseen) while another screen is up, e.g. the title menu.
    current = visible() ? queue.shift() : undefined;
    if (!current) { card.hidden = true; card.classList.remove('is-done'); return; }
    markSeen([current.id]);
    render(current);
    card.classList.remove('is-done');
    card.hidden = false;
    card.classList.remove('is-entering');
    void card.offsetWidth;
    card.classList.add('is-entering');
    if (current.kind === 'tip') timer = setTimeout(showNext, TIP_SECONDS * 1000);
  };

  lobbyGame.events.on('tutorial-hint', (id: string) => {
    if (!shouldShow(id, loadMeta().tutorial, enabled())) return;
    if (current?.id === id || queue.some((hint) => hint.id === id)) return;
    const hint = HINTS_BY_ID.get(id);
    if (!hint) return;
    // Practice steps jump the queue so the lesson stays in order.
    if (hint.kind === 'step') queue.unshift(hint); else queue.push(hint);
    if (!current) showNext();
  });

  lobbyGame.events.on('tutorial-step-done', (id: string) => {
    if (current?.id !== id) return;
    card.classList.add('is-done');
    clearTimeout(timer);
    timer = setTimeout(showNext, 650);
  });

  ok.addEventListener('click', showNext);
  skip.addEventListener('click', () => {
    markSeen([...ALL_HINTS.map((hint) => hint.id), PRACTICE_DONE]);
    queue.length = 0;
    showNext();
    lobbyGame.events.emit('tutorial-skipped');
  });

  lobbyGame.events.on('tutorial-reset', () => {
    const meta = loadMeta();
    meta.tutorial = [];
    saveMeta(meta);
    queue.length = 0;
    showNext();
  });

  // Leaving the game screen hides the card (its hint already counts as seen); coming back shows what is waiting.
  lobbyGame.events.on('screen-shown', (screen: string) => {
    if (screen !== 'lobby') { clearTimeout(timer); current = undefined; card.hidden = true; }
    else if (!current) showNext();
  });
  lobbyGame.events.on('dungeon-mode', () => { queue.length = 0; showNext(); card.classList.remove('is-top'); });
  // In a room the card keeps out of the hero's way: top when they are in the lower half.
  lobbyGame.events.on('hero-half', (half: 'top' | 'bottom') => card.classList.toggle('is-top', half === 'bottom'));

  document.querySelector<HTMLButtonElement>('#tutorial-replay')?.addEventListener('click', (event) => {
    lobbyGame.events.emit('tutorial-reset');
    const button = event.currentTarget as HTMLButtonElement;
    button.textContent = 'Reset';
    setTimeout(() => { button.textContent = 'Replay'; }, 1600);
  });
}
