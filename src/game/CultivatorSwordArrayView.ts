import Phaser from 'phaser';
import { effectTextureKey } from '../assets/gameplayManifest';
import { direction8FromAngle, type Direction8 } from '../characters/directions';
import type { CharacterState } from '../characters/types';

const RACK_SWORD_ROTATION = -Math.PI / 2;

export class CultivatorSwordArrayView {
  private readonly sprites: Phaser.GameObjects.Sprite[];
  private previousState: CharacterState = 'idle';
  private rackDirection: Direction8 = 'S';

  constructor(private readonly scene: Phaser.Scene) {
    this.sprites = Array.from({ length: 4 }, () => this.scene.add.sprite(0, 0, effectTextureKey('flying_sword'), 0)
      .setOrigin(0.5)
      .setScale(0.36)
      .setBlendMode(Phaser.BlendModes.ADD));
  }

  sync(
    owner: { readonly x: number; readonly y: number },
    state: CharacterState,
    elapsedMs: number,
    durationMs: number,
    movementDirection: Direction8,
    aimRadians: number,
    releaseNormalizedTime: number,
  ): void {
    if (state === 'idle' || state === 'move') this.rackDirection = movementDirection;
    else if (state !== this.previousState && (state === 'attack' || state === 'ability')) {
      this.rackDirection = direction8FromAngle(aimRadians);
    }
    this.previousState = state;
    const rackAngle = this.directionAngle(this.rackDirection);
    const releaseMs = durationMs * releaseNormalizedTime;
    for (let index = 0; index < this.sprites.length; index++) {
      const sprite = this.sprites[index];
      const rack = this.rackPosition(owner, this.rackDirection, index);
      let target = rack;
      let visible = state !== 'death';
      let depth = this.rackDepth(this.rackDirection, rack.y);

      if (state === 'ability') {
        if (elapsedMs >= releaseMs) {
          visible = false;
        } else {
          const gather = Phaser.Math.Easing.Cubic.Out(Phaser.Math.Clamp(elapsedMs / Math.max(1, releaseMs * 0.62), 0, 1));
          const orbit = elapsedMs * 0.009 + index * Math.PI / 2;
          const formation = {
            x: owner.x + Math.cos(rackAngle) * 32 + Math.cos(orbit) * 28,
            y: owner.y + Math.sin(rackAngle) * 24 - 14 + Math.sin(orbit) * 17,
            rotation: RACK_SWORD_ROTATION,
          };
          target = {
            x: Phaser.Math.Linear(rack.x, formation.x, gather),
            y: Phaser.Math.Linear(rack.y, formation.y, gather),
            rotation: Phaser.Math.Angle.RotateTo(rack.rotation, formation.rotation, gather * Math.PI),
          };
          depth = 12 + target.y / 1000;
        }
      }

      sprite
        .setVisible(visible)
        .setPosition(target.x, target.y)
        .setRotation(target.rotation)
        .setDepth(depth)
        .setAlpha(state === 'hurt' ? 0.48 : 0.88);
    }
  }

  clear(): void {
    for (const sprite of this.sprites) sprite.destroy();
  }

  private rackPosition(owner: { readonly x: number; readonly y: number }, direction: Direction8, index: number) {
    const offset = index - 1.5;
    const layout = {
      N: { centerX: 0, centerY: 12, spacing: 7 },
      NE: { centerX: -3, centerY: 10, spacing: 6 },
      E: { centerX: -5, centerY: 6, spacing: 5 },
      SE: { centerX: -3, centerY: 7, spacing: 6 },
      S: { centerX: 0, centerY: 7, spacing: 7 },
      SW: { centerX: 3, centerY: 7, spacing: 6 },
      W: { centerX: 5, centerY: 6, spacing: 5 },
      NW: { centerX: 3, centerY: 10, spacing: 6 },
    }[direction];
    return {
      x: owner.x + layout.centerX + offset * layout.spacing,
      y: owner.y + layout.centerY,
      rotation: RACK_SWORD_ROTATION,
    };
  }

  private rackDepth(direction: Direction8, y: number): number {
    // When Yunfeng faces north, his back faces the camera and the mounted
    // swords must render over his torso. Facing south exposes his front, so
    // the same rack belongs underneath the character art.
    const visibleBack = direction === 'N' || direction === 'NE' || direction === 'NW';
    return (visibleBack ? 11 : 9) + y / 1000;
  }

  private directionAngle(direction: Direction8): number {
    return {
      E: 0,
      SE: Math.PI / 4,
      S: Math.PI / 2,
      SW: Math.PI * 3 / 4,
      W: Math.PI,
      NW: -Math.PI * 3 / 4,
      N: -Math.PI / 2,
      NE: -Math.PI / 4,
    }[direction];
  }
}
