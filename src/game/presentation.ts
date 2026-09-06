import {
  upgradeCost,
  type Player,
  type Star,
  type WorldEvent,
} from "../../shared/types";

export function rankedPlayers(players: Player[], viewer: number) {
  const ranked = [...players]
    .filter((p) => p.connected || p.id === viewer)
    .sort((a, b) => b.stars - a.stars || b.units - a.units || a.id - b.id);
  const rows = ranked.map((p, index) => ({ ...p, rank: index + 1 }));
  return { all: rows, mine: rows.find((p) => p.id === viewer) };
}

export function starDetails(
  star: Star,
  viewer: number,
  time: number,
  players: Player[],
) {
  const owner = players.find((p) => p.id === star.owner);
  if (star.owner !== viewer)
    return {
      title: star.owner
        ? `${owner?.name ?? "Disconnected player"} · Enemy star`
        : "Neutral star",
      detail:
        star.shield > time
          ? `Protected for ${Math.ceil(star.shield - time)}s. Attack after the shield ends.`
          : `${Math.ceil(star.hp)} defense. Send units to capture; nearby enemy units cost extra.`,
    };
  return {
    title: `Your star · Level ${star.level} / ${star.maxLevel}`,
    detail:
      star.level >= star.maxLevel
        ? `Max level · This star supports ${star.maxLevel} level${star.maxLevel === 1 ? "" : "s"}. Reinforcements stay to defend.`
        : `Upgrade: ${star.upgrade} / ${upgradeCost(star)} units · Send ${upgradeCost(star) - star.upgrade} more to reach +${((star.level + 1) * 1.7).toFixed(1)}/s. Units are spent on the upgrade.`,
  };
}

export function eventMessage(
  event: WorldEvent,
  viewer: number,
  players: Player[],
) {
  const name = (id?: number) =>
    players.find((p) => p.id === id)?.name ?? "Opponent";
  if (event.kind === "upgrade" && event.owner === viewer)
    return `Upgrade complete · Level ${event.level ?? 2} · +${((event.level ?? 2) * 1.7).toFixed(1)} units/s`;
  if (event.kind === "capture") {
    if (event.owner === viewer)
      return event.other
        ? `You captured a star from ${name(event.other)}`
        : "You captured a neutral star · +1.7 units/s";
    if (event.other === viewer)
      return `${name(event.owner)} captured your star`;
  }
  if (
    event.kind === "clash" &&
    event.owner !== event.other &&
    (event.owner === viewer || event.other === viewer)
  )
    return `Fighting ${name(event.owner === viewer ? event.other : event.owner)} · Both sides lose one unit per collision`;
  return undefined;
}
