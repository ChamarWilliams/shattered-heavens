# Combat and hit polish v6

## Fox attack correction

Every directional fox attack frame is component-audited during import. Only the primary connected fox body is retained; this removed detached heads, tails, sparks, and fragments from the supplied pounce frames. The runtime also offsets the visual pounce 12 pixels backward from its target-facing direction, uses a 58-pixel padded room boundary, and shares Rei's Y-depth formula.

## Bespoke collision effects

- Rei's basic and familiar bolts resolve with `rei_moonfox_hit`, a blue-white spectral fox-bite impact with restrained gold accents.
- Seo's melee, Nightfold contact, and delayed echo resolve with `seo_heartbreak_hit`, a violet-black cross-cut with a gold heartbeat fracture.
- Both effects are separate spritesheets spawned at authoritative collision coordinates. They do not change hit detection or damage logic.

## Yunfeng's cultivator sword rack

- Four standalone sword sprites float behind Yunfeng.
- Every rack blade is fixed at −90° so it always points vertically upward. The rack's behind-body location is locked to Yunfeng's discrete eight-way character direction; cursor movement cannot rotate or reposition it, and every sword stays below the character's render depth.
- The rack does not participate in his basic attack. All four floating swords remain stationary behind him while the authored character animation supplies his melee hand sword.
- During Flying Sword, all four rack swords gather ahead of Yunfeng and orbit through the wind-up relative to his locked character direction. The orbit does not follow the cursor.
- At release the four formation sprites hide and four independent authoritative projectiles launch at −24°, −8°, +8°, and +24°.
- The rack restores all four presentation swords when the action completes. Projectile collision, damage, lifetime, seals, and recall remain renderer-independent.

## Verification

- 42 automated tests pass.
- Browser smoke covers all 144 hero/state/direction combinations with no console errors.
- The browser confirms four upright rack swords, a rack direction that remains east while live aim changes north, four launch projectiles, no rack sprites remaining after launch, and all four swords staying behind the character layer throughout melee. It also verifies both bespoke collision effects, a single-component attacking fox, padded bounds, and exact 12-pixel pounce compensation.
- The asset audit reports zero dimension errors, zero cell-edge contacts, and zero duplicate-component candidates.
