/**
 * Every sound the game can play. docs/AUDIO_BRIEF.md is the brief for finding
 * or commissioning them (a test keeps the two in step).
 *
 * To add a sound, drop a file named after its id into src/assets/audio/sfx/ or
 * src/assets/audio/music/ (.ogg, .mp3, .m4a or .wav). Optional variations end
 * in -2, -3 … (e.g. hit-2.ogg) and one is picked at random. Anything missing
 * falls back to the old procedural beep (effects) or silence (music).
 */

export type SfxId =
  // Heroes
  | 'li-attack' | 'li-ability' | 'seo-attack' | 'seo-ability' | 'rei-attack' | 'rei-ability'
  | 'hit' | 'crit' | 'hurt' | 'deflect' | 'heal' | 'revive'
  // Enemies
  | 'enemy-telegraph' | 'enemy-shot' | 'enemy-death' | 'elite-death' | 'ward-break' | 'protector-charge' | 'warden-roar'
  // Traps and hazards
  | 'spike-trap' | 'fire-vent' | 'pit-crumble' | 'fall' | 'burn-ignite'
  // Rooms, loot and the world
  | 'door-seal' | 'room-clear' | 'chest-land' | 'chest-open' | 'pickup-stone' | 'pickup-item' | 'pickup-rare' | 'urn-break'
  | 'portal-open' | 'portal-enter' | 'bell-toll' | 'altar-offer' | 'purchase' | 'deny' | 'lore-found' | 'hero-unlock' | 'stage-up'
  // Interface
  | 'ui-move' | 'ui-confirm' | 'ui-back' | 'ui-open';

export type MusicId =
  | 'title' | 'pavilion' | 'realm-sectless' | 'realm-nightfold' | 'realm-foxfire'
  | 'protector' | 'warden' | 'trial'
  | 'sting-death' | 'sting-victory' | 'sting-tribulation';

export interface SoundSpec {
  /** What it is, for whoever sources it. */
  readonly brief: string;
  /** When the game plays it. */
  readonly when: string;
  /** Target length in seconds: [shortest, longest]. */
  readonly seconds: readonly [number, number];
}

export interface MusicSpec extends SoundSpec {
  /** Loops seamlessly (true) or plays once (a sting). */
  readonly loop: boolean;
}

