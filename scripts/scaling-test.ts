import { Client, type Room } from "@colyseus/sdk";
import { strict as assert } from "node:assert";
import type { WorldMeta } from "../shared/types";
const redis = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6387/14";
const procs: ReturnType<typeof Bun.spawn>[] = [],
  rooms: Room[] = [];
const states = new Map<string, WorldMeta>();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(
  fn: () => boolean | Promise<boolean>,
  label: string,
  seconds = 15,
) {
  const end = Date.now() + seconds * 1000;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error(`Timed out: ${label}`);
    await delay(150);
  }
}
function spawn(file: string, env: Record<string, string>) {
  const p = Bun.spawn(["bun", file], {
    env: { ...process.env, NODE_ENV: "test", DRAIN_SECONDS: "0", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  procs.push(p);
  return p;
}
function watch(r: Room) {
  rooms.push(r);
  r.onMessage("world", (s: WorldMeta) => states.set(r.roomId, s));
  for (const type of ["units", "welcome", "events", "ordered", "shutdown"])
    r.onMessage(type, () => {});
  return r;
}
async function ready(port: number) {
  try {
    return (await fetch(`http://localhost:${port}/healthz`)).ok;
  } catch {
    return false;
  }
}
try {
  spawn("server/index.ts", {
    PORT: "2571",
    REDIS_URL: redis,
    PUBLIC_ADDRESS: "localhost:2571",
  });
  spawn("server/index.ts", {
    PORT: "2572",
    REDIS_URL: redis,
    PUBLIC_ADDRESS: "localhost:2572",
  });
  await waitFor(() => ready(2571), "worker A");
  await waitFor(() => ready(2572), "worker B");
  const a = watch(
    await new Client("http://localhost:2571").joinOrCreate("universe", {
      name: "Scaling-A",
    }),
  );
  const b = watch(
    await new Client("http://localhost:2572").joinOrCreate("universe", {
      name: "Scaling-B",
    }),
  );
  assert.equal(
    a.roomId,
    b.roomId,
    "different matchmaking endpoints find the same room",
  );
  // Colyseus publishes per-process room counts asynchronously.
  await delay(1500);
  const c = watch(
    await new Client("http://localhost:2572").create("universe", {
      name: "Scaling-C",
    }),
  );
  assert.notEqual(c.roomId, a.roomId);
  await waitFor(async () => {
    const h1 = await (await fetch("http://localhost:2571/healthz")).json(),
      h2 = await (await fetch("http://localhost:2572/healthz")).json();
    return h1.rooms === 1 && h2.rooms === 1;
  }, "rooms placed across both processes");
  let denied = false;
  try {
    const rogue = await new Client("http://localhost:2571").joinById(a.roomId, {
      name: "Spoof",
      bot: true,
      token: "wrong",
      slot: 0,
    });
    await rogue.leave();
  } catch {
    denied = true;
  }
  assert.ok(denied, "bot service credentials required");
  const firstBotWorker = spawn("bots/index.ts", {
    PORT: "2573",
    GAME_SERVER_URL: "http://localhost:2571",
    BOT_WORKER_CAPACITY: "6",
  });
  spawn("bots/index.ts", {
    PORT: "2574",
    GAME_SERVER_URL: "http://localhost:2572",
    BOT_WORKER_CAPACITY: "6",
  });
  await waitFor(
    () =>
      [...states.values()].reduce(
        (n, s) => n + s.players.filter((p) => p.bot && p.connected).length,
        0,
      ) === 9,
    "two bot replicas fill exactly nine slots",
  );
  await waitFor(
    () =>
      [...states.values()].some((s) =>
        s.players.some((p) => p.bot && p.captured > 0),
      ),
    "external bots capture stars",
    25,
  );
  const workerA = await (await fetch("http://localhost:2573/healthz")).json(),
    workerB = await (await fetch("http://localhost:2574/healthz")).json();
  assert.ok(workerA.bots > 0 && workerB.bots > 0, "both bot replicas own work");
  assert.equal(
    workerA.bots + workerB.bots,
    9,
    "replicas do not overfill the population target",
  );
  firstBotWorker.kill();
  await firstBotWorker.exited;
  spawn("bots/index.ts", {
    PORT: "2573",
    GAME_SERVER_URL: "http://localhost:2571",
    BOT_WORKER_CAPACITY: "6",
  });
  await waitFor(async () => {
    try {
      const recovered = await (
        await fetch("http://localhost:2573/healthz")
      ).json();
      const surviving = await (
        await fetch("http://localhost:2574/healthz")
      ).json();
      return recovered.bots > 0 && recovered.bots + surviving.bots === 9;
    } catch {
      return false;
    }
  }, "bot slots recover after a worker restart");
  for (let i = 0; i < 4; i++)
    watch(
      await new Client("http://localhost:2572").joinById(a.roomId, {
        name: `Human-${i}`,
      }),
    );
  await waitFor(
    () =>
      states.get(a.roomId)!.players.filter((p) => p.bot && p.connected)
        .length === 0,
    "bots yield slots to humans",
  );
  await Promise.all(
    rooms.filter((r) => r.connection.isOpen).map((r) => r.leave()),
  );
  await waitFor(async () => {
    const response = await fetch("http://localhost:2571/api/status");
    return (await response.json()).worlds === 0;
  }, "empty worlds dispose despite bot services");
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: [
          "Redis matchmaking across two game processes",
          "balanced room placement",
          "bot credentials",
          "two independent bot workers",
          "atomic bot slots",
          "bots capture stars through network commands",
          "bot worker replacement",
          "human priority",
          "empty-world reset",
        ],
        botWorkers: [workerA.bots, workerB.bots],
        orders: workerA.orders + workerB.orders,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(
    rooms
      .filter((r) => r.connection.isOpen)
      .map((r) => r.leave().catch(() => {})),
  );
  for (const p of procs) p.kill();
  await Promise.all(
    procs.map(async (p) => {
      await p.exited;
      const err =
        p.stderr instanceof ReadableStream
          ? await new Response(p.stderr).text()
          : "";
      if (err && !err.includes("Bot slot unavailable"))
        console.error(err.slice(-1800));
    }),
  );
}
