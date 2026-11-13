import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { characters } from '../src/characters/registry';
import type { CharacterAssetManifest } from '../src/characters/types';
import { validateManifest } from '../src/characters/validateManifest';

describe('generated character manifests', () => {
  for (const character of characters) {
    it(`validates ${character.displayName}`, () => {
      const path = resolve(`public/assets/characters/${character.id}/${character.id}.character.json`);
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as CharacterAssetManifest;
      expect(validateManifest(character, manifest)).toEqual([]);
      expect(manifest.frames).toHaveLength(32);
      if (character.id === 'li-yunfeng') {
        const idleFrames = manifest.frames.filter((frame) => frame.name.startsWith('idle-'));
        expect(idleFrames.map((frame) => [frame.pivotX, frame.pivotY])).toEqual([
          [200, 319], [200, 319], [200, 319], [200, 319],
        ]);
      }
    });
  }
});
