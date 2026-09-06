# Solstice — Cliffnotes

> Living project map. Read this before changing code; read [ui.md](ui.md) for visual work. Updated 2026-09-06.

## What this is

A browser-based, Auralux-inspired multiplayer strategy game. Players command swarms, capture stars, repair defenses and spend units on production upgrades. Each universe is a shared, server-authoritative world with up to 64 participants, including independently hosted bots. Graphics and audio are procedural; original-game assets are not used.

Live: https://solstice.dested.com · Source: https://github.com/dested/solstice

## Quick reference

| Task | Command / location |
| --- | --- |
| Install | `bun install --frozen-lockfile` |
| Develop all services | `bun run dev` — Vite :5173, game :2567, bots :2568 |
| Typecheck | `bun run typecheck` |
| Production build | `bun run build` — TypeScript check, then Vite to `dist/` |
| Production game/web | `bun start` — set production environment explicitly |
| Separate bot worker | `bun run bots` — matching `BOT_SECRET` and `GAME_SERVER_URL` |
| Unit tests | `bun test` |
| Network regression | `bun run test:network` — isolated game server on :2575 |
| Browser regression | `bun run test:browser` — requires dev services and Chrome |
| Multi-process regression | `bun run test:scaling` — dedicated test Redis; see [README.md](README.md) |
| Formatting | `bun run format` |
| Deployment | [deploy/README.md](deploy/README.md) |

## Stack

| Layer | Implementation |
| --- | --- |
| Runtime / packages | Bun, TypeScript, committed `bun.lock` |
| Browser UI | React 19, Vite 7, Tailwind 4 plus component CSS |
| Rendering | Three.js instancing, GLSL shaders, bloom, Canvas2D overlay/minimap |
| Audio | Synthesized Web Audio, opt-in |
| Multiplayer | Colyseus 0.18 with Bun WebSockets |
| Matchmaking across processes | Optional RedisPresence + RedisDriver |
| Storage / identity | In-memory universes; anonymous player sessions, no account database |
| Hosting | Drydock / AWS ECS, separate game, bot and Redis services |

## Directory structure

```text
src/
  main.tsx                 React entry and global styles
  App.tsx                  Join flow, HUD, settings, dialogs, connection lifecycle
  HowToPlay.tsx            Four illustrated gameplay instructions
  style.css                Tokens, components and responsive overrides
  game/
    Renderer.ts            Three scene, interpolation, camera, input, overlays
    shaders.ts             Procedural star, particle and background GLSL
    Audio.ts               Ambient synthesis and gameplay sounds
    Network.ts             Browser Colyseus client and reconnection token
    presentation.ts        Player ranking, inspector text and event messages
    demo.ts                Local start-screen simulation
shared/
  types.ts                 Constants, domain types, binary unit codec
  Simulation.ts            Seeded world generation, movement, combat, production
server/
  index.ts                 HTTP/static serving, Colyseus setup, shutdown drain
  UniverseRoom.ts          Sessions, validation, simulation clock, streaming
bots/
  index.ts                 Worker discovery, bot connections and scheduling
  Brain.ts                 Orders derived from ordinary client snapshots
  routing.ts               Public-to-internal worker address mapping
tests/                     Simulation, AI and presentation unit tests
scripts/                   Dev supervisor, network/browser/scaling tests, benchmarks
flows/                     Replayable bx browser checks
deploy/                    Container examples, routing, Drydock release helpers
public/                    Favicon
artifacts/                 Ignored local screenshots, reports and test outputs
```

## File map

| Change | Edit |
| --- | --- |
| Player/unit caps, speed, protection duration, codec | `shared/types.ts` |
| Star placement, spawns, damage, repair, upgrades | `shared/Simulation.ts` |
| Join/leave, bot authentication, input limits | `server/UniverseRoom.ts` |
| HTTP endpoints, origin/static serving setup | `server/index.ts` |
| Bot tactics / worker capacity | `bots/Brain.ts` / `bots/index.ts` |
| Camera, mouse/touch selection, map navigation | `src/game/Renderer.ts` |
| Effects and sound | `src/game/shaders.ts`, `Renderer.ts`, `Audio.ts` |
| HUD, tutorial, settings, player list | `src/App.tsx`, `HowToPlay.tsx`, `presentation.ts` |
| Visual styling | `src/style.css`; consult `ui.md` |
| Browser connection lifecycle | `src/game/Network.ts` |
| ECS build/release | Root `Dockerfile`, `drydock.yaml`, `deploy/drydock-*.ts` |

## Routes / URLs

| Route | Owner / purpose |
| --- | --- |
| `/` | `src/App.tsx`; Vite in development, `server/index.ts` serves `dist/` in production |
| `/assets/*` | Hashed production assets, immutable caching |
| `/healthz` | Game process readiness; 503 while draining |
| `/api/status` | Shared matchmaking counts of humans and worlds |
| `/api/bot-worlds` | Bot-authenticated world discovery |
| `/matchmake/*`, room WebSockets | Colyseus matchmaking/session routes |
| Bot service `/healthz` | Worker capacity, current bots/orders and discovery health |

