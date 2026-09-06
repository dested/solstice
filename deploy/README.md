# Drydock / ECS deployment

No AWS resources have been changed. The repository is prepared for your existing Drydock workflow.

## Initial deployment

1. Onboard the root repo with `drydock.yaml`: Bun SSR, port 2567, `bun run build`, `bun server/index.ts`. The game process serves both the browser assets and WebSockets. Drydock’s generated root Dockerfile can replace the equivalent example in this folder.
2. Add `BOT_SECRET` through Drydock/SSM. Use a long random secret, shared only by the game and bot services. Add `ALLOWED_ORIGINS=https://your-game-domain` and `NODE_ENV=production`.
3. Onboard the same repository as a **second service**, using `drydock-bots.yaml` for configuration. Start `bun bots/index.ts`, expose its health port 2568 internally, set `GAME_SERVER_URL=https://your-game-domain`, and set the same `BOT_SECRET`. It does not need a public domain.
4. `/healthz` is available on both services. Bot health reports allocated bots, capacity, order count, and last successful world discovery.

Drydock owns its generated root Dockerfile, workflow, and manifest. This repository keeps additional examples in `deploy/` to avoid conflicting with that ownership. The bot config is an example to apply to the second project, not a second automatically provisioned service.

## Horizontal scaling

**Game processes:** configure all instances with the same `REDIS_URL`. Each needs a unique publicly reachable `PUBLIC_ADDRESS`, such as `worker-a.game.example.com` or `game.example.com/worker-a`. The initial matchmaking request can hit any instance; the returned room reservation tells the SDK which exact instance owns the world.

An ordinary round-robin ECS target group alone is insufficient for room WebSockets. Configure Caddy/ALB/service discovery so the advertised worker hostname/path always reaches the owning task. For path routing, strip the worker prefix before forwarding. Do not advertise a private ECS address to browsers. The included Nginx example demonstrates this with two fixed workers; dynamic ECS task registration still belongs in Drydock’s infrastructure.

**Bot workers:** independently scale the same bot image/command. `BOT_WORKER_CAPACITY` defaults to 24 concurrent bots per worker. Workers discover all rooms through shared matchmaking and claim free numbered slots. The authoritative room rejects duplicate slots, so no shared bot-worker leader or replica-specific assignment is required. Additional replicas fill uncovered slots; idle replicas wait. When a worker disappears, its sockets close, the slots free, and other workers can replace them.

`BOT_TARGET` is configured on game processes and defaults to **six total active participants per occupied world**. Thus one human receives five bots; four humans receive two; six or more humans receive none. The target is clamped to 12. Raising worker count increases available fleet capacity, not the per-world population target. Bots are always marked AI.

For isolated VPC networking, bot workers can connect through the public game domain, or use `BOT_PUBLIC_ADDRESS_MAP` (a JSON object mapping each advertised worker address to its internal address). Never give browsers that internal mapping.

**Draining:** SIGTERM removes the server from new work, locks its worlds and notifies clients. `DRAIN_SECONDS` defaults to 60 in production. Configure the ECS stop timeout above that interval, and allow existing WebSockets to drain at ingress. A process-owned universe cannot migrate during a rollout; after the drain it ends. For preserving ongoing worlds during deployments, retain old tasks until their rooms empty before terminating them. This is an infrastructure policy, not automatic state migration.

## Reproducible local cluster

From the repository root:

```sh
docker compose -f deploy/compose.yaml up --build --scale bots=2
```

Open `http://localhost:8080`. This example starts Redis, two game processes, a gateway, and two independent bot workers. The example credential is local-only; replace it for deployment. Ports and routes are intentionally explicit so the room-to-worker routing is reviewable. Stop with `docker compose -f deploy/compose.yaml down`.

For a standalone game image:

```sh
docker build -f deploy/Dockerfile -t solstice .
docker run --rm -p 2567:2567 -e ALLOWED_ORIGINS=http://localhost:2567 solstice
```

The same image runs the separate bot service by overriding its command to `bun bots/index.ts` and providing its endpoint/secret/port variables.

## Environment

| Variable                 | Service        | Meaning                                                |
| ------------------------ | -------------- | ------------------------------------------------------ |
| `PORT`                   | both           | Game default 2567, bot health default 2568             |
| `REDIS_URL`              | game           | Shared presence/matchmaking; omit for a single process |
| `PUBLIC_ADDRESS`         | game           | Unique routable host[:port][/prefix], without scheme   |
| `ALLOWED_ORIGINS`        | game           | Comma-separated permitted browser origins              |
| `BOT_SECRET`             | both           | Service authentication; required for production bots   |
| `BOT_TARGET`             | game           | Total human + AI target, default 6, maximum 12         |
| `GAME_SERVER_URL`        | bots           | Matchmaking/discovery endpoint                         |
| `BOT_WORKER_CAPACITY`    | bots           | Maximum bots owned by this replica, default 24         |
| `BOT_PUBLIC_ADDRESS_MAP` | bots           | Optional public-to-internal worker route mapping       |
| `DRAIN_SECONDS`          | game           | Grace before terminating active rooms                  |
| `VITE_SERVER_URL`        | frontend build | Override only when hosting frontend separately         |

No Postgres, schema migration, S3 bucket, or durable volume is needed for the current world lifecycle.