export const SFX: Readonly<Record<SfxId, SoundSpec>> = {
  'li-attack': { brief: 'Light jian (straight sword) swing with a thin spirit shimmer', when: 'Li Yunfeng\'s basic attack', seconds: [0.2, 0.35] },
  'li-ability': { brief: 'Four spirit swords ringing out of their sheaths and launching', when: 'Li\'s Flying Sword ability', seconds: [0.6, 1.0] },
  'seo-attack': { brief: 'Quick dagger slash, dry and close', when: 'Seo Jiwon\'s basic attack', seconds: [0.15, 0.3] },
  'seo-ability': { brief: 'Shadow-step whoosh that folds in on itself', when: 'Seo\'s Shadow Dash', seconds: [0.4, 0.7] },
  'rei-attack': { brief: 'Soft foxfire bolt cast, a breathy flame puff', when: 'Tsukishiro Rei\'s basic attack', seconds: [0.2, 0.4] },
  'rei-ability': { brief: 'Fox spirit summoned: a yip inside a rising blue flame', when: 'Rei\'s Foxfire Summon', seconds: [0.7, 1.1] },
  hit: { brief: 'Meaty impact on a spirit body, short', when: 'Any hero hit on an enemy', seconds: [0.08, 0.2] },
  crit: { brief: 'Sharper, brighter impact with a metallic ring', when: 'A critical hit', seconds: [0.2, 0.35] },
  hurt: { brief: 'Hero takes a hit: thud plus a short grunt-free whoosh', when: 'The hero loses a heart', seconds: [0.2, 0.35] },
  deflect: { brief: 'Bronze mirror deflecting a blow', when: 'Mirror Charm turns a hit aside', seconds: [0.2, 0.35] },
  heal: { brief: 'Warm chime with a soft rising shimmer', when: 'A heart is restored', seconds: [0.4, 0.7] },
  revive: { brief: 'Phoenix flare: a roar of fire that rises in pitch', when: 'Phoenix Ember brings the hero back', seconds: [1.2, 2.0] },
  'enemy-telegraph': { brief: 'Short warning tone, clear but not shrill (a temple bell tick)', when: 'An enemy starts winding up an attack (rate-limited)', seconds: [0.2, 0.4] },
  'enemy-shot': { brief: 'Spirit projectile fired, airy and light', when: 'An enemy volley is released (rate-limited)', seconds: [0.15, 0.3] },
  'enemy-death': { brief: 'Echo dissolving into motes, a soft shatter', when: 'An ordinary enemy falls', seconds: [0.4, 0.7] },
  'elite-death': { brief: 'Bigger, heavier version of the enemy death, with a gong under it', when: 'An elite falls', seconds: [0.7, 1.1] },
  'ward-break': { brief: 'Glassy barrier cracking and bursting', when: 'A Warded elite\'s barrier breaks', seconds: [0.3, 0.6] },
  'protector-charge': { brief: 'Heavy footfalls building into a rush', when: 'A Dharma Protector charges', seconds: [0.5, 0.9] },
  'warden-roar': { brief: 'Deep, echoing roar or war cry with a sub boom', when: 'A warden enters its second form', seconds: [1.2, 2.0] },
  'spike-trap': { brief: 'Stone grinding then spikes snapping up', when: 'Spike plates fire', seconds: [0.3, 0.5] },
  'fire-vent': { brief: 'Gas hiss into a burst of flame', when: 'A fire vent erupts', seconds: [0.7, 1.2] },
  'pit-crumble': { brief: 'Stone slab cracking and crumbling', when: 'A pitfall gives way', seconds: [0.5, 0.8] },
  fall: { brief: 'Falling whoosh into a distant thud', when: 'The hero falls into a pit', seconds: [0.8, 1.2] },
  'burn-ignite': { brief: 'Small flame catching on stone', when: 'A Scorching elite\'s patch ignites', seconds: [0.2, 0.4] },
  'door-seal': { brief: 'Heavy stone doors slamming shut with a qi seal hum', when: 'You enter a room with enemies', seconds: [0.5, 0.9] },
  'room-clear': { brief: 'Short triumphant sting (guzheng or bells) and doors unsealing', when: 'A room is cleared', seconds: [1.0, 1.6] },
  'chest-land': { brief: 'Wooden chest thumping onto stone', when: 'A chest drops into the room', seconds: [0.3, 0.5] },
  'chest-open': { brief: 'Lid creak and a sparkle of treasure', when: 'A chest opens', seconds: [0.6, 1.0] },
  'pickup-stone': { brief: 'Tiny crystal clink', when: 'A Spirit Stone is picked up', seconds: [0.12, 0.3] },
  'pickup-item': { brief: 'Pleasant pickup chime', when: 'A common item is picked up', seconds: [0.3, 0.6] },
  'pickup-rare': { brief: 'Richer chime with a sparkle tail', when: 'A relic, infusion or manual is picked up', seconds: [0.8, 1.3] },
  'urn-break': { brief: 'Ceramic urn shattering', when: 'An urn is broken', seconds: [0.3, 0.5] },
  'portal-open': { brief: 'Space tearing open into a low swirling hum', when: 'The echo (portal) opens after a warden falls', seconds: [1.5, 2.5] },
  'portal-enter': { brief: 'Rushing whoosh into silence', when: 'You step into the echo', seconds: [1.0, 1.5] },
  'bell-toll': { brief: 'Large temple bell struck once, long tail', when: 'You ring the Bell of Trials', seconds: [2.0, 3.5] },
  'altar-offer': { brief: 'Heartbeat thump into a dark choral swell', when: 'You offer a heart at the Heart-Blood Altar', seconds: [1.0, 1.6] },
  purchase: { brief: 'Coins and a satisfied register-like chime', when: 'You buy from the Wandering Peddler', seconds: [0.4, 0.7] },
  deny: { brief: 'Soft muted thunk, clearly "no"', when: 'You cannot afford or use something', seconds: [0.15, 0.3] },
  'lore-found': { brief: 'Paper scroll unrolling with a gentle chime', when: 'A new Archive record is found', seconds: [0.8, 1.2] },
  'hero-unlock': { brief: 'Heroic sting, a few bars on erhu or dizi', when: 'A new wanderer is unlocked', seconds: [2.0, 3.0] },
  'stage-up': { brief: 'Ascending shimmer into a resonant gong', when: 'A wanderer reaches a new Stage', seconds: [2.0, 3.0] },
  'ui-move': { brief: 'Tiny wooden tick', when: 'Moving between menu buttons', seconds: [0.04, 0.1] },
  'ui-confirm': { brief: 'Clean confirm chime', when: 'Choosing a menu option', seconds: [0.15, 0.3] },
  'ui-back': { brief: 'Softer, lower version of the confirm', when: 'Closing a dialog or going back', seconds: [0.1, 0.2] },
  'ui-open': { brief: 'Paper panel sliding open', when: 'Opening a dialog (shops, shrine, archive, settings)', seconds: [0.2, 0.4] },
};

