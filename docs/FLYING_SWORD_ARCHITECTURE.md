# Flying Sword architecture

`FlyingSwordSystem` is a rendering-independent simulation. A cast command contains the caster, origin, aim angle, and unique cast ID. Yunfeng's current configuration launches all four swords from his four-sword rack using the configured spread, speed, damage, collision radius, and lifetime.

Phaser owns only presentation. `CultivatorSwordArrayView` renders the persistent four-sword back rack and four-sword wind-up orbit. It remains unchanged during melee. At the release event, `FlyingSwordView` takes over the four independent projectile sprites, trails, and impacts.

## Multiplayer boundary

The browser currently acts as `local-prototype` authority. Multiplayer should move `spawn`, `update`, collision resolution, damage, and lifetime expiry to the server. Clients should submit an ability intent and aim direction, then render server-issued projectile snapshots and hit events. Clients must never authoritatively decide projectile count, hit confirmation, or damage.

## Replaceable assets

Rack and projectile visuals use the standalone `flying_sword` manifest key. Trail, summon, and impact sheets remain separate under `public/assets/gameplay-kit/assets/vfx/`. They can be replaced under the same manifest keys without changing the rack, projectile system, collision, or seals.
