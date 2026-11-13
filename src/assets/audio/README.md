# Game audio

Drop sound files here and the game picks them up on the next build (or
immediately while `pnpm dev` is running). No code changes are needed.

- Effects go in `sfx/`, music in `music/`.
- Name each file after its id in `src/game/audioManifest.ts`, e.g. `sfx/hit.ogg`
  or `music/warden.ogg`. The full list, with what each sound is and how long it
  should be, is in `docs/AUDIO_BRIEF.md`.
- `.ogg`, `.mp3`, `.m4a` and `.wav` all work. If you have both `.ogg` and `.m4a`
  of the same sound, the game uses whichever the browser plays (Safari prefers
  `.m4a`).
- For variety, add numbered takes: `hit.ogg`, `hit-2.ogg`, `hit-3.ogg`. One is
  chosen at random each time.
- Every effect in `sfx/` is currently a synthesized stand-in from
  `tools/synthesize_sfx.py`; overwrite any of them with a real recording of the
  same name. Music has no stand-ins and stays silent until you add tracks.
