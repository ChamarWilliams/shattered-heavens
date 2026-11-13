import Phaser from 'phaser';
import { TestRoomScene } from './TestRoomScene';
import { ViewerScene } from './ViewerScene';

export function createGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 700,
    height: 470,
    backgroundColor: '#111611',
    pixelArt: true,
    roundPixels: true,
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [TestRoomScene, ViewerScene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: false },
  });
}