## Architecture and key types

The browser submits selected unit IDs and a destination. The room validates ownership and limits, then advances one shared simulation at 20 Hz. It sends binary unit snapshots at 10 Hz and star/player metadata at 2 Hz. The renderer interpolates positions over 100 ms; browsers do not run independent gameplay simulations during multiplayer.

`Star`, `Player`, `Unit`, `MoveOrder`, `Viewport`, `WorldMeta` and `WorldEvent` live in `shared/types.ts`. A unit record uses 16 bytes on the wire. Every own unit is streamed; remote units use viewport interest with a 6,000-unit budget and representative sampling for crowded views. Star/player metadata covers the universe.

### World rules

- Seeded irregular placement targets 274 stars in a 13,600 × 13,600 world, with 430 minimum center spacing. Human spawns favor human neighbors while considering nearby danger.
- Start with one star and 100 units. Each star level produces 1.7 units/second. Each faction is capped at 1,600 units.
- A 35-second sanctuary protects the starting star and nearby units; an outbound order ends it.
- Enemy units annihilate one for one. Losing one unit does not cancel surviving movement orders.
- Friendly arrivals repair damage first (one spent unit per defense point), then pay for upgrades (60 to level 2, 120 to level 3). At maximum level, surplus units remain to defend. Stars also regenerate defense slowly.
- A network drop allows 30 seconds to reconnect. Explicit leave abandons the empire: production stops, but its territory remains conquerable until cleanup or room disposal.
- The last human leaving, including reconnection expiry, closes the universe. Bots cannot keep an empty universe alive. Worlds are not saved across process loss.

### Bots and scaling

Bot workers discover occupied worlds and claim authenticated numbered slots atomically. They receive the same snapshots and send the same orders as humans. Tactics include expansion, committed attacks, reinforcement, repair and upgrades; existing moving orders are preserved. The default target is six total participants per occupied world, so bots yield slots as humans join.

Redis shares matchmaking and presence; each universe still belongs to one process. Multiple game processes require a unique routable `PUBLIC_ADDRESS` for each worker. Ordinary round-robin routing cannot deliver a room WebSocket to the correct owner by itself. Current production uses one game task and one bot task on one host; dynamic per-worker ingress, durable checkpoints and live room migration are not implemented.

## Common changes and verification

- Gameplay rule: change the shared simulation, keep inspector/tutorial feedback consistent, and run focused unit tests plus `bun run build`. Protocol changes also need the network regression.
- Bot behavior: change `Brain.ts` and its unit tests. Changes to discovery/slots require the Redis integration test with a dedicated test database.
- Visual/input change: read `ui.md`, edit the renderer or HUD/CSS, build, and inspect the affected desktop/touch surface. Use existing browser replays where appropriate; isolate bx profiles from unrelated browser work.
- Deployment: follow `deploy/README.md`. Release helpers require a separately configured Drydock checkout; standalone Docker/Compose examples do not.

See [VALIDATION.md](VALIDATION.md) for measured checks and limits, [README.md](README.md) for controls, and [updates.md](updates.md) for recent changes.

## Gotchas

- Multiplayer rooms disable the simulation's built-in demo AI; production bots belong in the separate worker service.
- Use the simulation's seeded random generator for world generation. Cosmetic shader/audio randomness need not match between clients.
- When the live star count differs from the menu demo, reset instanced geometry capacity; otherwise Three.js can retain the ten-star menu draw limit.
- Selected-unit highlights must stay beneath numeric label backplates. Keep capture/upgrade messages from being displaced by cosmetic event bursts.
- Touch uses tap, pan/select modes and pinch; preserve pointer capture and gesture cancellation.
- `window.__solsticeDebug` is development-only and read-oriented. Production checks must use the UI/protocol.
- `VITE_SERVER_URL` is build-time configuration. Development defaults to the browser's hostname on :2567; production defaults to the current origin.
- Root `Dockerfile` supports `SOLSTICE_SERVICE=bots`. Drydock wiring must preserve this selector.
- `package.json` is `private: true` to prevent accidental package publication; the GitHub repository is public.
- Keep credentials in environment variables/SSM. Commit only `.env.example`; real environment files, keys and artifacts are ignored. Development/Compose example tokens are not production credentials.
- Public docs should contain reproducible project information, not private recordings, signed URLs, machine-specific paths or session transcripts.

## Status

Implemented and deployed: instant matchmaking, server-controlled combat/repair/production, separate bots, responsive mouse/touch play, onboarding, sound/effects, reconnect and empty-world reset. Verified locally with unit, network, browser and multi-process checks; HTTPS and WebSocket smoke checks also passed in production. Real-phone hardware and production task-density load testing remain unverified.
