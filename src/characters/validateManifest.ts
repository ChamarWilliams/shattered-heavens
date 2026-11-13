import { CHARACTER_STATES, type CharacterAssetManifest, type CharacterConfig } from './types';

export function validateManifest(config: CharacterConfig, manifest: CharacterAssetManifest): string[] {
  const errors: string[] = [];
  if (!manifest.image.toLowerCase().endsWith('.png')) errors.push('Asset image must be a PNG.');
  if (!manifest.alphaRequired) errors.push('Asset must require alpha transparency.');
  if (!manifest.validation.approved) errors.push('Asset validation is not approved.');

  const names = new Set<string>();
  for (const frame of manifest.frames) {
    if (names.has(frame.name)) errors.push(`Duplicate frame name: ${frame.name}`);
    names.add(frame.name);
    if (frame.width <= 0 || frame.height <= 0) errors.push(`Invalid bounds: ${frame.name}`);
  }

  for (const state of CHARACTER_STATES) {
    for (const frame of config.animations[state].frames) {
      if (!names.has(frame)) errors.push(`Missing ${state} frame: ${frame}`);
    }
  }
  return errors;
}
