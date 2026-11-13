import type Phaser from 'phaser';
import {
  CABINET_UNLOCKS, FORGE_UPGRADES, PROVISIONS, TRIALS, buyForge, buyProvision, buyUnlock, forgeCost, loadMeta, saveMeta,
  toggleTrial, trialShardMultiplier, type MetaState,
} from '../domain/metaProgress';
import { ITEMS } from '../domain/runItems';

type StationId = 'forge' | 'apothecary' | 'cabinet' | 'table';

const STATION_COPY: Readonly<Record<StationId, { overline: string; title: string; intro: string }>> = {
  forge: { overline: "WAYFARERS' PAVILION / EAST WING", title: 'Spirit Forge', intro: 'Temper yourself between expeditions. Upgrades last forever.' },
  apothecary: { overline: "WAYFARERS' PAVILION / WEST WING", title: 'Alchemy Table', intro: 'Pack one provision for your next expedition.' },
  cabinet: { overline: "WAYFARERS' PAVILION / TREASURE CABINET", title: 'Treasure Cabinet', intro: 'Catalogue a relic or infusion so chests can hold it.' },
  table: { overline: "WAYFARERS' PAVILION / EXPEDITION TABLE", title: 'Expedition Table', intro: 'Swear oaths to make the realms harsher and the spirit stones richer, and read back over past expeditions.' },
};

/** The Pavilion's shops and expedition table, opened by walking up to them and pressing E. */
export function setupHallShops(lobbyGame: Phaser.Game): void {
  const dialog = document.querySelector<HTMLDialogElement>('#hall-shop-dialog');
  const offers = document.querySelector<HTMLElement>('#shop-offers');
  if (!dialog || !offers) return;
  const text = (selector: string, value: string): void => { const element = document.querySelector<HTMLElement>(selector); if (element) element.textContent = value; };
  let station: StationId = 'forge';

  const offer = (name: string, blurb: string, action: string, enabled: boolean, onClick: () => void, state = ''): HTMLElement => {
    const row = document.createElement('article');
    row.className = `shop-offer ${state}`;
    const copy = document.createElement('div');
    const title = document.createElement('b'); title.textContent = name;
    const detail = document.createElement('small'); detail.textContent = blurb;
    copy.append(title, detail);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action;
    button.disabled = !enabled;
    button.addEventListener('click', () => { onClick(); render(); lobbyGame.events.emit('echo-shards-changed'); });
    row.append(copy, button);
    return row;
  };
  const buy = (meta: MetaState, purchase: (meta: MetaState) => boolean): void => { if (purchase(meta)) saveMeta(meta); };

  const render = (): void => {
    const meta = loadMeta();
    const copy = STATION_COPY[station];
    text('#shop-overline', copy.overline);
    text('#shop-title', copy.title);
    text('#shop-intro', copy.intro);
    text('#shop-shards', String(meta.shards));
    const rows: HTMLElement[] = [];
    if (station === 'forge') {
      for (const upgrade of FORGE_UPGRADES) {
        const cost = forgeCost(meta, upgrade.id);
        const tier = meta.forge[upgrade.id];
        rows.push(offer(`${upgrade.name}  ${'◆'.repeat(tier)}${'◇'.repeat(upgrade.costs.length - tier)}`, upgrade.blurb, cost === undefined ? 'Mastered' : `◆ ${cost}`, cost !== undefined && meta.shards >= cost, () => buy(meta, (m) => buyForge(m, upgrade.id))));
      }
    } else if (station === 'apothecary') {
      for (const provision of PROVISIONS) {
        const packed = meta.provision === provision.id;
        rows.push(offer(provision.name, provision.blurb, packed ? 'Packed' : `◆ ${provision.cost}`, !meta.provision && meta.shards >= provision.cost, () => buy(meta, (m) => buyProvision(m, provision.id)), packed ? 'is-owned' : ''));
      }
    } else if (station === 'cabinet') {
      for (const unlock of CABINET_UNLOCKS) {
        const owned = meta.unlocked.includes(unlock.id);
        rows.push(offer(ITEMS[unlock.id].name, ITEMS[unlock.id].blurb, owned ? 'Catalogued' : `◆ ${unlock.cost}`, !owned && meta.shards >= unlock.cost, () => buy(meta, (m) => buyUnlock(m, unlock.id)), owned ? 'is-owned' : ''));
      }
    } else {
      for (const trial of TRIALS) {
        const active = meta.trials.includes(trial.id);
        rows.push(offer(trial.name, `${trial.blurb}  •  +${Math.round(trial.shardBonus * 100)}% spirit stones`, active ? 'Active' : 'Take on', true, () => { toggleTrial(meta, trial.id); saveMeta(meta); }, active ? 'is-owned' : ''));
      }
      const summary = document.createElement('p');
      summary.className = 'shop-summary';
      summary.textContent = `Spirit stone payout ×${trialShardMultiplier(meta.trials).toFixed(2)}  •  Deepest tribulation ${meta.bestResonance}`;
      rows.push(summary);
      const chronicle = document.createElement('ol');
      chronicle.className = 'shop-chronicle';
      for (const run of meta.chronicle.slice(0, 6)) {
        const item = document.createElement('li');
        item.textContent = `${run.hero} — ${run.outcome} in the ${run.realm} (Tribulation ${run.resonance}), ${run.rooms} rooms, ◆ ${run.shards}`;
        chronicle.append(item);
      }
      if (meta.chronicle.length === 0) { const empty = document.createElement('li'); empty.textContent = 'No expeditions recorded yet.'; chronicle.append(empty); }
      rows.push(chronicle);
    }
    offers.replaceChildren(...rows);
  };

  lobbyGame.events.on('hall-station', (id: string) => {
    // The Ascension Shrine has its own dialog (setupAscension). Stations open only in the Pavilion.
    if (!(id in STATION_COPY) || document.body.dataset.screen !== 'lobby' || document.querySelector('dialog[open]')) return;
    station = id as StationId;
    render();
    lobbyGame.events.emit('lobby-dialogue-state', true);
    dialog.showModal();
  });
  dialog.addEventListener('close', () => lobbyGame.events.emit('lobby-dialogue-state', false));
}
