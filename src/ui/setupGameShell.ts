import type Phaser from 'phaser';
import { CoopClient } from '../coop/CoopClient';
import { normalizeRoomCode, type CoopRoomSnapshot } from '../coop/protocol';
import { isHeroUnlocked } from '../domain/heroUnlocks';
import { formTitle } from '../domain/heroProgress';
import { readSavedRun } from '../domain/savedRun';
import { loadMeta } from '../domain/metaProgress';
import { GAME_TITLE, HUB_NAME } from '../domain/lexicon';
import { DEFAULT_GAME_SETTINGS, normalizeSettings, type GameSettings } from '../game/settings';
import { AudioFeedback } from '../game/AudioFeedback';
import { music } from '../game/music';

type ScreenName = 'title' | 'lobby' | 'lab';
type HeroId = 'li-yunfeng' | 'seo-jiwon' | 'tsukishiro-rei';

interface HeroProfile {
  readonly id: HeroId;
  readonly name: string;
  readonly school: string;
  readonly epithet: string;
  readonly tags: readonly string[];
  readonly description: string;
  readonly basic: string;
  readonly ability: string;
  readonly portrait: string;
}

const profiles: Record<HeroId, HeroProfile> = {
  'li-yunfeng': {
    id: 'li-yunfeng',
    name: 'Li Yunfeng',
    school: 'THE SECTLESS PATH',
    epithet: 'The Sword Without a Sect',
    tags: ['MELEE', 'CONTROL', 'SEALS'],
    description: 'A wandering cultivator who commands four spirit blades and recalls the seals they leave behind.',
    basic: 'Sectless Edge',
    ability: 'Fourfold Flying Sword',
    portrait: '/assets/ui/hero-portraits/li-yunfeng.png',
  },
  'seo-jiwon': {
    id: 'seo-jiwon',
    name: 'Seo Jiwon',
    school: 'THE NIGHTFOLD EXILE',
    epithet: 'The Blade Between Shadows',
    tags: ['ASSASSIN', 'MOBILITY', 'ECHOES'],
    description: 'A relentless duelist who folds distance, leaves shadow echoes, and ruptures them from impossible angles.',
    basic: 'Heartbreak Rend',
    ability: 'Nightfold Passage',
    portrait: '/assets/ui/hero-portraits/seo-jiwon.png',
  },
  'tsukishiro-rei': {
    id: 'tsukishiro-rei',
    name: 'Tsukishiro Rei',
    school: 'THE MOONFOX COVENANT',
    epithet: 'Heir to the Moonfox Flame',
    tags: ['SUMMONER', 'RANGED', 'FOXFIRE'],
    description: 'A spirit caller whose moonfire wisps empower a living fox familiar to hunt across the battlefield.',
    basic: 'Moonfire Arc',
    ability: 'Foxfire Covenant',
    portrait: '/assets/ui/hero-portraits/tsukishiro-rei.png',
  },
};


