import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETIRED_TERMS } from '../src/domain/lexicon';

const ROOT = join(__dirname, '..');
const walk = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

describe('vocabulary', () => {
  it('keeps retired names out of the source, styles and page', () => {
    const files = [...walk(join(ROOT, 'src')).filter((file) => /\.(ts|css)$/.test(file) && !file.endsWith('lexicon.ts')), join(ROOT, 'index.html')];
    const offences: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const pattern of RETIRED_TERMS) if (pattern.test(line)) offences.push(`${relative(ROOT, file)}:${index + 1} matches ${pattern}`);
      });
    }
    expect(offences).toEqual([]);
  });
});
