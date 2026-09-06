import { expect, test } from "bun:test";
import { Simulation } from "../shared/Simulation";
import { WORLD_SIZE } from "../shared/types";
import {
  eventMessage,
  rankedPlayers,
  starDetails,
} from "../src/game/presentation";

test("Players retains every connected player and pins you outside the top five", () => {
  const sim = new Simulation(2);
  for (let i = 0; i < 8; i++) sim.addPlayer(`Player ${i}`);
  for (const p of sim.players.values()) p.stars = p.id;
  const result = rankedPlayers([...sim.players.values()], 1);
  expect(result.all).toHaveLength(8);
  expect(result.mine?.rank).toBe(8);
  expect(result.mine?.name).toBe("Player 0");
});
test("upgrade status explains limited stars, partial progress, and protection", () => {
  const sim = new Simulation(2),
    p = sim.addPlayer("You"),
    star = sim.stars[p.home];
  star.maxLevel = 1;
  expect(starDetails(star, p.id, 0, [p]).detail).toContain("Max level");
  star.maxLevel = 3;
  star.upgrade = 18;
  expect(starDetails(star, p.id, 0, [p]).detail).toContain("Send 42 more");
  expect(starDetails(star, 2, 0, [p]).detail).toContain("Protected for 35s");
});
test("battle feedback attributes opponent and capture instead of implying friendly fire", () => {
  const sim = new Simulation(2),
    a = sim.addPlayer("You"),
    b = sim.addPlayer("Cassini", true);
  expect(
    eventMessage(
      { kind: "clash", x: 0, y: 0, owner: b.id, other: a.id },
      a.id,
      [a, b],
    ),
  ).toContain("Fighting Cassini");
  expect(
    eventMessage(
      { kind: "clash", x: 0, y: 0, owner: a.id, other: a.id },
      a.id,
      [a, b],
    ),
  ).toBeUndefined();
  expect(
    eventMessage(
      { kind: "capture", x: 0, y: 0, owner: b.id, other: a.id },
      a.id,
      [a, b],
    ),
  ).toBe("Cassini captured your star");
});
test("expanded galaxy keeps capacity and doubles the old minimum spacing", () => {
  const sim = new Simulation(42);
  expect(WORLD_SIZE).toBe(13600);
  expect(sim.stars.length).toBeGreaterThan(250);
  let min = Infinity;
  for (const a of sim.stars)
    for (const b of sim.stars)
      if (a.id !== b.id) min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
  expect(min).toBeGreaterThan(428);
  for (let i = 0; i < 64; i++) sim.addPlayer(`Player ${i}`);
  expect(new Set([...sim.players.values()].map((p) => p.home)).size).toBe(64);
});

test("enemy swarms remain visible on the expanded outer frontier without cell aliasing", () => {
  const sim = new Simulation(5),
    viewer = sim.addPlayer("You"),
    enemy = sim.addPlayer("Enemy");
  const units = [...sim.units.values()].filter((u) => u.owner === enemy.id);
  units.forEach((u, i) => {
    u.x = 12000 + (i % 5);
    u.y = 12000 + (i % 7);
  });
  const visible = sim.visible(viewer.id, {
    x: 12000,
    y: 12000,
    width: 500,
    height: 500,
  });
  expect(visible.filter((u) => u.owner === enemy.id)).toHaveLength(100);
  expect(new Set(visible.map((u) => u.id)).size).toBe(visible.length);
});
