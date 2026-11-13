import { liYunfeng } from './config/liYunfeng';
import { seoJiwon } from './config/seoJiwon';
import { tsukishiroRei } from './config/tsukishiroRei';
import type { CharacterConfig } from './types';

export const characters = [liYunfeng, seoJiwon, tsukishiroRei] as const;

export function getCharacter(id: string): CharacterConfig {
  return characters.find((character) => character.id === id) ?? liYunfeng;
}
