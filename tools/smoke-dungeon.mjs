import { chromium } from 'file:///C:/Users/Chamar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

await page.goto('http://127.0.0.1:4173/?assets=finished-run-v1&view=lobby', { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__echoesLobbyGame));
await page.evaluate(() => {
  const game = window.__echoesLobbyGame;
  game.registry.set('selectedHero', 'li-yunfeng');
  game.scene.start('dungeon-run');
});
await page.waitForFunction(() => window.__echoesLobbyGame.scene.isActive('dungeon-run'));
await page.waitForTimeout(1800);
const movementStart = await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  scene.hero.setPosition(480, 330);
  scene.movement = { x: 1, y: -1 };
  return { x: scene.hero.x, y: scene.hero.y };
});
// Wait for the movement itself rather than a fixed time, so a slow software renderer cannot fail it.
await page.waitForFunction(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  return Math.hypot(scene.hero.x - 480, scene.hero.y - 330) >= 30;
}, null, { timeout: 8000 }).catch(() => {});
const movementEnd = await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  scene.movement = undefined;
  return { x: scene.hero.x, y: scene.hero.y };
});
await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  scene.hero.setPosition(178, 270);
  scene.movement = { x: 1, y: 0 };
});
await page.waitForFunction(() => window.__echoesLobbyGame.scene.getScene('dungeon-run').hero.x > 190, null, { timeout: 8000 }).catch(() => {});
const recoveredX = await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  scene.movement = undefined;
  return scene.hero.x;
});
await page.screenshot({ path: 'artifacts/finished-run-v1.png', fullPage: true });
await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  const room = scene.dungeon.rooms.find((candidate) => candidate.kind === 'combat');
  if (room) scene.enterRoom(room, 'S');
});
const enemyFrameA = await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('dungeon-run').enemies[0]?.sprite.frame.name);
await page.waitForTimeout(420);
const enemyFrameB = await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('dungeon-run').enemies[0]?.sprite.frame.name);
await page.waitForFunction(() => window.__echoesLobbyGame.scene.getScene('dungeon-run').projectiles.some((projectile) => projectile.hostile), { timeout: 8000 });
const hostileProjectileTexture = await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('dungeon-run').projectiles.find((projectile) => projectile.hostile)?.view.texture.key);
await page.waitForTimeout(120);
await page.screenshot({ path: 'artifacts/finished-run-v1-combat.png', fullPage: true });
for (let themeIndex = 0; themeIndex < 3; themeIndex += 1) {
  await page.evaluate((index) => {
    const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
    if (scene.themeIndex !== index) scene.startTheme(index);
    const bossRoom = scene.dungeon.rooms.find((candidate) => candidate.kind === 'boss');
    scene.enterRoom(bossRoom, 'S');
  }, themeIndex);
  if (themeIndex === 0) {
    await page.waitForFunction(() => window.__echoesLobbyGame.scene.getScene('dungeon-run').projectiles.some((projectile) => projectile.hostile), { timeout: 8000 });
    await page.waitForTimeout(260);
    await page.screenshot({ path: 'artifacts/dungeon-combat-v3-boss.png', fullPage: true });
  }
  await page.evaluate(() => {
    const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
    for (const enemy of [...scene.enemies]) scene.damageEnemy(enemy, 99999);
    scene.updateRoomState();
  });
  await page.waitForTimeout(120);
  // The final realm's echo ends the run in victory (as the portal does) instead of advancing.
  await page.evaluate((index) => {
    const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
    if (index < 2) scene.advanceTheme(); else scene.endRun(true);
  }, themeIndex);
  await page.waitForTimeout(120);
}
await page.screenshot({ path: 'artifacts/finished-run-v1-victory.png', fullPage: true });
const stateBase = await page.evaluate(() => ({
  active: window.__echoesLobbyGame.scene.isActive('dungeon-run'),
  mode: document.body.classList.contains('is-dungeon-run'),
  canvasCount: document.querySelectorAll('canvas').length,
  hud: (() => {
    const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
    return { summary: scene.hud?.summary };
  })(),
  victory: window.__echoesLobbyGame.scene.getScene('dungeon-run').runEnded,
  heroTexture: window.__echoesLobbyGame.scene.getScene('dungeon-run').hero?.sprite?.texture?.key,
}));
const diagonalDistance = Math.hypot(movementEnd.x - movementStart.x, movementEnd.y - movementStart.y);
const state = { ...stateBase, enemyAnimationFrames: [enemyFrameA, enemyFrameB], diagonalDistance, recoveredX, hostileProjectileTexture };
console.log(JSON.stringify({ state, errors }, null, 2));
await browser.close();
if (errors.length > 0 || !state.active || !state.mode || !state.victory || !String(state.heroTexture).startsWith('hero:') || enemyFrameA === enemyFrameB || diagonalDistance < 30 || recoveredX <= 190 || !String(hostileProjectileTexture).startsWith('enemy-projectile:')) process.exitCode = 1;
