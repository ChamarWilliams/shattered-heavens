const path = require('node:path');

const [moduleDirectory, outputDirectory, browserExecutable] = process.argv.slice(2);
if (!moduleDirectory || !outputDirectory) throw new Error('Usage: node shell-smoke.cjs <node_modules> <output-directory> [browser]');
const { chromium } = require(path.join(moduleDirectory, 'playwright'));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:4173/?assets=shell-v1', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__echoesGame?.scene?.isActive('test-room'));

    // The boot screen loads the menu art, then waits for any key.
    await page.waitForSelector('#boot-prompt:not([hidden])', { timeout: 20000 });
    await page.keyboard.press('Enter');
    await page.waitForSelector('#boot-screen', { state: 'hidden' });
    const titleVisible = await page.locator('[data-screen="title"].is-active').isVisible();
    const mainMenuClean = await page.evaluate(() => !document.querySelector('.title-menu [data-action="open-credits"]')
      && !document.querySelector('.title-menu [data-action="open-lab"]'));
    await page.screenshot({ path: path.join(outputDirectory, 'realm-title-screen.png'), fullPage: true });
    await page.click('[data-action="open-lobby"]');
    await page.waitForTimeout(400);

    const lobbyVisible = await page.locator('[data-screen="lobby"].is-active').isVisible();
    const desktopInput = await page.evaluate(() => ({
      mode: document.documentElement.dataset.inputMode,
      touchControlsHidden: getComputedStyle(document.querySelector('.touch-controls')).display === 'none',
      legacyDesktopPanelRemoved: !document.querySelector('.desktop-controls'),
      hudOverlaysRoom: ['absolute', 'fixed'].includes(getComputedStyle(document.querySelector('.mobile-player-card')).position),
    }));
    await page.click('.lobby-screen [data-action="open-settings"]');
    await page.fill('#wanderer-name', 'Aster');
    await page.locator('#wanderer-name').blur();
    await page.click('#settings-dialog .confirm-button');
    const lobbyCanvas = page.locator('#lobby-game canvas');
    const lobbyBox = await lobbyCanvas.boundingBox();
    if (!lobbyBox) throw new Error('Realm Hall canvas has no bounding box.');
    const hallPoint = (x, y) => ({ x: lobbyBox.x + lobbyBox.width * x / 960, y: lobbyBox.y + lobbyBox.height * y / 540 });
    const startingLobbyHero = await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('realm-hall').controlledHero);
    const presentationState = await page.evaluate(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
      const canvas = document.querySelector('#lobby-game canvas');
      return {
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        stableViewport: document.documentElement.clientWidth === window.innerWidth,
        idleFrameRate: scene.anims.get('hall-anim:li-yunfeng:idle:S').frameRate,
        npcNamesHiddenAtRest: [...scene.npcActors.values()].every((actor) => !actor.name.visible),
      };
    });
    const highResolutionLobby = presentationState.backingWidth >= 1920 && presentationState.backingHeight >= 1080;
    const naturalIdleTiming = Math.abs(presentationState.idleFrameRate - (4 / 1.2)) < 0.01;
    await page.evaluate(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
      scene.player.setPosition(17, 268);
    });
    await page.waitForFunction(() => window.__echoesLobbyGame.scene.isActive('grand-archive'));
    const archiveWalkThroughWorks = true;
    const archiveMapWorks = await page.evaluate(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('grand-archive');
      const solidStations = [[380, 350], [580, 225], [380, 225], [580, 350]];
      const reachableApproaches = [[380, 405], [580, 275], [380, 275], [580, 405]];
      return scene.textures.exists('archive:environment')
        && scene.player.texture.key.includes('li-yunfeng')
        && Math.abs(scene.player.x - 910) < 2
        && Math.abs(scene.player.y - 270) < 2
        && scene.isWalkable(940, 270)
        && solidStations.every(([x, y]) => !scene.isWalkable(x, y))
        && reachableApproaches.every(([x, y]) => scene.isWalkable(x, y))
        && scene.isWalkable(480, 95)
        && !scene.isWalkable(480, 510);
    });
    await page.screenshot({ path: path.join(outputDirectory, 'grand-archive-map.png'), fullPage: true });
    await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('grand-archive').player.setPosition(380, 405));
    await page.waitForTimeout(80);
    await page.evaluate(() => window.__echoesLobbyGame.events.emit('lobby-interact'));
    await page.locator('#archive-dialog').waitFor({ state: 'visible', timeout: 4000 });
    await page.click('[data-archive-tab="items"]');
    const archiveWorks = await page.locator('[data-archive-panel="items"]').isVisible();
    await page.screenshot({ path: path.join(outputDirectory, 'grand-archive.png'), fullPage: true });
    await page.click('#archive-dialog .archive-footer .confirm-button');
    await page.evaluate(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('grand-archive');
      scene.player.setPosition(944, 270);
    });
    await page.waitForFunction(() => window.__echoesLobbyGame.scene.isActive('realm-hall'));
    await page.waitForTimeout(120);
    const archiveReturnPositionWorks = await page.evaluate(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
      return Math.abs(scene.player.x - 52) < 2
        && Math.abs(scene.player.y - 268) < 2
        && scene.facing === 'E';
    });
    const playerBeforeKeyboard = await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('realm-hall').player.x);
    await page.keyboard.down('d');
    await page.waitForTimeout(240);
    const walkAnimation = await page.evaluate(() => {
      const player = window.__echoesLobbyGame.scene.getScene('realm-hall').player;
      return { key: player.anims.currentAnim?.key, frame: player.anims.currentFrame?.index };
    });
    await page.waitForTimeout(80);
    await page.keyboard.up('d');
    const playerAfterKeyboard = await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('realm-hall').player.x);
    const desktopMovementWorks = playerAfterKeyboard > playerBeforeKeyboard + 15;
    const walkAnimationWorks = walkAnimation.key?.includes(':move:') && walkAnimation.frame > 0;
    const diagonalStart = await page.evaluate(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
      scene.player.setPosition(250, 260);
      window.__echoesLobbyGame.events.emit('lobby-input', { x: 1, y: 1 });
      return { x: scene.player.x, y: scene.player.y };
    });
    await page.waitForTimeout(220);
    const diagonalEnd = await page.evaluate(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
      window.__echoesLobbyGame.events.emit('lobby-input', undefined);
      return { x: scene.player.x, y: scene.player.y, animation: scene.player.anims.currentAnim?.key };
    });
    const diagonalMovementWorks = diagonalEnd.x > diagonalStart.x + 10
      && diagonalEnd.y > diagonalStart.y + 10
      && diagonalEnd.animation?.endsWith(':move:SE');
    await page.evaluate(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
      scene.player.setPosition(480, 430);
    });
    await page.keyboard.down('w');
    await page.waitForTimeout(850);
    await page.keyboard.up('w');
    const tableCollisionY = await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('realm-hall').player.y);
    const tableCollisionWorks = tableCollisionY > 358 && tableCollisionY < 370;
    const brushContourMapWorks = await page.evaluate(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
      return scene.isWalkable(350, 410)
        && scene.isWalkable(700, 430)
        && !scene.isWalkable(480, 303)
        && scene.isWalkable(480, 140)
        && scene.isWalkable(480, 92)
        && !scene.isWalkable(300, 100)
        && !scene.isWalkable(800, 160)
        && scene.isWalkable(15, 260)
        && scene.isWalkable(945, 260)
        && !scene.isWalkable(100, 370)
        && !scene.isWalkable(175, 370)
        && !scene.isWalkable(85, 450)
        && !scene.isWalkable(160, 430)
        && scene.isWalkable(235, 445)
        && !scene.isWalkable(38, 420)
        && scene.isWalkable(280, 430)
        && scene.isWalkable(46, 300)
        && scene.isWalkable(100, 495)
        && scene.isWalkable(350, 495)
        && scene.isWalkable(900, 495)
        && scene.isWalkable(350, 502)
        && !scene.isWalkable(350, 503)
        && scene.isWalkable(240, 495)
        && !scene.isWalkable(240, 520)
        && scene.isWalkable(480, 520)
        && scene.isWalkable(630, 495)
        && !scene.isWalkable(630, 520)
        && scene.isWalkable(790, 495)
        && !scene.isWalkable(790, 520)
        && !scene.isWalkable(100, 520)
        && !scene.isWalkable(900, 520)
        && scene.isWalkable(775, 450)
        && !scene.isWalkable(823, 398)
        && !scene.isWalkable(856, 382)
        && !scene.isWalkable(-1, 270)
        && !scene.isWalkable(961, 270);
    });
    // Clicking a wanderer no longer walks you over or starts a conversation.
    const clickStart = await page.evaluate(() => { const scene = window.__echoesLobbyGame.scene.getScene('realm-hall'); return { x: scene.player.x, y: scene.player.y }; });
    const reiAtStart = await page.evaluate(() => { const actor = window.__echoesLobbyGame.scene.getScene('realm-hall').npcActors.get('tsukishiro-rei'); return { x: actor.sprite.x, y: actor.sprite.y }; });
    await page.mouse.click(...Object.values(hallPoint(reiAtStart.x, reiAtStart.y)));
    await page.waitForTimeout(400);
    const safeApproachRouting = await page.evaluate((start) => { const scene = window.__echoesLobbyGame.scene.getScene('realm-hall'); return Math.hypot(scene.player.x - start.x, scene.player.y - start.y) < 1 && !scene.npcActors.get('tsukishiro-rei').talkingMs; }, clickStart);
    await page.waitForFunction(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
      return [...scene.npcActors.values()].some((actor) => actor.currentInterest
        && Math.hypot(actor.sprite.x - actor.hero.station.x, actor.sprite.y - actor.hero.station.y) > 8);
    }, null, { timeout: 6000 });
    const npcRoutineWorks = await page.evaluate(() => [...window.__echoesLobbyGame.scene.getScene('realm-hall').npcActors.values()]
      .some((actor) => Boolean(actor.currentInterest)));
    await page.waitForFunction(() => [...window.__echoesLobbyGame.scene.getScene('realm-hall').npcActors.values()]
      .some((actor) => Boolean(actor.ambientBubble?.active)), null, { timeout: 9000 });
    const contextualNpcDialogueWorks = true;
    // Walk up to an unlocked wanderer and press E: they answer in a bubble over their head, then take over.
    await page.evaluate(() => localStorage.setItem('echoes.unlockedHeroes', '["li-yunfeng","tsukishiro-rei"]'));
    await page.evaluate(() => {
      const scene = window.__echoesLobbyGame.scene.getScene('realm-hall');
      const actor = scene.npcActors.get('tsukishiro-rei');
      actor.waitMs = 1e9;
      actor.target.set(actor.sprite.x, actor.sprite.y);
      scene.player.setPosition(actor.sprite.x + 30, actor.sprite.y + 8);
    });
    // A speech bubble hides its owner's nameplate, so clear any before checking who is labelled.
    await page.evaluate(() => { for (const actor of window.__echoesLobbyGame.scene.getScene('realm-hall').npcActors.values()) { actor.ambientBubble?.destroy(true); actor.ambientBubble = undefined; } });
    await page.waitForTimeout(300);
    const speakingNameplates = await page.evaluate(() => [...window.__echoesLobbyGame.scene.getScene('realm-hall').npcActors.values()]
      .filter((actor) => actor.name.visible)
      .map((actor) => actor.hero.id));
    await page.keyboard.press('e');
    await page.waitForFunction(() => Boolean(window.__echoesLobbyGame.scene.getScene('realm-hall').npcActors.get('tsukishiro-rei')?.ambientBubble?.active), null, { timeout: 5000 });
    const dialogueName = 'Tsukishiro Rei';
    const overheadBubbleVisible = true;
    await page.screenshot({ path: path.join(outputDirectory, 'realm-lobby-dialogue.png'), fullPage: true });
    await page.waitForFunction(() => window.__echoesLobbyGame.scene.getScene('realm-hall').controlledHero === 'tsukishiro-rei', null, { timeout: 20000 });
    const overheadBubbleCleared = true;
    const selectedHero = await page.locator('.hero-card.is-selected').getAttribute('data-hero');
    const lobbySceneHero = await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('realm-hall').controlledHero);
    const selectedName = await page.locator('#party-player-name').textContent();
    const selectedHeroName = await page.locator('#party-hero-name').textContent();
    await page.screenshot({ path: path.join(outputDirectory, 'realm-lobby.png'), fullPage: true });

    // Walking into the Realm Gate starts an expedition with the hero you now control.
    await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('realm-hall').player.setPosition(480, 100));
    await page.waitForFunction(() => window.__echoesLobbyGame.scene.isActive('dungeon-run'), null, { timeout: 15000 });
    const labVisible = true;
    const gameplayHero = await page.evaluate(() => window.__echoesLobbyGame.scene.getScene('dungeon-run').heroId);
    const persistence = await page.evaluate(() => ({
      name: localStorage.getItem('echoes.wandererName'),
      hero: localStorage.getItem('echoes.selectedHero'),
    }));
    await page.screenshot({ path: path.join(outputDirectory, 'realm-training-entry.png'), fullPage: true });

    const mobileContext = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('http://127.0.0.1:4173/?view=lobby&assets=shell-mobile-v1', { waitUntil: 'networkidle' });
    await mobilePage.waitForFunction(() => window.__echoesLobbyGame?.scene?.isActive('realm-hall'));
    await mobilePage.waitForTimeout(250);
    const mobileState = await mobilePage.evaluate(() => ({
      hero: window.__echoesLobbyGame.scene.getScene('realm-hall').controlledHero,
      inputMode: document.documentElement.dataset.inputMode,
      touchControlsVisible: getComputedStyle(document.querySelector('.touch-controls')).display !== 'none',
      legacyDesktopPanelRemoved: !document.querySelector('.desktop-controls'),
      fitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1
        && document.documentElement.scrollHeight <= window.innerHeight + 1,
    }));
    await mobilePage.screenshot({ path: path.join(outputDirectory, 'realm-lobby-mobile.png'), fullPage: true });
    await mobileContext.close();

    const passed = titleVisible
      && mainMenuClean
      && lobbyVisible
      && desktopInput.mode === 'desktop'
      && desktopInput.touchControlsHidden === true
      && desktopInput.legacyDesktopPanelRemoved === true
      && desktopInput.hudOverlaysRoom === true
      && desktopMovementWorks === true
      && diagonalMovementWorks === true
      && walkAnimationWorks === true
      && tableCollisionWorks === true
      && brushContourMapWorks === true
      && safeApproachRouting === true
      && npcRoutineWorks === true
      && contextualNpcDialogueWorks === true
      && presentationState.stableViewport === true
      && highResolutionLobby === true
      && naturalIdleTiming === true
      && presentationState.npcNamesHiddenAtRest === true
      && archiveWalkThroughWorks === true
      && archiveMapWorks === true
      && archiveWorks === true
      && archiveReturnPositionWorks === true
      && startingLobbyHero === 'li-yunfeng'
      && dialogueName === 'Tsukishiro Rei'
      && overheadBubbleVisible === true
      && speakingNameplates.length === 1
      && speakingNameplates[0] === 'tsukishiro-rei'
      && overheadBubbleCleared === true
      && selectedHero === 'tsukishiro-rei'
      && lobbySceneHero === 'tsukishiro-rei'
      && selectedName === 'Aster'
      && selectedHeroName === 'Tsukishiro Rei'
      && labVisible
      && gameplayHero === 'tsukishiro-rei'
      && persistence.name === 'Aster'
      && persistence.hero === 'tsukishiro-rei'
      && mobileState.hero === 'li-yunfeng'
      && mobileState.inputMode === 'touch'
      && mobileState.touchControlsVisible === true
      && mobileState.legacyDesktopPanelRemoved === true
      && mobileState.fitsViewport === true
      && errors.length === 0;
    console.log(JSON.stringify({ passed, titleVisible, mainMenuClean, lobbyVisible, presentationState, highResolutionLobby, naturalIdleTiming, archiveWalkThroughWorks, archiveMapWorks, archiveWorks, archiveReturnPositionWorks, desktopInput, desktopMovementWorks, diagonalMovementWorks, walkAnimation, walkAnimationWorks, tableCollisionY, tableCollisionWorks, brushContourMapWorks, safeApproachRouting, npcRoutineWorks, contextualNpcDialogueWorks, startingLobbyHero, dialogueName, overheadBubbleVisible, speakingNameplates, overheadBubbleCleared, selectedHero, lobbySceneHero, selectedName, selectedHeroName, labVisible, gameplayHero, persistence, mobileState, errors }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
