import { expect, test } from "bun:test";
import { Simulation } from "../shared/Simulation";
import { distanceSq, TICK, type WorldMeta } from "../shared/types";
import { planOrders } from "../bots/Brain";
import { starDetails } from "../src/game/presentation";

test("reinforcements heal first, then upgrade, with one unit spent per defense point", () => {
  const s = new Simulation(35),
    p = s.addPlayer("A"),
    home = s.stars[p.home];
  home.hp = 35;
  home.maxHp = 45;
  home.maxLevel = 2;
  home.upgrade = 0;
  expect(starDetails(home, p.id, 0, [p]).detail).toContain(
    "Send 10 units to heal",
  );
  const units = [...s.units.values()].slice(0, 15);
  for (const u of units) {
    u.x = home.x + 29;
    u.y = home.y;
  }
  s.order(p.id, {
    ids: units.map((u) => u.id),
    x: home.x,
    y: home.y,
    star: home.id,
  });
  s.step(TICK);
  expect(home.hp).toBe(45);
  expect(home.upgrade).toBe(5);
  expect(units.every((u) => !s.units.has(u.id))).toBe(true);
});

test("max-level stars can be repaired and excess reinforcements remain alive", () => {
  const s = new Simulation(36),
    p = s.addPlayer("A"),
    home = s.stars[p.home];
  home.hp = 43;
  home.maxLevel = home.level;
  const units = [...s.units.values()].slice(0, 5);
  for (const u of units) {
    u.x = home.x + 29;
    u.y = home.y;
  }
  s.order(p.id, {
    ids: units.map((u) => u.id),
    x: home.x,
    y: home.y,
    star: home.id,
  });
  s.step(TICK);
  expect(home.hp).toBe(45);
  expect(home.upgrade).toBe(0);
  expect(units.filter((u) => s.units.has(u.id))).toHaveLength(3);
});

test("contact removes the colliding pair while the rest of the order keeps moving", () => {
  const s = new Simulation(33),
    a = s.addPlayer("A"),
    b = s.addPlayer("B");
  const mine = [...s.units.values()]
    .filter((u) => u.owner === a.id)
    .slice(0, 3);
  const enemy = [...s.units.values()].find((u) => u.owner === b.id)!;
  s.units.clear();
  [mine[0], mine[1], mine[2], enemy].forEach((u, i) => {
    u.x = i === 3 ? 3000 : 3000 - i * 100;
    u.y = 3000;
    u.tx = 4000;
    u.ty = 3000;
    u.star = -1;
    u.moving = true;
    s.units.set(u.id, u);
  });
  s.step(TICK);
  expect(s.units.has(mine[0].id)).toBe(false);
  expect(s.units.has(enemy.id)).toBe(false);
  const x = mine[1].x;
  for (let i = 0; i < 20; i++) s.step(TICK);
  expect(mine[1].moving).toBe(true);
  expect(mine[1].tx).toBe(4000);
  expect(mine[1].x).toBeGreaterThan(x + 95);
});

test("star arrivals emit bounded feedback without losing capture or absorption events", () => {
  const s = new Simulation(34),
    p = s.addPlayer("A");
  const target = s.stars.find((star) => !star.owner)!;
  target.hp = 3;
  target.maxLevel = 2;
  const swarm = [...s.units.values()].slice(0, 15);
  for (const u of swarm) {
    u.x = target.x + 29;
    u.y = target.y;
  }
  s.order(p.id, {
    ids: swarm.map((u) => u.id),
    x: target.x,
    y: target.y,
    star: target.id,
  });
  s.step(TICK);
  expect(s.events.filter((e) => e.kind === "impact").length).toBe(1);
  expect(s.events.filter((e) => e.kind === "capture").length).toBe(1);
  expect(s.events.filter((e) => e.kind === "absorb").length).toBe(1);
  expect(target.upgrade).toBe(12);
});

test("new humans find human neighbors even in bot-populated galaxies", () => {
  for (const seed of [1, 42, 97, 2026, 9001]) {
    const s = new Simulation(seed),
      first = s.addPlayer("Human A");
    for (let i = 0; i < 7; i++) s.addPlayer(`Bot ${i}`, true);
    const second = s.addPlayer("Human B");
    const gap = Math.sqrt(
      distanceSq(s.stars[first.home], s.stars[second.home]),
    );
    expect(gap).toBeGreaterThan(750);
    expect(gap).toBeLessThan(1900);
    expect(s.stars[second.home].shield).toBe(35);
  }
});

test("bots commit a large attack and preserve orders already in flight", () => {
  const s = new Simulation(97),
    p = s.addPlayer("Bot", true),
    foe = s.addPlayer("Human");
  const home = s.stars[p.home],
    target = s.stars[foe.home];
  home.maxLevel = home.level = 1;
  target.x = home.x + 700;
  target.y = home.y;
  target.shield = 0;
  target.hp = 28;
  const mine = [...s.units.values()].filter((u) => u.owner === p.id);
  mine.slice(0, 10).forEach((u) => {
    u.moving = true;
  });
  const world: WorldMeta = {
    time: 40,
    stars: [home, target],
    players: [...s.players.values()],
    room: "test",
    unitCount: s.units.size,
  };
  const plans = planOrders(world, mine, p.id);
  expect(plans.length).toBe(1);
  expect(plans[0].star).toBe(target.id);
  expect(plans[0].ids.length).toBe(81);
  expect(
    plans[0].ids.some((id) => mine.slice(0, 10).some((u) => u.id === id)),
  ).toBe(false);
});
