import type Phaser from 'phaser';
import { AudioFeedback, type CombatSound } from '../game/AudioFeedback';
import { HUB_NAME, LOOP_NAME } from '../domain/lexicon';
import { LORE_TIPS } from '../domain/lore';
import { readSavedRun } from '../domain/savedRun';
import { DEFAULT_GAME_SETTINGS, type GameSettings } from '../game/settings';

// Art the menu shows straight away; the boot screen waits for it so the menu
// never pops in half-drawn.
const MENU_IMAGES = [
  '/assets/environments/realm-hall-v1.png',
  '/assets/gameplay-kit/assets/heroes/li_yunfeng/idle/S.png',
  '/assets/gameplay-kit/assets/heroes/seo_jiwon/idle/SE.png',
  '/assets/gameplay-kit/assets/heroes/tsukishiro_rei/idle/SW.png',
  '/assets/gameplay-kit/assets/familiars/rei_fire_fox/idle/SW.png',
];
const LOADING_STEPS: readonly [number, string][] = [
  [0, 'Gathering echoes'],
  [0.3, 'Binding spirit blades'],
  [0.55, 'Waking the moonfox'],
  [0.8, `Opening the ${HUB_NAME}`],
  [1, 'The gate is open'],
];
const GAMEPLAY_TIPS = [
  'Space attacks, E unleashes your ability.',
  'Red rings mark where an attack will land. Step out before it resolves.',
  'Bosses enrage at half health. Their attacks quicken, but every one can still be dodged.',
  `Talk to the other wanderers in the ${HUB_NAME} to change heroes.`,
  'Walk into the boss echo to travel to the next realm.',
  'Online co-op links two devices with a six-character room code.',
];
const TIPS: readonly string[] = [...GAMEPLAY_TIPS, ...LORE_TIPS];
const HERO_NAMES = { 'li-yunfeng': 'Li Yunfeng', 'seo-jiwon': 'Seo Jiwon', 'tsukishiro-rei': 'Tsukishiro Rei' } as const;
const MIN_BOOT_MS = 1400;
// If an asset never answers, let the player in anyway rather than hang the boot.
const BOOT_TIMEOUT_MS = 15000;
const EMBER_COUNT = 28;

