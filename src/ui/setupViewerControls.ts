import { characters } from '../characters/registry';
import { DIRECTIONS_8, type Direction8 } from '../characters/directions';
import { CHARACTER_STATES, type CharacterState } from '../characters/types';
import { gameplayManifest, packActionForState, type PackHeroId } from '../assets/gameplayManifest';
import type { ActorSnapshot } from '../domain/CharacterActor';
import { gameEvents, viewerSelection } from '../game/events';

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
}

export function setupViewerControls(): void {
  const character = required<HTMLSelectElement>('character-select');
  const animation = required<HTMLSelectElement>('animation-select');
  const direction = required<HTMLSelectElement>('direction-select');
  const speed = required<HTMLInputElement>('speed-range');
  const speedOutput = required<HTMLOutputElement>('speed-output');
  const play = required<HTMLButtonElement>('play-toggle');
  const restart = required<HTMLButtonElement>('restart-animation');

  for (const entry of characters) character.add(new Option(`${entry.displayName} — ${entry.epithet}`, entry.id));
  for (const state of CHARACTER_STATES) animation.add(new Option(state.toUpperCase(), state));
  for (const facing of DIRECTIONS_8) direction.add(new Option(facing, facing));

  const updateDirectionSource = () => {
    const config = characters.find((entry) => entry.id === character.value) ?? characters[0];
    const packId = config.asset.packId as PackHeroId;
    const definition = gameplayManifest.heroes[packId][packActionForState(animation.value as CharacterState)].directions[direction.value as Direction8];
    required('direction-source-readout').textContent = definition.authenticDirectionalArtwork
      ? 'BESPOKE 8-WAY'
      : definition.source.includes('mirrored') ? 'MIRRORED FALLBACK' : 'REUSED FALLBACK';
  };

  character.addEventListener('change', () => { viewerSelection.characterId = character.value; viewerSelection.revision += 1; updateDirectionSource(); gameEvents.emit('playable-character-change', character.value); });
  animation.addEventListener('change', () => { viewerSelection.state = animation.value as CharacterState; viewerSelection.revision += 1; updateDirectionSource(); });
  direction.addEventListener('change', () => { viewerSelection.direction = direction.value as Direction8; viewerSelection.revision += 1; updateDirectionSource(); });
  speed.addEventListener('input', () => {
    viewerSelection.speed = Number(speed.value);
    speedOutput.value = `${viewerSelection.speed.toFixed(2)}×`;
  });
  play.addEventListener('click', () => {
    viewerSelection.playing = !viewerSelection.playing;
    play.textContent = viewerSelection.playing ? 'Pause' : 'Play';
  });
  restart.addEventListener('click', () => { viewerSelection.revision += 1; });

  gameEvents.on('viewer-frame', (index: number, total: number) => {
    required('frame-readout').textContent = `FRAME ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  });
  gameEvents.on('actor-update', (snapshot: ActorSnapshot) => {
    required('state-readout').textContent = snapshot.state.toUpperCase();
    required('facing-readout').textContent = snapshot.orientation.facingDirection;
    required('movement-readout').textContent = snapshot.orientation.movementDirection;
    const actorConfig = characters.find((entry) => entry.id === snapshot.characterId) ?? characters[0];
    const actorPackId = actorConfig.asset.packId as PackHeroId;
    required('asset-readout').textContent = gameplayManifest.heroes[actorPackId].idle.directions.S.authenticDirectionalArtwork
      ? 'PREMIUM 8-WAY'
      : 'CURATED SAFE';
  });
  gameEvents.on('projectile-update', (telemetry: { active: number; aimDegrees: number; totalDamage: number }) => {
    required('projectile-readout').textContent = String(telemetry.active);
    required('aim-readout').textContent = `${Math.round(telemetry.aimDegrees)}°`;
    required('damage-readout').textContent = String(telemetry.totalDamage);
  });
  gameEvents.on('combat-status', (status: { summons: number; seals: number; moonfire: number }) => {
    required('summon-readout').textContent = String(status.summons);
    required('seal-readout').textContent = String(status.seals);
    required('moonfire-readout').textContent = String(status.moonfire);
  });
  updateDirectionSource();
}
