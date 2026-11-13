# Shattered Heavens: Cultivation-Fantasy Action Roguelite

![Phaser](https://img.shields.io/badge/Phaser_3-8D4FE0?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![Netlify](https://img.shields.io/badge/Netlify-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

A top-down action roguelite in the browser. Pick a wanderer, descend through randomized realms, and clear rooms with eight-direction combat, signature abilities and up to three-player online co-op. Formerly *Echoes of the Realm*.

---

## Architecture Overview

```text
        +-------------------------------------------+
        |  Browser: Phaser scenes, HUD, touch input  |
        |  (Pavilion, dungeon run, archive, lab)     |
        +---------------------+---------------------+
                              |
                              | snapshots / commands
                              v
        +-------------------------------------------+
        |  Domain simulation (no Phaser imports):    |
        |  actors, projectiles, seals, summons, dash |
        +---------------------+---------------------+
                              |
                              | room-code polling over HTTPS
                              v
        +-------------------------------------------+
        |  Netlify Function: authoritative co-op sim |
        |  backed by strongly consistent Blobs       |
        +-------------------------------------------+
```

The combat rules live in `src/domain` and `src/coop` and never touch the renderer. Phaser draws snapshots of that state, so the same simulation can run locally or on the server.

---

## Core Engineering Problem Solved

Action games tend to tangle rules with rendering, which makes them hard to test and hard to move to a server. Shattered Heavens keeps the two apart.

* **Deterministic domain layer:** combat, summons, seals and dashes run from seeded randomness and explicit commands, so tests replay them exactly.
* **Authority boundary:** `FlyingSwordSystem` accepts an authority mode. The solo game uses `local-prototype`; co-op resolves casts on the server and replicates snapshots and events to clients.
* **Data-driven heroes:** projectile count, damage, speed, collision radius, lifetime and dash values sit in character configuration, not in scene code.
* **Asset contract:** hero strips are 384x384 RGBA frames described by a manifest, with all eight directions for idle, move, attack, ability, hurt and death. Manifest tests catch a key or frame size that drifts.

---

## Heroes

| Hero | Identity | Signature mechanic |
| :--- | :--- | :--- |
| **Li Yunfeng** | Sectless Sword Array cultivator | Four floating swords launch in a fan at -24, -8, +8 and +24 degrees. Projectiles mark targets, melee recalls the marks for an area burst, and expired marks detonate at reduced power |
| **Seo Jiwon** | Void Shear duelist | Nightfold Echo dashes through the target line, then resolves a delayed echo hit |
| **Tsukishiro Rei** | Moonlit Menagerie summoner | Summons a persistent fire-spirit fox that picks its own targets. Basic hits build Moonfire Halo wisps that speed her up and empower the familiar |

---

## Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Engine** | Phaser 3 | Scenes, rendering, input, audio |
| **Language** | TypeScript | Domain simulation and game code |
| **Build** | Vite 7 | Dev server and production bundle |
| **Tests** | Vitest, browser smoke scripts | Simulation, manifest and combat checks |
| **Co-op** | Netlify Functions, Netlify Blobs | Room codes, ETag conditional writes, bounded conflict retries |
| **Asset tooling** | Python, Node, PowerShell | Import, audit and repack sprite sheets |

---

## Quickstart

```bash
git clone https://github.com/ChamarWilliams/shattered-heavens.git
cd shattered-heavens
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173/` and press any key at the title screen.

| Input | Action |
| :--- | :--- |
| WASD or arrow keys | Move |
| Mouse | Aim |
| Space | Attack |
| E | Ability (talk to the wanderer in the Pavilion) |
| F | Interact with the Peddler, Altar and Bell |
| P | Pause |
| Esc twice | Abandon the expedition |

Touch controls appear on phones and tablets. The Combat Lab at `?view=lab` is the animation test room: H and K play hurt and death, R resets, and B toggles combat debug rays.

---

## Project Structure

```text
src/domain/       Renderer-independent actor, projectile, seal, summon and dash logic
src/coop/         Shared protocol, authoritative simulation, predictive polling client
src/characters/   Hero configs and 8-way direction mapping
src/game/         Phaser scenes, HUD, loot, traps, room features, audio
src/dungeon/      Randomized realm generation
src/assets/       Typed manifest adapter
netlify/functions/game.ts   Co-op room-code Function
public/assets/    Hero strips, enemies, dungeons, items, UI
tests/            Direction, state, combat, manifest and co-op tests
tools/            Asset import and audit scripts, browser smoke tests
docs/             Design notes, lore, audio brief, architecture write-ups
```

---

## Tests

```bash
pnpm check   # type-check, then run the Vitest suite
pnpm build   # production bundle
```

The suite covers continuous collision, deterministic combat randomness, action phases, two-player membership, input and revive simulation, randomized realms, and distinct enemy projectile roles. Browser smoke scripts live in `tools/` (`smoke-test.cjs`, `smoke-dungeon.mjs`, `smoke-dungeon-combat.mjs`).

---

## Online Co-op

Up to three wanderers can share a realm using a room code. The Function endpoint is `/.netlify/functions/game`, storing room state in Netlify Blobs with strong consistency. No API keys, database or environment variables are needed. Deployment steps are in [DEPLOY_NETLIFY.md](DEPLOY_NETLIFY.md) and the design is in [docs/COOP_ARCHITECTURE.md](docs/COOP_ARCHITECTURE.md). Without the Function deployed, the game runs as a single-player client.

---

## Documentation

| Document | Contents |
| :--- | :--- |
| [docs/DESIGN_NOTES.md](docs/DESIGN_NOTES.md) | Game loop, tuning knobs, next steps |
| [docs/LORE.md](docs/LORE.md) | The world and its vocabulary |
| [docs/AUDIO_BRIEF.md](docs/AUDIO_BRIEF.md) | Every sound and music track the game wants |
| [docs/FLYING_SWORD_ARCHITECTURE.md](docs/FLYING_SWORD_ARCHITECTURE.md) | The Sectless Seal combo system |
| [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | Folder-level layout |
| [docs/ENGINEERING_NOTES.md](docs/ENGINEERING_NOTES.md) | Full implementation log, asset contract and mechanics reference |

---

## About this project

Shattered Heavens was built with AI-assisted development (Claude Code) as an entry for a Handshake AI game-creation challenge. It is shared so other people can read it and build on it, not as a finished commercial product. Expect rough edges. The old name survives in some saved-data keys so existing saves keep working.

Released under the [MIT License](LICENSE): use it, change it, and build on it freely, keeping the copyright notice.