export function setupTitleScreen(lobbyGame: Phaser.Game): void {
  const boot = document.querySelector<HTMLElement>('#boot-screen');
  const titleScreen = document.querySelector<HTMLElement>('[data-screen="title"]');
  const allButtons = [...document.querySelectorAll<HTMLButtonElement>('.title-menu button')];
  // Continue only shows while there is a saved expedition, so the focus list is always the visible buttons.
  const visible = (): HTMLButtonElement[] => allButtons.filter((button) => !button.hidden);
  if (!boot || !titleScreen || allButtons.length === 0) return;

  const audio = new AudioFeedback(DEFAULT_GAME_SETTINGS);
  const playSound = (sound: CombatSound): void => {
    audio.updateSettings((lobbyGame.registry.get('gameSettings') as GameSettings | undefined) ?? DEFAULT_GAME_SETTINGS);
    audio.play(sound);
  };

  spawnEmbers(titleScreen.querySelector<HTMLElement>('.title-embers'));

  // Menu navigation: one focused entry that keyboard, gamepad and mouse share.
  let focusIndex = 0;
  let booting = true;
  const setFocus = (index: number, sound: boolean): void => {
    const buttons = visible();
    const next = (index + buttons.length) % buttons.length;
    if (sound && next !== focusIndex) playSound('ui-move');
    focusIndex = next;
    buttons.forEach((button, buttonIndex) => button.classList.toggle('is-focused', buttonIndex === focusIndex));
    for (const button of allButtons) if (button.hidden) button.classList.remove('is-focused');
    if (!booting && titleActive()) buttons[focusIndex].focus({ preventScroll: true });
  };
  const confirm = (): void => {
    playSound('ui-confirm');
    visible()[focusIndex]?.click();
  };
  const titleActive = (): boolean => document.body.dataset.screen === 'title' && !document.querySelector('dialog[open]');
  allButtons.forEach((button) => {
    button.addEventListener('pointerenter', () => setFocus(visible().indexOf(button), true));
    button.addEventListener('focus', () => setFocus(visible().indexOf(button), false));
    button.addEventListener('pointerdown', () => playSound('ui-confirm'));
  });
  /** Shows Continue (and makes it the primary action) when an expedition is saved. */
  const refreshContinue = (): void => {
    const saved = readSavedRun();
    const continueButton = allButtons.find((button) => button.dataset.action === 'continue-run');
    const playButton = allButtons.find((button) => button.dataset.action === 'open-lobby');
    if (!continueButton || !playButton) return;
    continueButton.hidden = !saved;
    continueButton.classList.toggle('menu-button-primary', Boolean(saved));
    playButton.classList.toggle('menu-button-primary', !saved);
    titleScreen.classList.toggle('has-continue', Boolean(saved));
    const detail = document.querySelector<HTMLElement>('#continue-detail');
    if (saved && detail) detail.textContent = `${HERO_NAMES[saved.heroId]} · ${LOOP_NAME} ${saved.resonance + 1} · Realm ${saved.themeIndex + 1}`;
    setFocus(0, false);
  };
  refreshContinue();
  lobbyGame.events.on('screen-shown', (name: string) => { if (name === 'title') refreshContinue(); });
  setFocus(0, false);

  window.addEventListener('keydown', (event) => {
    if (booting || !titleActive() || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowup' || key === 'w') { event.preventDefault(); setFocus(focusIndex - 1, true); }
    else if (key === 'arrowdown' || key === 's') { event.preventDefault(); setFocus(focusIndex + 1, true); }
    else if ((key === 'enter' || key === ' ' || key === 'e') && !event.repeat) { event.preventDefault(); confirm(); }
  });

  // Gamepad: d-pad or left stick to move, A / Cross to confirm.
  const padState = { held: '', repeatAt: 0 };
  const pollGamepad = (time: number): void => {
    requestAnimationFrame(pollGamepad);
    const pad = navigator.getGamepads?.().find((candidate) => candidate?.connected);
    if (!pad) return;
    const axis = pad.axes[1] ?? 0;
    const up = pad.buttons[12]?.pressed || axis < -0.6;
    const down = pad.buttons[13]?.pressed || axis > 0.6;
    const accept = pad.buttons[0]?.pressed || pad.buttons[9]?.pressed;
    const input = accept ? 'accept' : up ? 'up' : down ? 'down' : '';
    if (input !== padState.held) {
      padState.held = input;
      padState.repeatAt = time + 380;
    } else if (!input || input === 'accept' || time < padState.repeatAt) return;
    else padState.repeatAt = time + 150;
    if (!input) return;
    if (booting) { if (input === 'accept') finishBoot(); return; }
    if (!titleActive()) return;
    if (input === 'up') setFocus(focusIndex - 1, true);
    else if (input === 'down') setFocus(focusIndex + 1, true);
    else confirm();
  };
  requestAnimationFrame(pollGamepad);

  // Deep links (?view=lobby, ?view=lab) skip the boot and open straight in place.
  const requestedView = new URLSearchParams(window.location.search).get('view');
  if (requestedView === 'lobby' || requestedView === 'lab') {
    booting = false;
    boot.hidden = true;
    return;
  }

  const fill = boot.querySelector<HTMLElement>('.boot-track');
  const percent = boot.querySelector<HTMLElement>('#boot-percent');
  const statusText = boot.querySelector<HTMLElement>('#boot-status-text');
  const progressBar = boot.querySelector<HTMLElement>('#boot-progress');
  const prompt = boot.querySelector<HTMLButtonElement>('#boot-prompt');
  const tip = boot.querySelector<HTMLElement>('#boot-tip');

  let imagesLoaded = 0;
  for (const source of MENU_IMAGES) {
    const image = new Image();
    image.onload = image.onerror = () => { imagesLoaded += 1; };
    image.src = source;
  }
  let fontsReady = false;
  void document.fonts?.ready.then(() => { fontsReady = true; });
  if (!document.fonts) fontsReady = true;
  const hallProgress = (): number => {
    if (lobbyGame.scene.isActive('realm-hall')) return 1;
    const scene = lobbyGame.scene.getScene('realm-hall') as Phaser.Scene | null;
    return scene?.load ? scene.load.progress : 0;
  };

  let tipIndex = Math.floor(Math.random() * TIPS.length);
  if (tip) tip.textContent = TIPS[tipIndex];
  const tipTimer = window.setInterval(() => {
    tipIndex = (tipIndex + 1) % TIPS.length;
    if (tip) tip.textContent = TIPS[tipIndex];
  }, 3200);

  const startedAt = performance.now();
  let shown = 0;
  let ready = false;
  const tick = (now: number): void => {
    if (!booting) return;
    const elapsed = now - startedAt;
    const target = elapsed > BOOT_TIMEOUT_MS
      ? 1
      : hallProgress() * 0.6 + (imagesLoaded / MENU_IMAGES.length) * 0.3 + (fontsReady ? 0.1 : 0);
    // Ease toward the real progress, but never finish before the minimum time so
    // the screen reads as a beat rather than a flash.
    const cap = Math.min(1, elapsed / MIN_BOOT_MS);
    shown = Math.min(cap, shown + (Math.min(target, cap) - shown) * 0.12 + 0.002);
    if (target >= 1 && cap >= 1 && shown > 0.995) shown = 1;
    const value = Math.round(shown * 100);
    fill?.style.setProperty('--boot-progress', `${shown * 100}%`);
    if (percent) percent.textContent = `${value}%`;
    progressBar?.setAttribute('aria-valuenow', String(value));
    if (statusText) statusText.textContent = [...LOADING_STEPS].reverse().find(([threshold]) => shown >= threshold)?.[1] ?? '';
    if (shown >= 1 && !ready) {
      ready = true;
      if (prompt) { prompt.hidden = false; prompt.focus({ preventScroll: true }); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const finishBoot = (): void => {
    if (!ready || !booting) return;
    booting = false;
    window.clearInterval(tipTimer);
    window.removeEventListener('keydown', onBootKey, true);
    boot.removeEventListener('pointerdown', onBootPointer);
    playSound('ui-confirm');
    boot.classList.add('is-leaving');
    window.setTimeout(() => { boot.hidden = true; }, 520);
    setFocus(focusIndex, false);
  };
  const onBootKey = (event: KeyboardEvent): void => {
    if (!booting) return;
    // Swallow every key while booting so nothing behind the overlay reacts.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat && !['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(event.key)) finishBoot();
  };
  const onBootPointer = (): void => finishBoot();
  window.addEventListener('keydown', onBootKey, true);
  boot.addEventListener('pointerdown', onBootPointer);
}

function spawnEmbers(container: HTMLElement | null): void {
  if (!container) return;
  const colors = ['#f0c46a', '#f7dd9a', '#5fe0c4', '#8fb8ff'];
  for (let index = 0; index < EMBER_COUNT; index += 1) {
    const ember = document.createElement('i');
    const size = 2 + Math.round(Math.random() * 2);
    ember.style.cssText = [
      `left:${(Math.random() * 100).toFixed(1)}%`,
      `--size:${size}px`,
      `--color:${colors[index % colors.length]}`,
      `--alpha:${(0.35 + Math.random() * 0.5).toFixed(2)}`,
      `--drift:${Math.round(Math.random() * 120 - 60)}px`,
      `--duration:${(8 + Math.random() * 9).toFixed(1)}s`,
      `--delay:${(-Math.random() * 17).toFixed(1)}s`,
    ].join(';');
    container.append(ember);
  }
}
