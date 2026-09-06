# Drydock / ECS deployment

Production: **https://solstice.dested.com** on the existing Drydock ARM ECS fleet.
The deployment has three independent ECS services: `drydock-solstice` (game + web),
`drydock-solstice-bots` (private bot worker), and `drydock-solstice-redis` (private
password-protected matchmaking). Bot health has no public domain. Redis publishes
only the box's internal port 16379; no security-group ingress was added.

## Deploy from this checkout

Drydock deploys local uploads from this checkout. The public source is at
[dested/solstice](https://github.com/dested/solstice). The root `Dockerfile` builds one image; `SOLSTICE_SERVICE=bots` selects the
bot process. The bot project's SSM environment sets that selector. Both services
run the exact same immutable image tag, independently.

```powershell
# First provision only; safe to repeat, preserves existing generated secrets.
bun deploy/drydock-bootstrap.ts

# Build the local checkout in WSL for ARM64, push through Drydock, deploy both.
bun deploy/drydock-release.ts
```

These commands use the sibling `../drydock` checkout and its configured AWS
profile. Set `DRYDOCK_DIR` to override that path. They generate shared bot/Redis
credentials directly into SSM SecureString parameters; secrets are never committed.
Bootstrap registers local-only project records and DNS without creating or writing
a GitHub repository. The release command confirms the running ECS definitions
actually use the requested image, checks public HTTPS health, and fails on rollback.

The portal remains available at `http://localhost:4400` with `bun server.ts` from
Drydock. Its **Deploy locally** button can deploy the game alone; use the release
script to update the paired bot service too. `--bots-only` updates bots to the
currently deployed game's image without rebuilding.

Current production is one game task and one bot worker. Redis is provisioned for
shared matchmaking; increasing game replicas additionally requires the routing
configuration below. Bot workers can already scale independently through ECS.
Drydock's EC2 host, Caddy and Redis remain single-instance infrastructure.

After a release, `bun deploy/live-smoke.ts` briefly joins a diagnostic player,
checks actual WebSocket particle updates and separate-service AI population, and
leaves the room. The initial live deployment passed with 26 binary frames and
five bots; both application containers passed their image health checks.

Drydock GitHub wiring normally overwrites the root Dockerfile and manifest. Do not
wire this local-only project without preserving the service selector in the
generated image. The `deploy/Dockerfile` remains the standalone/Compose example.
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
