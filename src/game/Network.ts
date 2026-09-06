import { Client, type Room } from "@colyseus/sdk";
import {
  decodeUnits,
  type WorldMeta,
  type WorldEvent,
  type MoveOrder,
  type Viewport,
} from "../../shared/types";

export const serverUrl =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV
    ? `${location.protocol}//${location.hostname}:2567`
    : location.origin);
interface Hooks {
  world: (world: WorldMeta) => void;
  units: (units: ReturnType<typeof decodeUnits>) => void;
  welcome: (data: { id: number; home: number; room: string }) => void;
  events: (events: WorldEvent[]) => void;
  status: (status: "online" | "reconnecting" | "disconnected") => void;
  notice: (text: string) => void;
  ping: (ms: number) => void;
}
export class Network {
  room?: Room;
  private client = new Client(serverUrl);
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;
  constructor(private hooks: Hooks) {}
  async join(name: string) {
    this.closed = false;
    const token = sessionStorage.getItem("solstice-reconnection");
    if (token) {
      try {
        this.room = await this.client.reconnect(token);
      } catch {
        sessionStorage.removeItem("solstice-reconnection");
      }
    }
    if (!this.room)
      this.room = await this.client.joinOrCreate("universe", { name });
    if (this.closed) {
      await this.room.leave();
      return;
    }
    const room = this.room;
    room.reconnection.minUptime = 0;
    sessionStorage.setItem("solstice-reconnection", room.reconnectionToken);
    room.onMessage("world", this.hooks.world);
    room.onMessage("units", (bytes: Uint8Array) =>
      this.hooks.units(decodeUnits(bytes)),
    );
    room.onMessage("welcome", this.hooks.welcome);
    room.onMessage("events", this.hooks.events);
    room.onMessage("ordered", ({ count }: { count: number }) => {
      if (!count)
        this.hooks.notice("Order unavailable. That star may be protected.");
    });
    room.onMessage("pong", (time: number) =>
      this.hooks.ping(Math.round(performance.now() - time)),
    );
    room.onMessage("shutdown", ({ seconds }: { seconds: number }) =>
      this.hooks.notice(
        `Universe maintenance in ${seconds}s. Join a new universe after reconnecting.`,
      ),
    );
    room.onDrop(() => this.hooks.status("reconnecting"));
    room.onReconnect(() => {
      sessionStorage.setItem("solstice-reconnection", room.reconnectionToken);
      this.hooks.status("online");
    });
    room.onLeave(() => {
      if (!this.closed) {
        sessionStorage.removeItem("solstice-reconnection");
        this.hooks.status("disconnected");
      }
    });
    room.onError((_code, message) =>
      this.hooks.notice(message || "Connection error"),
    );
    this.timer = setInterval(() => {
      if (room.connection.isOpen) room.send("ping", performance.now());
    }, 2000);
    this.hooks.status("online");
  }
  order(order: MoveOrder) {
    if (this.room?.connection.isOpen) this.room.send("move", order);
  }
  view(view: Viewport) {
    if (this.room?.connection.isOpen) this.room.send("view", view);
  }
  respawn() {
    this.room?.send("respawn");
  }
  async leave() {
    this.closed = true;
    clearInterval(this.timer);
    sessionStorage.removeItem("solstice-reconnection");
    if (this.room) {
      this.room.reconnection.enabled = false;
      if (this.room.connection.isOpen) await this.room.leave();
    }
    this.room = undefined;
  }
}
