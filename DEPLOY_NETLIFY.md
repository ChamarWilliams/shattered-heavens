# Netlify release deployment

## Drag-and-drop deployment

1. Extract `netlify-ready-game.zip`.
2. Sign in to the Netlify team that should own the game.
3. Drag the extracted `netlify-ready-game` project folder—not only its `dist` folder—onto Netlify Drop.
4. Netlify reads `netlify.toml`, installs the locked dependencies, runs `pnpm netlify:build`, publishes `dist`, and bundles `netlify/functions/game.ts`.
5. Open **Functions** in the deployed project and confirm `game` appears. The browser calls it directly at `/.netlify/functions/game`.

No redirects, API keys, database provisioning, or user-defined environment variables are required. Netlify automatically supplies the project credentials used by `@netlify/blobs` inside the Function.

Dropping only the prebuilt `dist` directory publishes a single-player static client but cannot include or build the co-op Function. Use the extracted source folder while signed in for the complete game.

## Co-op data model

- Store: `echoes-coop-rooms-v1`
- Store consistency: strong
- Room updates: ETag conditional writes (`onlyIfMatch`) with bounded conflict retries
- New rooms: atomic `onlyIfNew`
- Capacity: two authenticated player sessions
- Transport: 140 ms adaptive polling with reconnect backoff
- Authority: Function-owned positions, health, enemy targeting/health, downed/revive state, objective, theme order, and room progression

This is serverless near-real-time synchronization rather than a persistent WebSocket. The client predicts local movement and interpolates the remote player between authoritative snapshots.