const required = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing game shell element: ${selector}`);
  return element;
};

const storedValue = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

const storeValue = (key: string, value: string): void => {
  try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ }
};

export function setupGameShell(game: Phaser.Game, lobbyGame: Phaser.Game): void {
  const screens = [...document.querySelectorAll<HTMLElement>('[data-screen]')];
  const settingsDialog = required<HTMLDialogElement>('#settings-dialog');
  const coopDialog = required<HTMLDialogElement>('#coop-dialog');
  const archiveDialog = required<HTMLDialogElement>('#archive-dialog');
  const characterSelect = required<HTMLSelectElement>('#character-select');
  const nameInput = required<HTMLInputElement>('#wanderer-name');
  const playerName = required<HTMLElement>('#party-player-name');
  let selectedHero: HeroId = 'li-yunfeng';
  let dungeonMode = false;
  const coopClient = new CoopClient();
  lobbyGame.registry.set('coopClient', coopClient);

  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const applyInputMode = (mode: 'touch' | 'desktop'): void => {
    document.documentElement.dataset.inputMode = mode;
  };
  const detectInputMode = (): 'touch' | 'desktop' => coarsePointer.matches || navigator.maxTouchPoints > 0 ? 'touch' : 'desktop';
  applyInputMode(detectInputMode());
  coarsePointer.addEventListener('change', () => applyInputMode(detectInputMode()));
  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') applyInputMode('touch');
  }, { passive: true });
  type LobbyMoveDirection = 'N' | 'E' | 'S' | 'W';
  const lobbyKeyDirections = new Map<string, LobbyMoveDirection>([
    ['w', 'N'], ['arrowup', 'N'],
    ['d', 'E'], ['arrowright', 'E'],
    ['s', 'S'], ['arrowdown', 'S'],
    ['a', 'W'], ['arrowleft', 'W'],
  ]);
  const heldLobbyKeys = new Set<string>();
  const heldLobbyPointers = new Map<number, LobbyMoveDirection>();
  const emitHeldLobbyMovement = (): void => {
    let x = 0;
    let y = 0;
    const applyDirection = (direction?: LobbyMoveDirection): void => {
      if (direction === 'N') y -= 1;
      if (direction === 'S') y += 1;
      if (direction === 'W') x -= 1;
      if (direction === 'E') x += 1;
    };
    for (const key of heldLobbyKeys) applyDirection(lobbyKeyDirections.get(key));
    for (const direction of heldLobbyPointers.values()) applyDirection(direction);
    lobbyGame.events.emit('lobby-input', x === 0 && y === 0 ? undefined : { x, y });
  };
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select')) return;
    applyInputMode('desktop');
    if (document.body.dataset.screen !== 'lobby') return;
    const key = event.key.toLowerCase();
    if (key === 'e') {
      event.preventDefault();
      if (!event.repeat) lobbyGame.events.emit(dungeonMode ? 'dungeon-ability' : 'lobby-interact');
      return;
    }
    if (!lobbyKeyDirections.has(key)) return;
    event.preventDefault();
    heldLobbyKeys.add(key);
    emitHeldLobbyMovement();
  });
  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (!heldLobbyKeys.delete(key)) return;
    event.preventDefault();
    emitHeldLobbyMovement();
  });
  window.addEventListener('blur', () => {
    heldLobbyKeys.clear();
    heldLobbyPointers.clear();
    lobbyGame.events.emit('lobby-input', undefined);
  });

  const updateUrl = (screen: ScreenName): void => {
    const url = new URL(window.location.href);
    if (screen === 'title') url.searchParams.delete('view');
    else url.searchParams.set('view', screen);
    history.replaceState({}, '', url);
  };

  const showScreen = (name: ScreenName, updateHistory = true): void => {
    for (const screen of screens) {
      const active = screen.dataset.screen === name;
      screen.classList.toggle('is-active', active);
      screen.toggleAttribute('inert', !active);
      screen.setAttribute('aria-hidden', String(!active));
    }
    document.body.dataset.screen = name;
    lobbyGame.events.emit('screen-shown', name);
    // The dungeon picks its own music; elsewhere the screen decides.
    if (!dungeonMode) music.setTrack(name === 'title' ? 'title' : name === 'lobby' ? 'pavilion' : undefined);
    document.title = name === 'title' ? GAME_TITLE : name === 'lobby' ? `${GAME_TITLE} — ${HUB_NAME}` : `${GAME_TITLE} — Combat Lab`;
    if (name === 'lab') game.loop.wake(); else game.loop.sleep();
    if (name === 'lobby') lobbyGame.loop.wake(); else lobbyGame.loop.sleep();
    if (updateHistory) updateUrl(name);
    if (name === 'lab') requestAnimationFrame(() => game.scale.refresh());
    if (name === 'lobby') requestAnimationFrame(() => lobbyGame.scale.refresh());
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const selectHero = (id: HeroId, persist = true): void => {
    // Locked heroes join after their realm's warden falls (see heroUnlocks).
    if (!isHeroUnlocked(id)) return;
    const profile = profiles[id];
    selectedHero = id;
    required<HTMLElement>('#selected-school').textContent = profile.school;
    required<HTMLElement>('#selected-name').textContent = profile.name;
    required<HTMLElement>('#selected-epithet').textContent = profile.epithet;
    required<HTMLElement>('#selected-description').textContent = profile.description;
    required<HTMLElement>('#selected-basic').textContent = profile.basic;
    required<HTMLElement>('#selected-ability').textContent = profile.ability;
    required<HTMLElement>('#party-hero-name').textContent = profile.name;
    const portrait = required<HTMLImageElement>('#selected-portrait');
    portrait.src = profile.portrait;
    portrait.alt = profile.name;
    required<HTMLImageElement>('#party-portrait').src = profile.portrait;
    const tags = required<HTMLElement>('#selected-tags');
    tags.replaceChildren(...profile.tags.map((tag) => {
      const element = document.createElement('span');
      element.textContent = tag;
      return element;
    }));
    for (const card of document.querySelectorAll<HTMLButtonElement>('[data-hero]')) {
      const isSelected = card.dataset.hero === id;
      const locked = !isHeroUnlocked(card.dataset.hero as HeroId);
      card.classList.toggle('is-selected', isSelected);
      card.classList.toggle('is-locked', locked);
      card.setAttribute('aria-pressed', String(isSelected));
      const state = card.querySelector<HTMLElement>(':scope > i');
      if (state) state.textContent = locked ? 'LOCKED' : isSelected ? 'SELECTED' : 'SELECT';
    }
    characterSelect.value = id;
    characterSelect.dispatchEvent(new Event('change', { bubbles: true }));
    lobbyGame.registry.set('selectedHero', id);
    lobbyGame.events.emit('lobby-hero-selected', id);
    if (persist) storeValue('echoes.selectedHero', id);
  };

  const normalizeName = (value: string): string => value.replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').slice(0, 18);
  const applyName = (persist: boolean): void => {
    const normalized = normalizeName(nameInput.value);
    nameInput.value = normalized;
    playerName.textContent = normalized.trim() || 'Wanderer';
    if (persist) storeValue('echoes.wandererName', normalized.trim() || 'Wanderer');
  };

  const savedName = storedValue('echoes.wandererName');
  if (savedName) nameInput.value = normalizeName(savedName);
  applyName(false);
  nameInput.addEventListener('input', () => applyName(false));
  nameInput.addEventListener('change', () => applyName(true));
  nameInput.addEventListener('blur', () => applyName(true));

  for (const card of document.querySelectorAll<HTMLButtonElement>('[data-hero]')) {
    card.addEventListener('click', () => {
      if (dungeonMode) return;
      selectHero(card.dataset.hero as HeroId);
    });
  }

  lobbyGame.events.on('lobby-hero-request', (id: HeroId) => {
    if (dungeonMode) return;
    selectHero(id);
  });
  lobbyGame.events.on('lobby-action', (action: string) => {
    if (action === 'enter') {
      applyName(true);
      selectHero(selectedHero);
      const coopSnapshot = coopClient.currentSnapshot;
      // Co-op runs share the room's seed; solo runs must roll a fresh one even after leaving a room.
      if (coopSnapshot) lobbyGame.registry.set('dungeonSeed', coopSnapshot.seed);
      else lobbyGame.registry.remove('dungeonSeed');
      lobbyGame.scene.stop('realm-hall');
      lobbyGame.scene.stop('grand-archive');
      lobbyGame.scene.start('dungeon-run');
    } else if (action === 'settings') settingsDialog.showModal();
  });
  // The stat card follows the hero into the dungeon: live hearts, ability charge and loot.
  const healthBar = required<HTMLElement>('.mobile-player-card .health-bar');
  const spiritBar = required<HTMLElement>('.mobile-player-card .spirit-bar');
  const relicStrip = required<HTMLElement>('#player-relics');
  const resonanceChip = required<HTMLElement>('#player-resonance');
  const shardCount = required<HTMLElement>('.lobby-status .resource b');
  const setBar = (bar: HTMLElement, ratio: number, label: string): void => {
    bar.querySelector<HTMLElement>('i')!.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    bar.querySelector<HTMLElement>('span')!.textContent = label;
  };
  const formChip = required<HTMLElement>('#player-form');
  const refreshShards = (): void => {
    const meta = loadMeta();
    shardCount.textContent = String(meta.shards);
    // Every hero's current title, kept up to date as feats are earned.
    if (!dungeonMode) formChip.textContent = formTitle(selectedHero, meta.heroes[selectedHero]);
  };
  refreshShards();
  lobbyGame.events.on('echo-shards-changed', refreshShards);
  lobbyGame.events.on('lobby-hero-selected', refreshShards);
  lobbyGame.events.on('run-vitals', (vitals: { formTitle: string; name: string; health: number; maxHealth: number; abilityRatio: number; abilityLabel: string; resonance: number; items: { sprite: number; name: string; blurb: string; count: number }[]; blessings: string[] }) => {
    required<HTMLElement>('#selected-name').textContent = vitals.name;
    formChip.textContent = vitals.formTitle;
    setBar(healthBar, vitals.health / vitals.maxHealth, `${vitals.health} / ${vitals.maxHealth}`);
    healthBar.classList.toggle('is-low', vitals.health <= 2);
    setBar(spiritBar, vitals.abilityRatio, vitals.abilityLabel);
    spiritBar.classList.toggle('is-ready', vitals.abilityRatio >= 1);
    resonanceChip.textContent = `TRIBULATION ${vitals.resonance}`;
    resonanceChip.hidden = false;
    relicStrip.replaceChildren(...vitals.items.map((item) => {
      const icon = document.createElement('i');
      icon.style.setProperty('--sprite', String(item.sprite));
      icon.title = `${item.name} — ${item.blurb}`;
      if (item.count > 1) icon.dataset.count = `×${item.count}`;
      return icon;
    }), ...vitals.blessings.map((name) => {
      const icon = document.createElement('b');
      icon.textContent = '✦';
      icon.title = name;
      return icon;
    }));
  });
  const resetStatCard = (): void => {
    required<HTMLElement>('#selected-name').textContent = profiles[selectedHero].name;
    setBar(healthBar, 1, '7 / 7');
    setBar(spiritBar, 1, 'READY');
    healthBar.classList.remove('is-low');
    relicStrip.replaceChildren();
    resonanceChip.hidden = true;
  };
  lobbyGame.events.on('dungeon-mode', (active: boolean) => {
    dungeonMode = active;
    if (!active) music.setTrack(document.body.dataset.screen === 'lobby' ? 'pavilion' : document.body.dataset.screen === 'title' ? 'title' : undefined);
    if (!active) resetStatCard();
    document.body.classList.toggle('is-dungeon-run', active);
    const interact = required<HTMLButtonElement>('#lobby-interact');
    const label = interact.querySelector('small');
    if (label) label.textContent = active ? 'ATTACK' : 'TALK';
    required<HTMLButtonElement>('#dungeon-ability').hidden = !active;
    if (!active) required<HTMLButtonElement>('#dungeon-use').hidden = true;
    for (const card of document.querySelectorAll<HTMLButtonElement>('[data-hero]')) card.disabled = active;
    if (active) lobbyGame.events.emit('lobby-dialogue-state', false);
  });
  archiveDialog.addEventListener('close', () => lobbyGame.events.emit('lobby-dialogue-state', false));

  const selectArchiveCollection = (target: string | undefined): void => {
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-archive-tab]')) {
      button.classList.toggle('is-active', button.dataset.archiveTab === target);
    }
    for (const panel of document.querySelectorAll<HTMLElement>('[data-archive-panel]')) {
      const active = panel.dataset.archivePanel === target;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    }
  };
  for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-archive-tab]')) {
    tab.addEventListener('click', () => selectArchiveCollection(tab.dataset.archiveTab));
  }
  lobbyGame.events.on('archive-collection', (collection: string) => {
    selectArchiveCollection(collection);
    lobbyGame.events.emit('lobby-dialogue-state', true);
    archiveDialog.showModal();
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-lobby-move]')) {
    const stop = (event: PointerEvent): void => {
      heldLobbyPointers.delete(event.pointerId);
      emitHeldLobbyMovement();
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      heldLobbyPointers.set(event.pointerId, button.dataset.lobbyMove as LobbyMoveDirection);
      emitHeldLobbyMovement();
    });
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
  }
  required<HTMLButtonElement>('#lobby-interact').addEventListener('click', () => lobbyGame.events.emit(dungeonMode ? 'dungeon-attack' : 'lobby-interact'));
  required<HTMLButtonElement>('#dungeon-ability').addEventListener('click', () => lobbyGame.events.emit('dungeon-ability'));
  // Touch players use the Peddler, Altar and Bell with USE; it shows only beside one.
  const useButton = required<HTMLButtonElement>('#dungeon-use');
  useButton.addEventListener('click', () => lobbyGame.events.emit('dungeon-interact'));
  // Holding USE revives a fallen ally (co-op).
  useButton.addEventListener('pointerdown', () => lobbyGame.events.emit('dungeon-use-hold', true));
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) useButton.addEventListener(type, () => lobbyGame.events.emit('dungeon-use-hold', false));
  lobbyGame.events.on('dungeon-interact-available', (available: boolean) => { useButton.hidden = !available || !dungeonMode; });

  const coopStatus = required<HTMLElement>('#coop-status');
  const coopRoom = required<HTMLElement>('#coop-room');
  const coopCodeDisplay = required<HTMLElement>('#coop-room-code-display');
  const coopParty = required<HTMLElement>('#coop-party');
  const coopEnter = required<HTMLButtonElement>('#coop-enter');
  const coopLeave = required<HTMLButtonElement>('#coop-leave');
  const coopCodeInput = required<HTMLInputElement>('#coop-room-code');
  const setCoopStatus = (message: string, error = false): void => {
    coopStatus.textContent = message;
    coopStatus.classList.toggle('is-error', error);
  };
  const renderCoopRoom = (snapshot: CoopRoomSnapshot): void => {
    coopRoom.hidden = false;
    coopCodeDisplay.textContent = snapshot.roomCode;
    coopParty.replaceChildren(...snapshot.players.map((player) => {
      const entry = document.createElement('span');
      entry.textContent = `${player.name} · ${profiles[player.heroId].name}${player.id === snapshot.hostId ? ' · leader' : ''}${player.connected ? '' : ' · reconnecting'}`;
      return entry;
    }));
    coopEnter.hidden = false;
    coopLeave.hidden = false;
    const leading = snapshot.hostId === coopClient.currentMembership?.playerId;
    const leader = snapshot.players.find((player) => player.id === snapshot.hostId)?.name ?? 'The leader';
    setCoopStatus(
      snapshot.phase === 'expedition' && !snapshot.completed ? 'The expedition is under way. Enter to join the party.'
        : !leading ? `${leader} leads this party. Wait in the Pavilion: they will take everyone through the Realm Gate.`
          : snapshot.players.length < 2 ? 'Room created. Share the code. You lead: walk into the Realm Gate when everyone is in the Pavilion.'
            : 'You lead the party. Walk into the Realm Gate when everyone is in the Pavilion.',
    );
  };
  coopClient.onSnapshot(renderCoopRoom);
  // When the leader walks into the Realm Gate, every wanderer in the party goes in together.
  let enteredExpedition = 0;
  coopClient.onSnapshot((snapshot) => {
    if (snapshot.phase !== 'expedition' || snapshot.completed || dungeonMode || snapshot.expedition === enteredExpedition) return;
    enteredExpedition = snapshot.expedition;
    for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) dialog.close();
    if (document.body.dataset.screen !== 'lobby') showScreen('lobby');
    lobbyGame.events.emit('lobby-action', 'enter');
  });
  coopClient.onState((state, message) => {
    if (state === 'reconnecting') setCoopStatus(message ?? 'Reconnecting…', true);
    if (state === 'error') setCoopStatus(message ?? 'Connection failed.', true);
  });
  const withCoopRequest = async (request: () => Promise<CoopRoomSnapshot>): Promise<void> => {
    setCoopStatus('Opening the cross-realm link…');
    try { renderCoopRoom(await request()); }
    catch (error) { setCoopStatus(error instanceof Error ? error.message : 'Could not connect.', true); }
  };
  required<HTMLButtonElement>('#coop-host').addEventListener('click', () => {
    applyName(true);
    void withCoopRequest(() => coopClient.host(playerName.textContent ?? 'Wanderer', selectedHero));
  });
  required<HTMLButtonElement>('#coop-join').addEventListener('click', () => {
    applyName(true);
    const code = normalizeRoomCode(coopCodeInput.value);
    coopCodeInput.value = code;
    void withCoopRequest(() => coopClient.join(code, playerName.textContent ?? 'Wanderer', selectedHero));
  });
  coopCodeInput.addEventListener('input', () => { coopCodeInput.value = normalizeRoomCode(coopCodeInput.value); });
  required<HTMLButtonElement>('#coop-copy-code').addEventListener('click', () => {
    void navigator.clipboard?.writeText(coopCodeDisplay.textContent ?? '');
    setCoopStatus('Room code copied.');
  });
  coopLeave.addEventListener('click', () => {
    void coopClient.leave();
    coopRoom.hidden = true;
    coopEnter.hidden = true;
    coopLeave.hidden = true;
    setCoopStatus('Room closed on this device.');
  });
  coopEnter.addEventListener('click', () => {
    const snapshot = coopClient.currentSnapshot;
    if (snapshot) lobbyGame.registry.set('dungeonSeed', snapshot.seed);
    coopDialog.close();
    showScreen('lobby');
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    button.addEventListener('click', () => {
      switch (button.dataset.action) {
        case 'open-lobby':
          selectHero('li-yunfeng');
          showScreen('lobby');
          break;
        case 'continue-run': {
          const saved = readSavedRun();
          if (!saved) break;
          selectHero(saved.heroId);
          lobbyGame.registry.set('resumeRun', saved);
          showScreen('lobby');
          lobbyGame.events.emit('lobby-action', 'enter');
          break;
        }
        case 'back-title': showScreen('title'); break;
        case 'back-lobby': showScreen('lobby'); break;
        case 'open-lab':
          selectHero(selectedHero, false);
          showScreen('lab');
          break;
        case 'enter-training':
          applyName(true);
          selectHero(selectedHero);
          showScreen('lab');
          break;
        case 'open-settings': settingsDialog.showModal(); break;
        case 'open-coop': coopDialog.showModal(); break;
      }
    });
  }

  // Interface sounds for every dialog: a soft open and close.
  const uiAudio = new AudioFeedback(DEFAULT_GAME_SETTINGS);
  for (const dialog of document.querySelectorAll('dialog')) {
    new MutationObserver(() => uiAudio.play(dialog.open ? 'ui-open' : 'ui-back')).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }

  const masterVolume = required<HTMLInputElement>('#master-volume');
  const effectsVolume = required<HTMLInputElement>('#effects-volume');
  const masterOutput = required<HTMLOutputElement>('#master-volume-output');
  const effectsOutput = required<HTMLOutputElement>('#effects-volume-output');
  const musicVolume = required<HTMLInputElement>('#music-volume');
  const musicOutput = required<HTMLOutputElement>('#music-volume-output');
  const reduceMotion = required<HTMLInputElement>('#reduce-motion');
  const damageNumbers = required<HTMLInputElement>('#damage-numbers');
  const accessibleWarnings = required<HTMLInputElement>('#accessible-warnings');
  const screenShake = required<HTMLSelectElement>('#screen-shake');
  const textScale = required<HTMLSelectElement>('#text-scale');
  const tutorialHints = required<HTMLInputElement>('#tutorial-hints');
  const savedSettings = storedValue('echoes.settings');
  if (savedSettings) {
    try {
      const saved = JSON.parse(savedSettings) as { master?: number; effects?: number; music?: number; reduceMotion?: boolean; damageNumbers?: boolean; screenShake?: number; textScale?: number; accessibleWarnings?: boolean; tutorialHints?: boolean };
      if (typeof saved.master === 'number') masterVolume.value = String(saved.master);
      if (typeof saved.effects === 'number') effectsVolume.value = String(saved.effects);
      if (typeof saved.music === 'number') musicVolume.value = String(saved.music);
      const settings = normalizeSettings({ reduceMotion: saved.reduceMotion, damageNumbers: saved.damageNumbers, screenShake: saved.screenShake, textScale: saved.textScale, accessibleWarnings: saved.accessibleWarnings, tutorialHints: saved.tutorialHints });
      tutorialHints.checked = settings.tutorialHints;
      reduceMotion.checked = settings.reduceMotion;
      damageNumbers.checked = settings.damageNumbers;
      accessibleWarnings.checked = settings.accessibleWarnings;
      screenShake.value = String(settings.screenShake);
      textScale.value = String(settings.textScale);
    } catch { /* Ignore malformed local settings. */ }
  }

  const previewSettings = (): void => {
    masterOutput.value = `${masterVolume.value}%`;
    effectsOutput.value = `${effectsVolume.value}%`;
    musicOutput.value = `${musicVolume.value}%`;
    musicVolume.style.setProperty('--fill', `${musicVolume.value}%`);
    // The slider track paints its filled part from this (see .setting-row input[type="range"]).
    masterVolume.style.setProperty('--fill', `${masterVolume.value}%`);
    effectsVolume.style.setProperty('--fill', `${effectsVolume.value}%`);
    document.documentElement.classList.toggle('reduce-motion', reduceMotion.checked);
    const settings: GameSettings = normalizeSettings({
      masterVolume: Number(masterVolume.value) / 100,
      effectsVolume: Number(effectsVolume.value) / 100,
      musicVolume: Number(musicVolume.value) / 100,
      reduceMotion: reduceMotion.checked,
      damageNumbers: damageNumbers.checked,
      screenShake: Number(screenShake.value),
      textScale: Number(textScale.value),
      accessibleWarnings: accessibleWarnings.checked,
      tutorialHints: tutorialHints.checked,
    });
    document.documentElement.style.setProperty('--text-scale', String(settings.textScale));
    music.updateSettings(settings);
    uiAudio.updateSettings(settings);
    document.documentElement.classList.toggle('accessible-warnings', settings.accessibleWarnings);
    for (const target of [game, lobbyGame]) {
      target.registry.set('gameSettings', settings);
      target.events.emit('game-settings', settings);
      target.sound.volume = settings.masterVolume;
    }
  };
  masterVolume.addEventListener('input', previewSettings);
  effectsVolume.addEventListener('input', previewSettings);
  musicVolume.addEventListener('input', previewSettings);
  reduceMotion.addEventListener('change', previewSettings);
  damageNumbers.addEventListener('change', previewSettings);
  accessibleWarnings.addEventListener('change', previewSettings);
  screenShake.addEventListener('change', previewSettings);
  textScale.addEventListener('change', previewSettings);
  tutorialHints.addEventListener('change', previewSettings);
  previewSettings();
  settingsDialog.addEventListener('close', () => {
    storeValue('echoes.settings', JSON.stringify({
      master: Number(masterVolume.value),
      effects: Number(effectsVolume.value),
      music: Number(musicVolume.value),
      reduceMotion: reduceMotion.checked,
      damageNumbers: damageNumbers.checked,
      screenShake: Number(screenShake.value),
      textScale: Number(textScale.value),
      accessibleWarnings: accessibleWarnings.checked,
      tutorialHints: tutorialHints.checked,
    }));
  });
  required<HTMLButtonElement>('#fullscreen-toggle').addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  });

  selectHero(selectedHero, false);
  const requestedView = new URLSearchParams(window.location.search).get('view');
  showScreen(requestedView === 'lab' || requestedView === 'lobby' ? requestedView : 'title', false);
}
