import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const targets = [
  'assets/source',
  'assets/environments/grand-archive-v1.png',
  'assets/environments/grand-archive-v2.png',
  'assets/environments/grand-archive-v3.png',
  ...['sectless-temple', 'nightfold-crypt', 'foxfire-shrine'].flatMap((theme) => [
    `assets/dungeons/${theme}/room-v2.png`,
    `assets/dungeons/${theme}/room-v3.png`,
    `assets/dungeons/${theme}/source-kit-v1.png`,
    `assets/dungeons/${theme}/tiles-v1.png`,
    `assets/dungeons/${theme}/enemies-v1.png`,
    `assets/dungeons/${theme}/enemies-animated-v2.png`,
    `assets/dungeons/${theme}/enemy-projectile-v3.png`,
    `assets/dungeons/${theme}/closure-N-v4.png`,
    `assets/dungeons/${theme}/closure-E-v4.png`,
    `assets/dungeons/${theme}/closure-S-v4.png`,
    `assets/dungeons/${theme}/closure-W-v4.png`,
  ]),
];

await Promise.all(targets.map((target) => rm(resolve(dist, target), { recursive: true, force: true })));