/**
 * A slot with no file of its own borrows another's track, so a few songs can
 * cover the whole game. A dedicated file always wins.
 */
export const MUSIC_FALLBACKS: Readonly<Partial<Record<MusicId, MusicId>>> = {
  title: 'pavilion',
  'realm-nightfold': 'realm-sectless',
  'realm-foxfire': 'realm-sectless',
  protector: 'warden',
  trial: 'warden',
};

export const MUSIC: Readonly<Record<MusicId, MusicSpec>> = {
  title: { brief: 'Main theme. Wistful and grand: guzheng, erhu, dizi over soft strings and taiko', when: 'Title screen', seconds: [90, 150], loop: true },
  pavilion: { brief: 'Calm hub theme, warm and safe, a resting place between journeys', when: "Wayfarers' Pavilion", seconds: [120, 180], loop: true },
  'realm-sectless': { brief: 'Exploration theme for a ruined sword temple above the clouds: airy flutes, plucked strings, steady pulse', when: 'Sectless Sky Temple rooms', seconds: [120, 180], loop: true },
  'realm-nightfold': { brief: 'Exploration theme for a shadow dynasty crypt: low drones, muted percussion, tension', when: 'Nightfold Shadow Crypt rooms', seconds: [120, 180], loop: true },
  'realm-foxfire': { brief: 'Exploration theme for a moonlit fox shrine: shamisen or koto, bells, mysterious and playful', when: 'Moonlit Foxfire Shrine rooms', seconds: [120, 180], loop: true },
  protector: { brief: 'Mini-boss fight, driving and urgent but shorter-winded than the warden theme', when: 'Dharma Protector fights', seconds: [90, 120], loop: true },
  warden: { brief: 'Boss fight theme, epic: full taiko, choir, soaring erhu', when: 'Realm warden fights (both forms)', seconds: [120, 150], loop: true },
  trial: { brief: 'Fast, rhythmic survival theme', when: 'Bell of Trials waves', seconds: [60, 90], loop: true },
  'sting-death': { brief: 'Mournful fall: a single erhu phrase fading to silence', when: 'The hero falls', seconds: [5, 10], loop: false },
  'sting-victory': { brief: 'Short triumphant fanfare', when: 'A warden is defeated', seconds: [5, 8], loop: false },
  'sting-tribulation': { brief: 'Thunder and a rising, ominous chord', when: 'A new Tribulation begins', seconds: [6, 10], loop: false },
};
