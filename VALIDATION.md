# Validation — September 6, 2026

## Passing checks

- TypeScript check and optimized Vite production build.
- 11 simulation/bot tests, 40 assertions: spawning, ownership validation, malformed orders, capture/production, evolution, one-for-one contact combat, sanctuary, particle caps, abandonment, interest streaming, binary serialization, bot orders and internal endpoint remapping.
- 64 concurrent SDK clients in one room; the 65th creates another room. Movement is verified from server snapshots, forged ownership is rejected, and reconnection preserves faction identity.
- Redis integration with two independent game processes and two independent bot workers. Checked cross-process matchmaking, room placement, authenticated atomic bot slots, bots capturing stars through network orders, bot worker replacement, human priority, and empty-world reset.
- Chromium browser interaction tests: desktop selection, halving selection, movement and capture; page-reload reconnection; help dialog and Escape; audio/effects toggles; 390 × 844 mobile layout; real emulated touch events for star selection, pinch zoom and rectangular selection. No JavaScript or shader errors in the test run. Screenshots are local under `artifacts/`.
- Linux amd64 Docker image built from the lockfile; the production container passed the 64-client network test. ARM64 deployment and real phone hardware were not tested.

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

AWS/Drydock resources were not changed. Redis coordinates discovery and matchmaking, not simulation persistence. Each room remains on one game process; ingress must route its advertised public address to that process. Live room migration and durable checkpoints are not implemented. Bot workers scale separately and cannot keep a human-empty world alive.
