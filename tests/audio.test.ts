import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSIC, SFX } from '../src/game/audioManifest';
import { buildAudioIndex } from '../src/game/audioLibrary';

describe('audio', () => {
  it('lists every sound in the audio brief', () => {
    const brief = readFileSync(new URL('../docs/AUDIO_BRIEF.md', import.meta.url), 'utf8');
    for (const id of Object.keys(SFX)) expect(brief).toContain(`\`sfx/${id}\``);
    for (const id of Object.keys(MUSIC)) expect(brief).toContain(`\`music/${id}\``);
  });

  it('gives every sound a sensible length', () => {
    for (const spec of [...Object.values(SFX), ...Object.values(MUSIC)]) {
      expect(spec.seconds[0]).toBeGreaterThan(0);
      expect(spec.seconds[1]).toBeGreaterThanOrEqual(spec.seconds[0]);
    }
  });

  it('finds dropped files, groups takes and picks a format the browser plays', () => {
    const index = buildAudioIndex({
      '../assets/audio/sfx/hit.ogg': '/hit.ogg',
      '../assets/audio/sfx/hit.m4a': '/hit.m4a',
      '../assets/audio/sfx/hit-2.ogg': '/hit-2.ogg',
      '../assets/audio/sfx/hit-2.m4a': '/hit-2.m4a',
      '../assets/audio/music/sting-death.mp3': '/sting-death.mp3',
      '../assets/audio/music/realm-sectless.ogg': '/realm.ogg',
      '../assets/audio/README.md': '/readme',
    }, (mime) => !mime.includes('ogg'));
    expect(index.sfx.get('hit')?.takes).toEqual(['/hit.m4a', '/hit-2.m4a']);
    expect(index.music.get('sting-death')?.takes).toEqual(['/sting-death.mp3']);
    // An .ogg-only track is skipped where .ogg cannot play.
    expect(index.music.has('realm-sectless')).toBe(false);
  });
});
