# Validation — September 6, 2026

## Passing checks

- TypeScript check and optimized Vite production build.
- 22 simulation/bot/presentation tests, 90 assertions. Round 2 adds repair-before-upgrade spending, max-level healing, collision survivors preserving orders, aggregated arrival feedback, human-neighbor spawning, and committed bot attacks that retain in-flight orders.
- 64 concurrent SDK clients in one room; the 65th creates another room. Two independent clients receive identical positions for the same moving unit in at least three snapshots. Forged ownership is rejected and reconnection preserves faction identity.
- Redis integration with two independent game processes and two independent bot workers. Checked cross-process matchmaking, room placement, authenticated atomic bot slots, bots capturing stars through network orders, bot worker replacement, human priority, and empty-world reset.
- Chromium browser interaction tests: desktop selection, halving selection, movement and capture; page-reload reconnection; help dialog and Escape; audio/effects toggles; 390 × 844 mobile layout; real emulated touch events for star selection, pinch zoom and rectangular selection. No JavaScript or shader errors in the test run. Screenshots are local under `artifacts/`.
- Desktop and touch tests also verify galaxy overview/return, whole-world fit on a portrait phone, persistent tip dismissal, complete Players rendering and the shortened guide. The bx onboarding replay passed all 27 steps. The exploratory round-2 bx agent hit its wall limit; deterministic checks supplied the verification instead.
- Linux amd64 Docker image built from the lockfile; the production container passed the 64-client network test. ARM64 ECS deployment subsequently passed HTTPS/WebSocket smoke checks. Real phone hardware has not been tested.

## Full-army benchmark

Run with `BENCH_PARTICLES=1600 bun run benchmark` (PowerShell: set `$env:BENCH_PARTICLES='1600'` first).

| Measurement | Local result |
| --- | ---: |
| Factions | 64 |
| Starting particles | 102,400 |
| Particles after simulated combat | 92,220 |
| Simulation tick budget | 50 ms |
| Median tick | 11.87 ms |
| 95th-percentile tick | 17.62 ms |
| Maximum tick in this run | 20.63 ms |
| Encode interest snapshots for all 64 clients | 22.19 ms |
| Combined particle snapshot payload | 4,933 KiB |

These measurements are from this development machine and a synthetic scenario. Snapshot bandwidth excludes protocol overhead and star/player metadata. CPU spikes, egress, sustained room populations, and task density still need measurement on the intended ECS instance. Galaxy-scale views intentionally sample remote particles beyond the 6,000-particle interest budget; own particles are never sampled.

## Deployment boundary

The app is deployed at https://solstice.dested.com through Drydock with separate game, bot and Redis services. See deploy/README.md for release commands and the current single-host ingress boundary. Redis coordinates discovery and matchmaking, not simulation persistence. Each room remains on one game process; ingress must route its advertised public address to that process. Live room migration and durable checkpoints are not implemented. Bot workers scale separately and cannot keep a human-empty world alive.
