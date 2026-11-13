import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_HINTS, CONTROL_LABELS, PRACTICE_DONE, PRACTICE_STEPS, TIPS, renderHint, sanitizeTutorial, shouldShow } from '../src/domain/tutorial';
import { defaultMeta } from '../src/domain/metaProgress';

const sources = (dir: string): string => readdirSync(dir).map((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? readFileSync(path, 'utf8') : '';
}).join('\n');

describe('tutorial', () => {
  it('has unique ids and only known control tokens', () => {
    expect(new Set(ALL_HINTS.map((hint) => hint.id)).size).toBe(ALL_HINTS.length);
    for (const hint of ALL_HINTS) {
      for (const [, token] of hint.text.matchAll(/\{(\w+)\}/g)) expect(Object.keys(CONTROL_LABELS.desktop)).toContain(token);
    }
  });

  it('names the right control for keyboard and touch', () => {
    expect(renderHint('Move with {move}.', 'desktop')).toEqual([{ text: 'Move with ' }, { key: 'WASD' }, { text: '.' }]);
    expect(renderHint('Press {interact} to buy', 'touch')).toEqual([{ text: 'Press ' }, { key: 'USE' }, { text: ' to buy' }]);
  });

  it('runs the practice in order: move, attack, ability, dodge, leave', () => {
    expect(PRACTICE_STEPS.map((hint) => hint.id)).toEqual(['practice-move', 'practice-attack', 'practice-ability', 'practice-dodge', 'practice-leave']);
    expect(PRACTICE_STEPS.every((hint) => hint.kind === 'step')).toBe(true);
  });

  it('shows each hint once, and never when hints are off', () => {
    expect(shouldShow('chest', [], true)).toBe(true);
    expect(shouldShow('chest', ['chest'], true)).toBe(false);
    expect(shouldShow('chest', [], false)).toBe(false);
    expect(shouldShow('not-a-hint', [], true)).toBe(false);
  });

  it('keeps only known ids when loading a save', () => {
    expect(sanitizeTutorial(['chest', 'chest', 'bogus', 3, PRACTICE_DONE])).toEqual(['chest', PRACTICE_DONE]);
    expect(sanitizeTutorial(undefined)).toEqual([]);
    expect(defaultMeta().tutorial).toEqual([]);
  });

  it('asks for every tip somewhere in the game', () => {
    const code = sources(join(__dirname, '..', 'src', 'game'));
    for (const tip of TIPS) expect(code, tip.id).toMatch(new RegExp(`hint\\((?:'${tip.id}'|feature)|'${tip.id}'`));
  });
});
