import Phaser from 'phaser';
import { heroFrameCount, type PackHeroId } from '../assets/gameplayManifest';
import { getCharacter } from '../characters/registry';
import { CharacterView } from './CharacterView';
import { gameEvents, viewerSelection } from './events';

export class ViewerScene extends Phaser.Scene {
  private view!: CharacterView;
  private elapsed = 0;
  private revision = 0;
  private currentCharacterId = '';

  constructor() { super('viewer'); }

  create(): void {
    this.cameras.main.setViewport(472, 64, 202, 134);
    this.cameras.main.setBackgroundColor('#181d18');
    this.rebuild();
  }

  update(_time: number, delta: number): void {
    if (this.revision !== viewerSelection.revision || this.currentCharacterId !== viewerSelection.characterId) {
      this.revision = viewerSelection.revision;
      this.elapsed = 0;
      if (this.currentCharacterId !== viewerSelection.characterId) this.rebuild();
    }
    if (viewerSelection.playing) this.elapsed += delta * viewerSelection.speed;
    const config = getCharacter(viewerSelection.characterId);
    const animation = config.animations[viewerSelection.state];
    const cycle = animation.loop ? this.elapsed % animation.durationMs : Math.min(this.elapsed, animation.durationMs - 1);
    const progress = cycle / animation.durationMs;
    const renderFrameCount = config.asset.packId
      ? heroFrameCount(config.asset.packId as PackHeroId, viewerSelection.state)
      : animation.frames.length;
    const frameIndex = Math.min(renderFrameCount - 1, Math.floor(progress * renderFrameCount));
    this.view.setPosition(101, 82);
    this.view.render(viewerSelection.state, viewerSelection.direction, progress, frameIndex);
    gameEvents.emit('viewer-frame', frameIndex, renderFrameCount);
  }

  private rebuild(): void {
    this.view?.destroy(true);
    const config = getCharacter(viewerSelection.characterId);
    this.currentCharacterId = config.id;
    this.view = new CharacterView(this, config, 101, 82, 'inspection').setScale(1.25);
  }
}
