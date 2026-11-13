import { chromium } from 'file:///C:/Users/Chamar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

await page.goto('http://127.0.0.1:4173/?assets=doorways-v4&view=lobby', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__echoesLobbyGame?.scene?.isActive('realm-hall'));

const lobbyBefore = await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
  // The hall has no floating prompts any more; nothing to read here.
  return { archiveGlowRemoved: scene.archiveGlow === undefined, promptRemoved: scene.interactionText === undefined };
});
await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('realm-hall').player.setPosition(17, 268));
await page.waitForFunction(() => window.__echoesLobbyGame.scene.isActive('grand-archive'));

const archive = await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('grand-archive');
  return {
    texture: scene.children.list.find((child) => child.texture?.key === 'archive:environment')?.texture.key,
    spawn: { x: scene.player.x, y: scene.player.y },
    rightDoorOpen: scene.isWalkable(940, 270),
    unusedBottomClosed: !scene.isWalkable(480, 510),
    exitPromptRemoved: scene.prompt === undefined,
  };
});
await page.screenshot({ path: 'artifacts/archive-v4-walkthrough.png', fullPage: true });

await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('grand-archive').player.setPosition(944, 270));
await page.waitForFunction(() => window.__echoesLobbyGame.scene.isActive('realm-hall'));
const lobbyReturn = await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
  return { x: scene.player.x, y: scene.player.y, facing: scene.facing, archivePromptAbsent: scene.interactionText === undefined };
});

await page.evaluate(() => {
  const game = window.__echoesLobbyGame;
  game.registry.set('selectedHero', 'li-yunfeng');
  game.scene.start('dungeon-run');
});
await page.waitForFunction(() => window.__echoesLobbyGame.scene.isActive('dungeon-run'));
await page.waitForTimeout(500);

const startRoom = await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  const bits = [1, 2, 4, 8];
  const connections = bits.filter((bit) => (scene.currentRoom.doorMask & bit) !== 0).length;
  return {
    connections,
    doorMask: scene.currentRoom.doorMask,
    texture: scene.roomBackground.texture.key,
    runtimeClosuresRemoved: scene.roomClosures === undefined,
    overlayCommands: scene.roomGraphics.commandBuffer?.length ?? 0,
  };
});

await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  const room = scene.dungeon.rooms.find((candidate) => candidate.kind === 'combat');
  scene.enterRoom(room, 'S');
});
await page.waitForTimeout(200);
const sealedRoom = await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  return { doorMask: scene.currentRoom.doorMask, texture: scene.roomBackground.texture.key, roomId: scene.currentRoom.id };
});
await page.screenshot({ path: 'artifacts/dungeon-v5-static-room.png', fullPage: true });

const openedRoom = await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  for (const enemy of [...scene.enemies]) scene.damageEnemy(enemy, 99999);
  scene.updateRoomState();
  const bits = [1, 2, 4, 8];
  const connections = bits.filter((bit) => (scene.currentRoom.doorMask & bit) !== 0).length;
  return { connections, doorMask: scene.currentRoom.doorMask, texture: scene.roomBackground.texture.key, roomId: scene.currentRoom.id };
});
await page.waitForTimeout(450);
await page.screenshot({ path: 'artifacts/dungeon-v5-cleared-room.png', fullPage: true });

const dungeonWalkThrough = await page.evaluate(() => {
  const scene = window.__echoesLobbyGame.scene.getScene('dungeon-run');
  const previousRoom = scene.currentRoom.id;
  scene.transitionLockedMs = 0;
  const mask = scene.currentRoom.doorMask;
  // Step into the doorway at the room's current scale.
  const bounds = scene.roomBounds;
  if (mask & 1) scene.hero.setPosition(480, bounds.top + 12);
  else if (mask & 2) scene.hero.setPosition(bounds.right - 12, 270);
  else if (mask & 4) scene.hero.setPosition(480, bounds.bottom - 22);
  else scene.hero.setPosition(bounds.left + 12, 270);
  scene.constrainOrTransition();
  return scene.currentRoom.id !== previousRoom;
});

const state = { lobbyBefore, archive, lobbyReturn, startRoom, sealedRoom, openedRoom, dungeonWalkThrough, errors };
console.log(JSON.stringify(state, null, 2));
await browser.close();

const passed = lobbyBefore.archiveGlowRemoved
  && archive.texture === 'archive:environment'
  && archive.spawn.x === 910
  && archive.rightDoorOpen
  && archive.unusedBottomClosed
  && archive.exitPromptRemoved
  && lobbyReturn.x === 52
  && lobbyReturn.archivePromptAbsent
  && startRoom.texture.endsWith(`:${String(startRoom.doorMask).padStart(2, '0')}`)
  && startRoom.runtimeClosuresRemoved
  && startRoom.overlayCommands === 0
  && sealedRoom.texture === openedRoom.texture
  && sealedRoom.doorMask === openedRoom.doorMask
  && dungeonWalkThrough
  && errors.length === 0;
if (!passed) process.exitCode = 1;
