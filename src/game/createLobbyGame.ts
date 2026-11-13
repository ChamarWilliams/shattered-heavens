import Phaser from 'phaser';
import { ArchiveScene } from './ArchiveScene';
import { DungeonRunScene } from './DungeonRunScene';
import { LobbyScene } from './LobbyScene';

export function createLobbyGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'lobby-game',
    width: 1920,
    height: 1080,
    backgroundColor: '#050a09',
    pixelArt: false,
    roundPixels: false,
    scene: [LobbyScene, ArchiveScene, DungeonRunScene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, antialiasGL: true, roundPixels: false },
  });
}
