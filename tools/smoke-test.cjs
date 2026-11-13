const path = require('node:path');

const [moduleDirectory, screenshotPath, browserExecutable] = process.argv.slice(2);
if (!moduleDirectory || !screenshotPath) throw new Error('Usage: node smoke-test.cjs <node_modules> <screenshot-path> [browser]');
const { chromium } = require(path.join(moduleDirectory, 'playwright'));
const liScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-li-projectiles$1');
const meleeScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-melee-hitbox$1');
const idleScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-li-idle-v3$1');
const moveScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-li-move-v3$1');
const upRackScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-li-up-rack$1');
const sealScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-li-sectless-seals$1');
const reiSummonScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-rei-summons$1');
const seoEchoScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-seo-nightfold-echo$1');
const seoAttackScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-seo-void-shear$1');
const seoDeathScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-seo-death-shadow$1');
const seoMoveScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-seo-move-v5$1');
const reiMoveScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-rei-move-v5$1');
const reiMoonfireScreenshotPath = screenshotPath.replace(/(\.[^.]+)$/, '-rei-moonfire-halo$1');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  try {
    await page.goto('http://127.0.0.1:4173/?view=lab&assets=polish-v5', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__echoesGame?.scene?.isActive('test-room'));
    await page.waitForTimeout(500);
    const canvas = page.locator('#game canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Game canvas has no bounding box.');
    const gamePoint = (x, y) => ({ x: box.x + box.width * x / 700, y: box.y + box.height * y / 470 });
    const roomSnapshot = () => page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      return {
        characterId: scene.config.id,
        x: scene.view.x,
        y: scene.view.y,
        projectiles: scene.projectileSystem?.snapshots?.() ?? [],
        basicProjectiles: scene.basicProjectileSystem?.snapshots?.() ?? [],
        summonProjectiles: scene.summonProjectileSystem?.snapshots?.() ?? [],
        summons: scene.summonSystem?.snapshots?.() ?? [],
        echo: scene.echoSystem?.update?.(0) ?? null,
        seals: scene.sealSystem?.snapshots?.() ?? [],
        totalDamage: scene.totalDamage,
      };
    });

    const viewerChecks = [];
    for (const hero of ['li-yunfeng', 'seo-jiwon', 'tsukishiro-rei']) {
      await page.selectOption('#character-select', hero);
      for (const state of ['idle', 'move', 'attack', 'ability', 'hurt', 'death']) {
        await page.selectOption('#animation-select', state);
        for (const direction of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
          await page.selectOption('#direction-select', direction);
          viewerChecks.push({ hero, state, direction, source: await page.locator('#direction-source-readout').textContent() });
        }
      }
    }

    await page.selectOption('#character-select', 'li-yunfeng');
    await page.selectOption('#animation-select', 'idle');
    await page.selectOption('#direction-select', 'S');
    await page.waitForTimeout(360);
    await page.screenshot({ path: idleScreenshotPath, fullPage: true });
    await page.keyboard.down('w');
    await page.waitForTimeout(180);
    await page.keyboard.up('w');
    await page.waitForTimeout(80);
    const liUpRack = await page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      const swords = scene.cultivatorSwordView?.sprites ?? [];
      return {
        direction: scene.cultivatorSwordView?.rackDirection,
        visible: swords.filter((sprite) => sprite.visible).length,
        allInFrontOfCharacter: swords.every((sprite) => sprite.depth > scene.view.depth),
        allSameScale: swords.every((sprite) => Math.abs(sprite.scaleX - 0.36) < 0.001 && Math.abs(sprite.scaleY - 0.36) < 0.001),
        maximumHorizontalOffset: Math.max(...swords.map((sprite) => Math.abs(sprite.x - scene.view.x))),
      };
    });
    await page.screenshot({ path: upRackScreenshotPath, fullPage: true });
    await page.keyboard.press('r');
    await page.waitForTimeout(50);
    await page.selectOption('#animation-select', 'move');
    await page.keyboard.down('d');
    await page.waitForTimeout(240);
    await page.screenshot({ path: moveScreenshotPath, fullPage: true });
    await page.keyboard.up('d');
    await page.keyboard.press('r');
    await page.waitForTimeout(50);

    await page.selectOption('#animation-select', 'ability');
    await page.selectOption('#direction-select', 'N');
    await page.mouse.move(...Object.values(gamePoint(640, 235)));
    await page.keyboard.press('e');
    await page.keyboard.down('d');
    await page.waitForTimeout(180);
    const liMovingCast = await page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      const swords = scene.cultivatorSwordView?.sprites ?? [];
      return {
        state: scene.actor.snapshot().state,
        x: scene.view.x,
        aimIndicatorPresent: Boolean(scene.aimIndicator),
        debugVisible: scene.debugVisible,
        rackSwordCount: swords.length,
        visibleFormationSwords: swords.filter((sprite) => sprite.visible).length,
        rackDirection: scene.cultivatorSwordView?.rackDirection,
        swordRotations: swords.map((sprite) => sprite.rotation),
      };
    });
    await page.keyboard.up('d');
    await page.waitForTimeout(250);
    const liBeforeRelease = await roomSnapshot();
    await page.mouse.move(...Object.values(gamePoint(liMovingCast.x, 60)));
    await page.waitForTimeout(180);
    const liAfterRelease = await roomSnapshot();
    const liRackAfterRelease = await page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      return {
        visible: scene.cultivatorSwordView?.sprites?.filter((sprite) => sprite.visible).length ?? 0,
        rackDirection: scene.cultivatorSwordView?.rackDirection,
        visibleRotation: scene.cultivatorSwordView?.sprites?.find((sprite) => sprite.visible)?.rotation,
      };
    });
    const liAngles = liAfterRelease.projectiles.map((item) => Math.round(item.angleRadians * 180 / Math.PI));
    await page.screenshot({ path: liScreenshotPath, fullPage: true });

    await page.keyboard.press('r');
    await page.waitForTimeout(50);
    await page.evaluate(() => window.__echoesGame.scene.getScene('test-room').view.setPosition(490, 235));
    await page.mouse.move(...Object.values(gamePoint(575, 235)));
    await page.keyboard.press('e');
    await page.waitForTimeout(1050);
    const liSealed = await roomSnapshot();
    await page.screenshot({ path: sealScreenshotPath, fullPage: true });
    await page.keyboard.press('Space');
    await page.waitForTimeout(280);
    const liRecalled = await roomSnapshot();
    const liBasicSword = await page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      const swords = scene.cultivatorSwordView?.sprites ?? [];
      return {
        visible: swords.filter((sprite) => sprite.visible).length,
        allBehindCharacter: swords.every((sprite) => sprite.depth < scene.view.depth),
        allUpright: swords.every((sprite) => Math.abs(sprite.rotation + Math.PI / 2) < 0.001),
        allStatic: swords.every((sprite) => !sprite.anims.isPlaying && Number(sprite.frame.name) === 0),
        allSameScale: swords.every((sprite) => Math.abs(sprite.scaleX - 0.36) < 0.001 && Math.abs(sprite.scaleY - 0.36) < 0.001),
        maximumHorizontalOffset: Math.max(...swords.map((sprite) => Math.abs(sprite.x - scene.view.x))),
        maximumDistance: Math.max(...swords.map((sprite) => Math.hypot(sprite.x - scene.view.x, sprite.y - scene.view.y))),
      };
    });
    const meleeVfxCount = await page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      return scene.children.list.filter((child) => child.type === 'Sprite'
        && child.depth === 13
        && child.texture?.key === 'fx:sectless_slash').length;
    });
    await page.screenshot({ path: meleeScreenshotPath, fullPage: true });

    await page.keyboard.press('r');
    await page.waitForTimeout(50);
    await page.selectOption('#character-select', 'seo-jiwon');
    await page.keyboard.down('d');
    await page.waitForTimeout(320);
    await page.screenshot({ path: seoMoveScreenshotPath, fullPage: true });
    await page.keyboard.up('d');
    await page.keyboard.press('r');
    await page.waitForTimeout(50);
    await page.evaluate(() => window.__echoesGame.scene.getScene('test-room').view.setPosition(420, 235));
    const seoBefore = await roomSnapshot();
    await page.mouse.move(...Object.values(gamePoint(535, 105)));
    await page.keyboard.press('e');
    await page.waitForTimeout(690);
    await page.screenshot({ path: seoEchoScreenshotPath, fullPage: true });
    await page.waitForTimeout(290);
    const seoAfter = await roomSnapshot();
    const seoDistance = Math.hypot(seoAfter.x - seoBefore.x, seoAfter.y - seoBefore.y);
    await page.keyboard.press('r');
    await page.waitForTimeout(50);
    await page.evaluate(() => window.__echoesGame.scene.getScene('test-room').view.setPosition(490, 235));
    await page.mouse.move(...Object.values(gamePoint(575, 235)));
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    const seoAttackVfx = await page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      return scene.children.list.filter((child) => child.type === 'Sprite' && child.visible && child.texture?.key?.startsWith('fx:seo_')).map((child) => child.texture.key);
    });
    await page.screenshot({ path: seoAttackScreenshotPath, fullPage: true });
    await page.keyboard.press('k');
    await page.waitForTimeout(1050);
    const seoDeathShadow = await page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      return { state: scene.actor.snapshot().state, shadowX: scene.view.shadow.x, shadowY: scene.view.shadow.y, shadowVisible: scene.view.shadow.visible };
    });
    await page.screenshot({ path: seoDeathScreenshotPath, fullPage: true });

    await page.keyboard.press('r');
    await page.waitForTimeout(50);
    await page.selectOption('#character-select', 'tsukishiro-rei');
    await page.keyboard.down('d');
    await page.waitForTimeout(340);
    await page.screenshot({ path: reiMoveScreenshotPath, fullPage: true });
    await page.keyboard.up('d');
    await page.keyboard.press('r');
    await page.waitForTimeout(50);
    await page.mouse.move(...Object.values(gamePoint(575, 235)));
    for (let index = 0; index < 3; index++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(900);
    }
    const reiMoonfire = await page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      return {
        ...scene.moonfireSystem?.snapshot?.(),
        wispCount: scene.moonfireView?.wisps?.length ?? 0,
        uiStacks: Number(document.querySelector('#moonfire-readout')?.textContent ?? -1),
        hitFx: scene.children.list.filter((child) => child.type === 'Sprite' && child.visible && child.texture?.key === 'fx:rei_moonfox_hit').length,
      };
    });
    await page.screenshot({ path: reiMoonfireScreenshotPath, fullPage: true });
    await page.keyboard.press('e');
    await page.waitForTimeout(1050);
    const reiAfterRelease = await roomSnapshot();
    const reiVisualDirection = await page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      const projectile = scene.summonProjectileSystem?.snapshots?.()[0];
      const projectileSprite = [...(scene.summonProjectileView?.sprites?.values?.() ?? [])][0];
      const foxSprites = [...(scene.summonView?.sprites?.values?.() ?? [])];
      return {
        facing: scene.actor.snapshot().orientation.facingDirection,
        projectileAngle: projectile?.angleRadians,
        projectileVisualRotation: projectileSprite?.rotation,
        projectileVisualDelta: projectile && projectileSprite
          ? Math.atan2(
              Math.sin(projectileSprite.rotation - projectile.angleRadians),
              Math.cos(projectileSprite.rotation - projectile.angleRadians),
            )
          : undefined,
        foxSpriteCount: foxSprites.length,
        foxAnimationPlaying: foxSprites[0]?.anims?.isPlaying ?? false,
        foxScale: foxSprites[0]?.scaleX,
        moonfireAfterCast: scene.moonfireSystem?.snapshot?.().stacks,
        wispCountAfterCast: scene.moonfireView?.wisps?.length ?? 0,
      };
    });
    await page.keyboard.down('d');
    await page.keyboard.down('s');
    await page.waitForTimeout(1900);
    await page.keyboard.up('d');
    await page.keyboard.up('s');
    const reiMovingFox = await roomSnapshot();
    const reiFoxBounds = await page.evaluate(() => {
      const scene = window.__echoesGame.scene.getScene('test-room');
      const fox = scene.summonSystem?.snapshots?.()[0];
      const sprite = [...(scene.summonView?.sprites?.values?.() ?? [])][0];
      return {
        withinPaddedRoom: Boolean(fox && fox.x >= 94 && fox.x <= 606 && fox.y >= 94 && fox.y <= 376),
        spriteDepth: sprite?.depth,
        expectedDepth: sprite ? 10 + sprite.y / 1000 : undefined,
        attackCompensation: fox && sprite ? Math.hypot(sprite.x - fox.x, sprite.y - fox.y) : undefined,
      };
    });
    await page.screenshot({ path: reiSummonScreenshotPath, fullPage: true });

    await page.selectOption('#animation-select', 'idle');
    await page.selectOption('#direction-select', 'W');
    await page.$eval('#speed-range', (element) => {
      element.value = '1.5';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(180);
    const ui = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll('#game canvas').length,
      characterOptions: document.querySelectorAll('#character-select option').length,
      animationOptions: document.querySelectorAll('#animation-select option').length,
      directionOptions: document.querySelectorAll('#direction-select option').length,
      character: document.querySelector('#character-select')?.value,
      direction: document.querySelector('#direction-select')?.value,
      directionSource: document.querySelector('#direction-source-readout')?.textContent,
      speed: document.querySelector('#speed-output')?.textContent,
      asset: document.querySelector('#asset-readout')?.textContent,
      frame: document.querySelector('#frame-readout')?.textContent,
    }));
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const passed = consoleErrors.length === 0
      && viewerChecks.length === 144
      && viewerChecks.every((check) => check.source === 'BESPOKE 8-WAY')
      && liBeforeRelease.projectiles.length === 0
      && liAfterRelease.projectiles.length === 4
      && liMovingCast.state === 'ability'
      && liMovingCast.x > 375
      && liMovingCast.aimIndicatorPresent === false
      && liMovingCast.debugVisible === false
      && liMovingCast.rackSwordCount === 4
      && liMovingCast.visibleFormationSwords === 4
      && liMovingCast.rackDirection === 'E'
      && liMovingCast.swordRotations.every((rotation) => Math.abs(rotation + Math.PI / 2) < 0.001)
      && liRackAfterRelease.visible === 0
      && liRackAfterRelease.rackDirection === 'E'
      && liAngles.every((angle, index) => Math.abs(angle - ([-114, -98, -82, -66][index])) <= 2)
      && liSealed.seals.reduce((sum, seal) => sum + seal.stacks, 0) >= 3
      && liRecalled.seals.length === 0
      && liRecalled.totalDamage > liSealed.totalDamage
      && meleeVfxCount > 0
      && liBasicSword.visible === 4
      && liBasicSword.allBehindCharacter === true
      && liBasicSword.allUpright === true
      && liBasicSword.allStatic === true
      && liBasicSword.allSameScale === true
      && liBasicSword.maximumHorizontalOffset <= 13
      && liBasicSword.maximumDistance < 16
      && liUpRack.direction === 'N'
      && liUpRack.visible === 4
      && liUpRack.allInFrontOfCharacter === true
      && liUpRack.allSameScale === true
      && liUpRack.maximumHorizontalOffset <= 11
      && seoAfter.characterId === 'seo-jiwon'
      && seoDistance > 145
      && seoAfter.totalDamage >= 42
      && seoAttackVfx.includes('fx:seo_void_shear')
      && seoAttackVfx.includes('fx:seo_heartbreak_hit')
      && seoDeathShadow.state === 'death'
      && seoDeathShadow.shadowVisible === true
      && Math.abs(seoDeathShadow.shadowX) < 40
      && reiAfterRelease.characterId === 'tsukishiro-rei'
      && reiMoonfire.stacks === 3
      && reiMoonfire.wispCount === 3
      && reiMoonfire.uiStacks === 3
      && Math.abs(reiMoonfire.movementSpeedMultiplier - 1.12) < 0.001
      && reiMoonfire.basicDamageBonus === 3
      && reiMoonfire.hitFx > 0
      && reiAfterRelease.summons.length === 1
      && reiAfterRelease.summons[0].empowermentStacks === 3
      && reiAfterRelease.summons[0].remainingMs > 8500
      && reiAfterRelease.summonProjectiles.length > 0
      && reiVisualDirection.facing === 'E'
      && Math.abs(Math.abs(reiVisualDirection.projectileVisualDelta) - Math.PI) < 0.05
      && reiVisualDirection.foxSpriteCount === 1
      && reiVisualDirection.foxAnimationPlaying === false
      && Math.abs(reiVisualDirection.foxScale - 0.38) < 0.001
      && reiVisualDirection.moonfireAfterCast === 0
      && reiVisualDirection.wispCountAfterCast === 0
      && reiMovingFox.summons.length === 1
      && reiFoxBounds.withinPaddedRoom === true
      && Math.abs(reiFoxBounds.spriteDepth - reiFoxBounds.expectedDepth) < 0.001
      && Math.abs(reiFoxBounds.attackCompensation - 12) < 0.01
      && ui.canvasCount === 1 && ui.characterOptions === 3 && ui.animationOptions === 6 && ui.directionOptions === 8
      && ui.directionSource === 'BESPOKE 8-WAY' && ui.speed === '1.50×' && ui.asset === 'PREMIUM 8-WAY';
    console.log(JSON.stringify({ passed, ui, viewerCases: viewerChecks.length, liMovingCast, liBeforeRelease: liBeforeRelease.projectiles.length, liAfterRelease: liAfterRelease.projectiles.length, liRackAfterRelease, liAngles, liBasicSword, liUpRack, liSealStacks: liSealed.seals.reduce((sum, seal) => sum + seal.stacks, 0), liRecallDamage: liRecalled.totalDamage - liSealed.totalDamage, meleeVfxCount, seoDistance, seoDamage: seoAfter.totalDamage, seoAttackVfx, seoDeathShadow, reiMoonfire, reiSummons: reiAfterRelease.summons.length, reiEmpoweredFox: reiAfterRelease.summons[0], reiSummonProjectiles: reiAfterRelease.summonProjectiles.length, reiVisualDirection, reiMovingFox: reiMovingFox.summons[0], reiFoxBounds, consoleErrors, screenshotPath, liScreenshotPath, meleeScreenshotPath, idleScreenshotPath, moveScreenshotPath, upRackScreenshotPath, sealScreenshotPath, seoEchoScreenshotPath, seoAttackScreenshotPath, seoDeathScreenshotPath, seoMoveScreenshotPath, reiMoveScreenshotPath, reiMoonfireScreenshotPath, reiSummonScreenshotPath }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
