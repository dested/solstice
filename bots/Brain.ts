import {
  distanceSq,
  upgradeCost,
  type WorldMeta,
  type MoveOrder,
  type Unit,
} from "../shared/types";
export type ObservedUnit = Pick<Unit, "id" | "x" | "y" | "owner" | "moving">;
// Runs only in the bot service, using exactly the snapshots a human receives.
export function planOrders(
  world: WorldMeta,
  units: ObservedUnit[],
  owner: number,
): MoveOrder[] {
  const mine = units.filter((u) => u.owner === owner),
    enemies = units.filter((u) => u.owner !== owner);
  const homes = world.stars.filter((s) => s.owner === owner),
    targets = world.stars.filter(
      (s) => s.owner !== owner && s.shield <= world.time,
    );
  const orders: MoveOrder[] = [];
  const used = new Set<number>();
  for (const home of homes) {
    const attackers = enemies.filter(
      (u) => u.moving && distanceSq(u, home) < 250 ** 2,
    ).length;
    const local = mine.filter(
      (u) => !u.moving && distanceSq(u, home) < 160 ** 2,
    );
    if (attackers > local.length + 15) {
      const reinforcements = mine
        .filter(
          (u) =>
            !u.moving && !used.has(u.id) && distanceSq(u, home) >= 160 ** 2,
        )
        .sort((a, b) => distanceSq(a, home) - distanceSq(b, home))
        .slice(0, attackers - local.length + 20);
      if (reinforcements.length) {
        reinforcements.forEach((u) => used.add(u.id));
        orders.push({
          ids: reinforcements.map((u) => u.id),
          x: home.x,
          y: home.y,
          star: home.id,
        });
      }
    }
    const idle = local.filter((u) => !used.has(u.id));
    if (idle.length < 45 || attackers > 10) continue;
    const candidates = targets
      .filter((s) => distanceSq(s, home) < 1050 ** 2)
      .map((s) => ({
        star: s,
        defenders: enemies.filter((u) => distanceSq(u, s) < 155 ** 2).length,
      }))
      .sort(
        (a, b) =>
          distanceSq(a.star, home) +
          a.defenders * 1600 +
          (a.star.owner ? 50000 : 0) -
          distanceSq(b.star, home) -
          b.defenders * 1600 -
          (b.star.owner ? 50000 : 0),
      );
    const target = candidates.find(
      (t) => idle.length > t.star.hp + t.defenders + 18,
    );
    const evolve =
      home.level < home.maxLevel &&
      idle.length > upgradeCost(home) - home.upgrade + 45 &&
      (!target || target.star.owner !== 0);
    if (evolve) {
      const chosen = idle.slice(0, upgradeCost(home) - home.upgrade);
      chosen.forEach((u) => used.add(u.id));
      orders.push({
        ids: chosen.map((u) => u.id),
        x: home.x,
        y: home.y,
        star: home.id,
      });
    } else if (target) {
      const count = Math.min(
        Math.floor(idle.length * 0.85),
        Math.ceil(target.star.hp + target.defenders + 30),
      );
      const chosen = idle.slice(0, count);
      chosen.forEach((u) => used.add(u.id));
      orders.push({
        ids: chosen.map((u) => u.id),
        x: target.star.x,
        y: target.star.y,
        star: target.star.id,
      });
    } else if (idle.length > 150) {
      const frontier = homes
        .filter((h) => h.id !== home.id)
        .sort(
          (a, b) =>
            Math.min(...targets.map((t) => distanceSq(t, a))) -
            Math.min(...targets.map((t) => distanceSq(t, b))),
        )[0];
      if (frontier && distanceSq(home, frontier) < 1800 ** 2) {
        const chosen = idle.slice(0, Math.floor(idle.length * 0.7));
        chosen.forEach((u) => used.add(u.id));
        orders.push({
          ids: chosen.map((u) => u.id),
          x: frontier.x,
          y: frontier.y,
          star: frontier.id,
        });
      }
    }
    if (orders.length >= 3) break;
  }
  return orders;
}
