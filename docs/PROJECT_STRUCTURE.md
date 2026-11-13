# Project structure

```text
public/assets/characters/<character>/  Approved spritesheets and JSON metadata
src/characters/                       Schema, registry, and per-character configs
src/domain/                           Pure gameplay state and action timing
src/game/                             Phaser scenes, controller, and render adapter
src/ui/                               DOM-based animation viewer controls
tests/                                Domain and configuration contract tests
```

The domain layer has no Phaser imports. `CharacterActor` owns state transitions and action locks. `CharacterView` converts a read-only actor snapshot into either validated spritesheet frames or a debug silhouette. This lets multiplayer simulation, replay, and server validation share gameplay rules without importing rendering code.

## Extension path

Add a character by supplying a `CharacterConfig`, validated animation metadata, and an approved sheet. Register the configuration in `src/characters/registry.ts`; controller and viewer code do not change.
