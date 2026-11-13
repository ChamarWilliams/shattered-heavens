import { chromium } from 'file:///C:/Users/Chamar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

await page.goto('http://127.0.0.1:4173/?assets=dungeon-combat-v5&view=lobby', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__echoesLobbyGame?.scene?.isActive('realm-hall'));

const results = [];
for (const heroId of ['li-yunfeng', 'seo-jiwon', 'tsukishiro-rei']) {
  await page.evaluate((id) => {
    const game = window.__echoesLobbyGame;
    game.registry.set('selectedHero', id);
    game.scene.stop('realm-hall');
    game.scene.stop('grand-archive');
    game.scene.stop('dungeon-run');
    game.scene.start('dungeon-run');
  }, heroId);
  await page.waitForFunction((id) => {
    const game = window.__echoesLobbyGame;
    if (!game.scene.isActive('dungeon-run')) return false;
    return game.scene.getScene('dungeon-run').heroId === id;
  }, heroId);
  await page.waitForTimeout(450);

  const result = await page.evaluate((id) => {
    const game = window.__echoesLobbyGame;
    const scene = game.scene.getScene('dungeon-run');
    scene.beginAction('ability');
    const duration = scene.config.animations.ability.durationMs;
    const release = scene.config.animations.ability.events.find((event) => event.name === scene.config.activeAbility.releaseEvent);
    scene.actor.update(duration * release.normalizedTime + 1);
    const snapshot = scene.actor.snapshot();
    scene.releaseActionIfReady(snapshot.state, snapshot.stateElapsedMs);
    scene.updateHeroAbilities(80);

    const projectileKeys = [];
    for (const style of ['hunter', 'heavy', 'sentinel', 'boss']) {
      scene.spawnProjectile(480, 270, 0, 0, true, 1, 7, 0xffffff, style);
      projectileKeys.push(scene.projectiles.at(-1).view.texture.key);
    }
    for (const projectile of [...scene.projectiles]) scene.removeProjectile(projectile);

    return {
      heroId: scene.heroId,
      configId: scene.config.id,
      theme: scene.dungeon.themeId,
      themeOrder: [...scene.runThemeOrder],
      realmHallInactive: !game.scene.isActive('realm-hall'),
      li: {
        swords: scene.abilityProjectileSystem?.snapshots().length ?? 0,
        sealsConfigured: Boolean(scene.sealSystem),
      },
      seo: {
        dashConfigured: Boolean(scene.dashSystem),
        echoConfigured: Boolean(scene.echoSystem),
      },
      rei: {
        summons: scene.summonSystem?.snapshots().length ?? 0,
        moonfireConfigured: Boolean(scene.moonfireSystem),
        basicProjectileConfigured: Boolean(scene.basicProjectileSystem),
      },
      projectileKeys,
      uniqueProjectileLooks: new Set(projectileKeys).size === 4,
      selectedMatches: id === scene.heroId && id === scene.config.id,
    };
  }, heroId);
  results.push(result);
}

const state = { results, errors };
console.log(JSON.stringify(state, null, 2));
await browser.close();

const byId = Object.fromEntries(results.map((result) => [result.heroId, result]));
const passed = results.every((result) => result.selectedMatches && result.realmHallInactive && result.uniqueProjectileLooks && result.themeOrder.length === 3)
  && byId['li-yunfeng']?.li.swords === 4
  && byId['li-yunfeng']?.li.sealsConfigured
  && byId['seo-jiwon']?.seo.dashConfigured
  && byId['seo-jiwon']?.seo.echoConfigured
  && byId['tsukishiro-rei']?.rei.summons === 1
  && byId['tsukishiro-rei']?.rei.moonfireConfigured
  && byId['tsukishiro-rei']?.rei.basicProjectileConfigured
  && errors.length === 0;
if (!passed) process.exitCode = 1;
