import Phaser from 'phaser';
import type { CharacterState } from '../characters/types';
import type { Direction8 } from '../characters/directions';

export const gameEvents = new Phaser.Events.EventEmitter();

export interface ViewerSelection {
  characterId: string;
  state: CharacterState;
  direction: Direction8;
  speed: number;
  playing: boolean;
  revision: number;
}

export const viewerSelection: ViewerSelection = {
  characterId: 'li-yunfeng',
  state: 'idle',
  direction: 'S',
  speed: 1,
  playing: true,
  revision: 0,
};
