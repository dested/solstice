import { expect, test } from "bun:test";
import { Simulation } from "../shared/Simulation";
import { planOrders } from "../bots/Brain";
import { botRoute } from "../bots/routing";
test("bot planning uses owned units and pursues a reachable neutral star", () => {
  const s = new Simulation(97),
    p = s.addPlayer("Bot", true);
  const world = {
    time: s.time,
    stars: s.stars,
    players: [...s.players.values()],
    room: "test",
    unitCount: s.units.size,
  };
  const plans = planOrders(world, [...s.units.values()], p.id);
  expect(plans.length).toBeGreaterThan(0);
  expect(
    plans.flatMap((p) => p.ids).every((id) => s.units.get(id)?.owner === p.id),
  ).toBe(true);
  expect(s.stars[plans[0].star!].owner).toBe(0);
});
test("bot public-address remapping preserves room path and session query", () => {
  expect(
    botRoute(
      new URL("ws://localhost:8080/worker-a/process/room?sessionId=abc"),
      { "localhost:8080/worker-a": "http://game-a:2567" },
    ),
  ).toBe("ws://game-a:2567/process/room?sessionId=abc");
  expect(
    botRoute(new URL("wss://game.example/worker-b/p/r"), {
      "game.example/worker-b": "https://internal.example",
    }),
  ).toBe("wss://internal.example/p/r");
  expect(botRoute(new URL("http://gateway/matchmake/join"), {})).toBe(
    "http://gateway/matchmake/join",
  );
});
test("abandonment grace starts when leaving, not when the empire was founded", () => {
  const s = new Simulation(4),
    p = s.addPlayer("Veteran");
  s.time = 3600;
  s.abandon(p.id);
  s.step(2);
  expect(s.players.has(p.id)).toBe(true);
  s.time += 601;
  s.step(2);
  expect(s.players.has(p.id)).toBe(false);
});
