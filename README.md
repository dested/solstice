# Solstice

A browser-native, Auralux-inspired multiplayer RTS. One particle type, one movement command, free-space battles, automatic star production, capturable stars, and reinforcement-funded evolution. Original procedural visuals and synthesized audio; no original-game assets are used.

## Play locally

```sh
bun install --frozen-lockfile
bun run dev
```

Open **http://localhost:5173**. This starts Vite, the Bun/Colyseus game process on 2567, and the **separate bot service** on 2568. Bots join after the first human arrives. One command starts all three; Ctrl+C stops the children.

For a production build, `bun run build`, then `bun start`. The game process serves the built website and multiplayer on the same `PORT` (default 2567). Run `bun run bots` separately with `GAME_SERVER_URL` and a matching `BOT_SECRET`.

## Controls

| Action               | Mouse / keyboard                            | Touch                              |
| -------------------- | ------------------------------------------- | ---------------------------------- |
| Select a local swarm | Click your star                             | Tap your star                      |
| Select particles     | Drag a rectangle; Shift adds                | Switch Pan → Select, then drag     |
| Move or attack       | Click a destination with a selection        | Tap a destination with a selection |
| Select all           | A / Select all                              | Select all                         |
| Halve selection      | Q / Send half                               | Send half                          |
| Clear selection      | Escape                                      | ×                                  |
| Pan                  | Space + drag, right/middle drag, arrow keys | Drag in Pan mode                   |
| Zoom                 | Wheel / + / −                               | Pinch / + / −                      |
| Home star            | F / Home button                               | Home button                        |
| Navigate galaxy      | Click minimap                               | Tap minimap                        |

Sending particles to a friendly star with empty rings contributes to its evolution. The first ring costs 60 particles, the second 120. Each star level produces 1.7 particles/second. Enemies collide one for one. Stars have separate capture resistance; remaining particles can upgrade the newly captured star.

## World rules

- Up to **64 connected players total**, including bots. Join fills an existing universe before creating another.
- Procedural 13,600 × 13,600 worlds contain roughly 270 stars with twice the original spacing. A new faction gets 100 particles and one star, selected away from immediate threats but near the action.
- A 35-second starting sanctuary protects the home star and nearby particles. Sending units out ends it early.
- Elimination requires losing every star and particle. Respawn grants a new starting position in the same universe.
- The world remains active while humans are present. A network drop reserves the empire for 30 seconds; a reload can reconnect using the tab’s session token.
- Leaving explicitly abandons the empire. Abandoned stars stop production but remain conquerable for up to ten minutes, or until a new player needs the faction slot.
- Bot workers never create worlds or keep an empty world alive. When the last human leaves (including reconnection expiry), the room closes and the next join starts a new galaxy.
- Every faction has a 1,600-particle cap to keep runaway empires and network load bounded. The UI displays the cap.
- Runtime worlds are in memory. Redis coordinates matchmaking; it does **not** checkpoint simulations. Losing the process or ending a deployment drain loses its active worlds. Durable world migration is not implemented.

## Architecture

- **React + TypeScript + Tailwind 4 + Vite**: responsive overlay and game-native join screen.
- **Three.js**: instanced solar shaders, particle trails, procedural nebulae, bloom, render interpolation, capture effects, minimap and selection overlay. Quality toggle reduces GPU cost. Fonts are self-hosted.
- **Bun + Colyseus 0.18**: authoritative 20 Hz simulation. Clients submit selected unit IDs and targets; the server validates ownership, coordinates, limits, protection, and message rate.
- **Spatial hashing**: local particle collision queries instead of all-pairs combat.
- **Binary interest streaming**: 16 bytes per particle, sent at 10 Hz. Own particles are always included; viewport particles have a 6,000-particle budget, with representative remote particles at galaxy scale. Star/player metadata is sent at 2 Hz.
- **RedisPresence + RedisDriver**: shared matchmaking across game processes. A world belongs to exactly one process. Every process must advertise a routable unique `PUBLIC_ADDRESS`.
- **Independent bot fleet**: ordinary Colyseus clients, reading snapshots and sending the same orders as humans. No access to simulation objects or privileged movement. Workers expand, reinforce threats, evolve stars, and respawn after defeat. The room atomically assigns authenticated bot slots, preventing duplicate workers from overfilling worlds.

See [deployment instructions](deploy/README.md) for Drydock/ECS and multi-process routing.

## Validation

```sh
bun test                         # simulation rules and bot decisions
bun run typecheck
bun run build
bun run test:network              # starts its own isolated server on 2575
bun run benchmark                # 64 factions / 38,400 initial particles
bun run test:browser              # requires dev services and installed Chrome
TEST_REDIS_URL=redis://localhost:6387/14 bun run test:scaling
```

The scaling test uses ports 2571–2574 and a **dedicated test Redis database**. It starts two game processes and two bot workers, checks cross-process matchmaking, bot population races, network-driven captures, human priority, and empty-world disposal, then stops its processes. Browser tests cover actual selection/capture input, page-reload reconnection, touch selection/pinch zoom, settings and shader errors; screenshots go to `artifacts/`.

Local benchmark measurements are not an ECS capacity guarantee. Measure the ARM instance’s CPU, memory, tick timing and egress with representative long-running worlds before selecting production task density.

See [recorded validation results](VALIDATION.md), including a full-army 102,400-particle benchmark. On PowerShell, set test environment variables with `$env:TEST_REDIS_URL='redis://localhost:6387/14'` before running the corresponding script.
