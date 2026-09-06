import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  AudioLines,
  Volume2,
  VolumeX,
  Settings2,
  X,
  Plus,
  Minus,
  Scan,
  Crosshair,
  MousePointer2,
  Hand,
  CircleHelp,
  Maximize,
  Maximize2,
  Minimize2,
  ChevronRight,
  Radio,
  Orbit,
  Sparkles,
  Triangle,
  LogOut,
  Trophy,
  Check,
  RotateCcw,
} from "lucide-react";
import { GalaxyRenderer } from "./game/Renderer";
import { Network, serverUrl } from "./game/Network";
import { HowToPlay } from "./HowToPlay";
import { rankedPlayers, starDetails, eventMessage } from "./game/presentation";
import { startAttract } from "./game/demo";
import {
  WORLD_SIZE,
  UNIT_CAP,
  factionColor,
  type WorldMeta,
  type Star,
} from "../shared/types";
function SunMark({ small = false }: { small?: boolean }) {
  return (
    <svg
      width={small ? 26 : 34}
      height={small ? 26 : 34}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="7" fill="currentColor" />
      <circle cx="20" cy="20" r="13.5" stroke="currentColor" strokeWidth=".7" />
      <path
        d="M20 0v4M20 36v4M0 20h4M36 20h4M6 6l3 3M31 31l3 3M6 34l3-3M31 9l3-3"
        stroke="currentColor"
        strokeWidth=".7"
      />
    </svg>
  );
}
function IconButton({
  children,
  label,
  onClick,
  active = false,
  className = "",
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  className?: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <span>{title}</span>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function App() {
  const mount = useRef<HTMLDivElement>(null),
    engine = useRef<GalaxyRenderer | undefined>(undefined),
    network = useRef<Network | undefined>(undefined),
    mini = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"menu" | "joining" | "playing">("menu");
  const [world, setWorld] = useState<WorldMeta>(),
    [player, setPlayer] = useState(0),
    [selected, setSelected] = useState(0),
    [hover, setHover] = useState<Star>();
  const [name, setName] = useState(
      () => localStorage.getItem("solstice-name") || "",
    ),
    [status, setStatus] = useState<"online" | "reconnecting" | "disconnected">(
      "online",
    );
  const [population, setPopulation] = useState<{
      players: number;
      worlds: number;
    } | null>(null),
    [ping, setPing] = useState(0),
    [fps, setFps] = useState(0);
  const [sound, setSound] = useState(false),
    [high, setHigh] = useState(true),
    [selectMode, setSelectMode] = useState(false),
    [settings, setSettings] = useState(false),
    [help, setHelp] = useState(false),
    [leavePrompt, setLeavePrompt] = useState(false),
    [leaderboard, setLeaderboard] = useState(false),
    [notice, setNotice] = useState(""),
    [fatal, setFatal] = useState("");
  const [pendingJoin, setPendingJoin] = useState(false);
  const [overview, setOverview] = useState(false);
  const [tips, setTips] = useState(
    () => localStorage.getItem("solstice-hide-tips") !== "true",
  );
  const [skipHelp, setSkipHelp] = useState(
    () => localStorage.getItem("solstice-skip-help") === "true",
  );
  const [activity, setActivity] = useState<string[]>([]);
  useEffect(() => {
    if (engine.current) engine.current.showTips = tips;
  }, [tips]);
  const combatNotice = useRef(0);
  const welcome = useRef<{ id: number; home: number } | undefined>(undefined),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = (message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5500);
  };
  useEffect(() => {
    if (!mount.current) return;
    try {
      const e = new GalaxyRenderer(mount.current, {
        selection: setSelected,
        order: (o) => network.current?.order(o),
        view: (v) => network.current?.view(v),
        hover: setHover,
        fps: setFps,
        feedback: toast,
        overview: setOverview,
      });
      engine.current = e;
      e.showTips = tips;
      if (import.meta.env.DEV)
        Object.defineProperty(window, "__solsticeDebug", {
          configurable: true,
          get: () => ({
            world: e.world,
            player: e.player,
            view: e.getView(),
            selected: [...e.selected],
            units: [...e.units.values()],
          }),
        });
      startAttract(e);
      return () => {
        e.dispose();
        engine.current = undefined;
      };
    } catch {
      setFatal(
        "Your browser couldn’t start WebGL. Enable hardware acceleration or try a recent version of Chrome, Edge, Firefox, or Safari.",
      );
    }
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const r = await fetch(`${serverUrl}/api/status`);
        if (r.ok && active) setPopulation(await r.json());
      } catch {
        if (active) setPopulation(null);
      }
    };
    refresh();
    const t = setInterval(refresh, 12000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (engine.current) engine.current.minimap = mini.current ?? undefined;
  }, [mode]);
  const me = world?.players.find((p) => p.id === player),
    home = world?.stars.find((s) => s.id === me?.home),
    shield = Math.max(0, Math.ceil((home?.shield ?? 0) - (world?.time ?? 0)));
  const production =
    world?.stars
      .filter((s) => s.owner === player)
      .reduce((n, s) => n + s.level * 1.7, 0) ?? 0;
  const ranking = rankedPlayers(world?.players ?? [], player);
  const leaders = ranking.all.filter((p) => p.id !== player);
  const inspected =
    hover && starDetails(hover, player, world?.time ?? 0, world?.players ?? []);
  const humans =
    world?.players.filter((p) => !p.bot && p.connected).length ?? 0;
  const toggleSound = async () => {
    const value = await engine.current?.audio.toggle();
    setSound(!!value);
  };
  const join = async () => {
    if (mode === "joining" || fatal) return;
    setMode("joining");
    setNotice("");
    setActivity([]);
    localStorage.setItem("solstice-name", name);
    const e = engine.current!;
    const n = new Network({
      world: (w) => {
        e.onDemoFrame = undefined;
        e.setWorld(w);
        setWorld(w);
        if (welcome.current) {
          const p = welcome.current;
          e.setPlayer(p.id, p.home);
          welcome.current = undefined;
        }
      },
      units: (u) => e.setUnits(u),
      welcome: (data) => {
        welcome.current = data;
        setPlayer(data.id);
        setMode("playing");
        setStatus("online");
      },
      events: (events) => {
        e.event(events);
        const messages: string[] = [];
        for (const event of events) {
          const message = eventMessage(event, e.player, e.world.players);
          if (!message) continue;
          if (event.kind === "clash") {
            if (performance.now() - combatNotice.current < 5000) continue;
            combatNotice.current = performance.now();
          } else toast(message);
          if (!messages.includes(message)) messages.push(message);
        }
        if (messages.length)
          setActivity((old) => [...messages.reverse(), ...old].slice(0, 3));
      },
      status: setStatus,
      notice: toast,
      ping: setPing,
    });
    network.current = n;
    try {
      await n.join(name.trim() || "Wanderer");
    } catch (err) {
      await n.leave();
      setMode("menu");
      toast(
        err instanceof Error
          ? `Unable to join: ${err.message}`
          : "Unable to connect. Try again.",
      );
    }
  };
  const leave = async () => {
    setLeavePrompt(false);
    await network.current?.leave();
    network.current = undefined;
    setMode("menu");
    setWorld(undefined);
    setPlayer(0);
    welcome.current = undefined;
    setStatus("online");
    if (engine.current) {
      engine.current.playing = false;
      engine.current.player = 0;
      engine.current.clearSelection();
      startAttract(engine.current);
    }
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast("Fullscreen is unavailable in this browser.");
    }
  };
  const toggleSelect = () => {
    setSelectMode((v) => {
      if (engine.current) engine.current.touchSelect = !v;
      return !v;
    });
  };
  return (
    <main
      className={`game-shell ${mode === "playing" ? "in-game" : "in-menu"}`}
    >
      <div ref={mount} className="universe" />
      <div className="vignette" />
      <header className="top-bar">
        <div className="brand">
          <SunMark small={mode === "playing"} />
          <span>SOLSTICE</span>
          <span className="brand-divider" />
          <span className="edition">
            {mode === "playing" ? "MULTIPLAYER" : "MULTIPLAYER / ALPHA"}
          </span>
        </div>
        <div className="header-right">
          <span className="live-label">
            <i />
            {mode === "playing"
              ? `${humans} / 64 PLAYERS`
              : population
                ? `${population.players} PLAYERS ONLINE`
                : "CONNECTING"}
          </span>
          <IconButton label="How to play" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
          </IconButton>
          <IconButton label="Settings" onClick={() => setSettings(true)}>
            <Settings2 size={18} />
          </IconButton>
        </div>
      </header>
      {mode !== "playing" && (
        <>
          <div className="menu-shade" />
          <section className="join-panel">
            <div className="eyebrow">
              <span className="tiny-line" /> AN ENDLESS GAME OF TERRITORY
            </div>
            <h1>
              A galaxy.
              <br />
              <span>In your hands.</span>
            </h1>
            <p className="intro">
              Begin with a star. Command a swarm of light.
              <br />
              Find your place in a living universe.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!localStorage.getItem("solstice-help-seen") && !skipHelp) {
                  setPendingJoin(true);
                  setHelp(true);
                } else join();
              }}
              className="join-form"
            >
              <label htmlFor="callsign">
                PLAYER NAME <span>NO ACCOUNT NEEDED</span>
              </label>
              <div className="name-field">
                <span className="player-spark" />
                <input
                  id="callsign"
                  name="callsign"
                  maxLength={18}
                  autoComplete="nickname"
                  placeholder="Wanderer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Your callsign"
                />
                <span className="field-index">01</span>
              </div>
              <button
                className="join-button"
                type="submit"
                disabled={mode === "joining" || !!fatal}
              >
                <span>
                  {mode === "joining"
                    ? "Finding your star…"
                    : "Join the universe"}
                </span>
                {mode === "joining" ? (
                  <Orbit className="spin" size={20} />
                ) : (
                  <ArrowRight size={21} />
                )}
              </button>
              <div className="join-footnote">
                <span>
                  <i /> INSTANT JOIN
                </span>
                <span>64 PLAYERS / WORLD</span>
              </div>
            </form>
          </section>
          <aside className="scene-caption">
            <span className="scene-cross">+</span>
            <div>
              <span className="eyebrow">THE PERSEUS EXPANSE</span>
              <p>Countless stars. One beginning.</p>
              <span className="mono text-[10px] text-slate-500">
                SIMULATED ORBIT · DRAG TO EXPLORE
              </span>
            </div>
          </aside>
          <footer className="menu-bottom">
            <div className="rule">
              <span className="rule-number">01</span>
              <div>
                <strong>GATHER</strong>
                <p>Your stars create light.</p>
              </div>
            </div>
            <div className="rule">
              <span className="rule-number">02</span>
              <div>
                <strong>COMMAND</strong>
                <p>Select a swarm. Send it anywhere.</p>
              </div>
            </div>
            <div className="rule">
              <span className="rule-number">03</span>
              <div>
                <strong>EXPAND</strong>
                <p>Capture stars. Grow your universe.</p>
              </div>
            </div>
            <button className="sound-prompt" onClick={toggleSound}>
              <AudioLines size={20} />
              <span>
                {sound ? "SOUND IS ON" : "BETTER WITH SOUND"}
                <small>
                  {sound
                    ? "The universe is listening"
                    : "An original, reactive soundscape"}
                </small>
              </span>
              <span className="sound-toggle">{sound ? "ON" : "OFF"}</span>
            </button>
          </footer>
          <div className="edge-caption">
            A SMALL LIGHT CAN CHANGE EVERYTHING.
          </div>
        </>
      )}
      {mode === "playing" && (
        <>
          <section className="empire-stats" aria-label="Your empire">
            <div>
              <span>STARS</span>
              <strong>
                {me?.stars ?? 1}
                <small> / {world?.stars.length}</small>
              </strong>
            </div>
            <div>
              <span>UNITS</span>
              <strong>
                {me?.units ?? 0}
                <small> / {UNIT_CAP.toLocaleString()}</small>
              </strong>
            </div>
            <div>
              <span>PRODUCTION</span>
              <strong>
                +{production.toFixed(1)}
                <small> / s</small>
              </strong>
            </div>
          </section>
          {tips && (
            <aside className="objective-panel">
              <button
                className="tips-close"
                aria-label="Dismiss playing tips"
                onClick={() => {
                  setTips(false);
                  localStorage.setItem("solstice-hide-tips", "true");
                }}
              >
                <X size={16} />
              </button>
              <div className="eyebrow">
                <span className="tiny-line" />
                {me?.captured ? "YOUR EXPANSE" : "FIRST LIGHT"}
              </div>
              <h2>
                {me?.captured
                  ? "Keep the light moving."
                  : "Every empire begins here."}
              </h2>
              <p>
                {me?.captured
                  ? "Reinforce your borders. Feed ringed stars to increase their production."
                  : "Tap your star to select its swarm. Then tap a dim star to capture it."}
              </p>
              {shield > 0 && (
                <div className="shield-indicator">
                  <Orbit size={14} />
                  <span>Sanctuary · {shield}s</span>
                  <small>Ends when you send units out</small>
                </div>
              )}
              <button className="text-button" onClick={() => setHelp(true)}>
                How to play <ChevronRight size={13} />
              </button>
            </aside>
          )}
          <button
            className="mobile-ranks icon-button"
            aria-label="Toggle players"
            onClick={() => setLeaderboard(!leaderboard)}
          >
            <Trophy size={17} />
          </button>
          <aside className={`leaderboard ${leaderboard ? "expanded" : ""}`}>
            <div className="board-heading">
              <span>PLAYERS</span>
              <span>
                <Orbit size={12} /> STARS
              </span>
            </div>
            {ranking.mine && (
              <div
                className="leader-row you pinned-player"
                data-testid="your-player-row"
              >
                <span className="rank">{ranking.mine.rank}</span>
                <i style={{ background: factionColor(player) }} />
                <span className="leader-name">
                  {ranking.mine.name}
                  <small>YOU</small>
                </span>
                <strong>{ranking.mine.stars}</strong>
              </div>
            )}
            <div className="player-scroll">
              {leaders.map((p) => (
                <div
                  className={`leader-row ${p.id === player ? "you" : ""}`}
                  key={p.id}
                >
                  <span className="rank">{p.rank}</span>
                  <i
                    style={{
                      background: factionColor(p.id),
                      boxShadow: `0 0 10px ${factionColor(p.id)}55`,
                    }}
                  />
                  <span className="leader-name">
                    {p.name}
                    {p.id === player && <small>YOU</small>}
                    {p.bot && <small>BOT</small>}
                    {!p.connected && <small>AWAY</small>}
                  </span>
                  <strong>{p.stars}</strong>
                </div>
              ))}
            </div>
            <div className="board-footer">
              <span>WORLD {world?.room.slice(0, 6).toUpperCase()}</span>
              <span>
                {ping} MS <i />
              </span>
            </div>
          </aside>
          <div className="minimap-panel">
            <button
              className="home-button"
              onClick={() => engine.current?.home()}
              aria-label="Home (F)"
            >
              <Crosshair size={17} />
              <span>Home</span>
              <kbd>F</kbd>
            </button>
            <div className="map-title">
              <span>GALAXY MAP</span>
            </div>
            <canvas
              ref={mini}
              width={200}
              height={200}
              aria-label="Galaxy map. Click to navigate."
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const r = e.currentTarget.getBoundingClientRect();
                engine.current?.focus(
                  ((((e.clientX - r.left) / r.width) * 200 - 12) / 176) *
                    WORLD_SIZE,
                  ((((e.clientY - r.top) / r.height) * 200 - 12) / 176) *
                    WORLD_SIZE,
                );
              }}
            />
            <div className="map-coordinates">
              {Math.round(engine.current?.cameraX ?? 0)} :{" "}
              {Math.round(engine.current?.cameraY ?? 0)}
              <button
                onClick={() => engine.current?.toggleOverview()}
                title={
                  overview ? "Return to previous view" : "View whole galaxy"
                }
                aria-label={
                  overview ? "Return to previous view" : "View whole galaxy"
                }
                aria-pressed={overview}
              >
                {overview ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          </div>
          <div className="command-area">
            <div
              className={`selection-info ${selected ? "has-selection" : ""}`}
            >
              <span className="selection-glyph">
                {selected ? (
                  <Sparkles size={15} />
                ) : (
                  <MousePointer2 size={15} />
                )}
              </span>
              {selected ? (
                <>
                  <strong>{selected}</strong> particles selected{" "}
                  <span className="selection-dot">·</span>{" "}
                  <span>Choose a destination</span>
                </>
              ) : (
                <span className="desktop-hint">
                  Drag to select <b>·</b> Click to move <b>·</b> Scroll to zoom
                </span>
              )}
              <span className="touch-hint">
                {selected
                  ? ""
                  : selectMode
                    ? "Drag around your particles"
                    : "Tap your star to select a swarm"}
              </span>
            </div>
            <div className="command-bar">
              <button
                className="command-button"
                onClick={() => engine.current?.selectAll()}
              >
                <Scan size={17} />
                <span>Select all</span>
                <kbd>A</kbd>
              </button>
              <span className="command-divider" />
              <button
                className="command-button"
                disabled={!selected}
                onClick={() => engine.current?.halfSelection()}
              >
                <Triangle size={15} />
                <span>Send half</span>
                <kbd>Q</kbd>
              </button>
              <button
                aria-label="Clear selection"
                className="command-button cancel-button"
                disabled={!selected}
                onClick={() => engine.current?.clearSelection()}
              >
                <X size={16} />
                <span>Clear</span>
                <kbd>ESC</kbd>
              </button>
              <button
                className={`command-button touch-mode ${selectMode ? "active" : ""}`}
                onClick={toggleSelect}
              >
                {selectMode ? <Scan size={17} /> : <Hand size={17} />}
                <span>{selectMode ? "Select" : "Pan"}</span>
              </button>
            </div>
          </div>
          <div className="camera-tools">
            <IconButton
              label="Return to your star (F)"
              onClick={() => engine.current?.home()}
            >
              <Crosshair size={18} />
            </IconButton>
            <div className="zoom-controls">
              <IconButton
                label="Zoom in"
                onClick={() => engine.current?.zoom(0.8)}
              >
                <Plus size={18} />
              </IconButton>
              <IconButton
                label="Zoom out"
                onClick={() => engine.current?.zoom(1.25)}
              >
                <Minus size={18} />
              </IconButton>
            </div>
            <IconButton
              label={sound ? "Mute sound" : "Enable sound"}
              onClick={toggleSound}
            >
              {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </IconButton>
          </div>
          {hover && inspected && (
            <div className="star-tooltip">
              <i style={{ background: factionColor(hover.owner) }} />
              <strong>{inspected.title}</strong>
              <span>{inspected.detail}</span>
            </div>
          )}
          <div className="activity-feed" aria-label="Battle updates">
            {activity.slice(0, 2).map((message, i) => (
              <p key={`${i}-${message}`}>{message}</p>
            ))}
          </div>
          {status === "reconnecting" && (
            <div className="connection-banner">
              <Radio className="pulse" size={16} /> Restoring your connection.
              Your empire is still alive.
            </div>
          )}
          {(me?.eliminated || status === "disconnected") && (
            <div className="defeat-backdrop">
              <section className="defeat-card">
                <SunMark />
                <div className="eyebrow">
                  {status === "disconnected"
                    ? "SIGNAL LOST"
                    : "ANOTHER DAWN AWAITS"}
                </div>
                <h2>
                  {status === "disconnected"
                    ? "Beyond the signal."
                    : "Light never ends."}
                </h2>
                <p>
                  {status === "disconnected"
                    ? "Your connection to this universe has ended. A new star is waiting."
                    : "Your last light has faded. Find a new star, and begin again."}
                </p>
                <div className="defeat-stats">
                  <div>
                    <strong>{me?.captured ?? 0}</strong>
                    <span>STARS CAPTURED</span>
                  </div>
                  <div>
                    <strong>{me?.kills ?? 0}</strong>
                    <span>PARTICLES DEFEATED</span>
                  </div>
                </div>
                <button
                  className="join-button"
                  onClick={() =>
                    status === "disconnected"
                      ? leave()
                      : network.current?.respawn()
                  }
                >
                  <span>
                    {status === "disconnected"
                      ? "Return to the universe"
                      : "Find a new beginning"}
                  </span>
                  <ArrowRight size={20} />
                </button>
              </section>
            </div>
          )}
        </>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {fatal && (
        <div className="fatal-message" role="alert">
          {fatal}
        </div>
      )}
      {settings && (
        <Modal title="YOUR UNIVERSE" onClose={() => setSettings(false)}>
          <div className="setting-row">
            <div>
              <strong>Soundscape</strong>
              <p>Ambient music and musical combat</p>
            </div>
            <button
              className={`switch ${sound ? "on" : ""}`}
              role="switch"
              aria-checked={sound}
              aria-label="Soundscape"
              onClick={toggleSound}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Stellar effects</strong>
              <p>Bloom and higher render resolution</p>
            </div>
            <button
              className={`switch ${high ? "on" : ""}`}
              role="switch"
              aria-checked={high}
              aria-label="Stellar effects"
              onClick={() => {
                setHigh(!high);
                engine.current?.setQuality(!high);
              }}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Playing tips</strong>
              <p>Show the guidance panel</p>
            </div>
            <button
              className={`switch ${tips ? "on" : ""}`}
              role="switch"
              aria-checked={tips}
              aria-label="Playing tips"
              onClick={() => {
                localStorage.setItem("solstice-hide-tips", String(tips));
                setTips(!tips);
              }}
            >
              <span />
            </button>
          </div>
          <button className="settings-action" onClick={fullscreen}>
            <Maximize size={18} /> Toggle fullscreen <ArrowRight size={16} />
          </button>
          <div className="settings-foot mono">
            {fps} FPS · {ping} MS · SOLSTICE ALPHA
          </div>
          {mode === "playing" && (
            <button
              className="settings-action leave"
              onClick={() => {
                setSettings(false);
                setLeavePrompt(true);
              }}
            >
              <LogOut size={17} /> Leave this universe <ArrowRight size={16} />
            </button>
          )}
        </Modal>
      )}
      {help && (
        <Modal
          title="HOW TO PLAY"
          className="manual-modal"
          onClose={() => {
            setHelp(false);
            setPendingJoin(false);
          }}
        >
          <h2 className="manual-title">
            One swarm. <span>Four simple moves.</span>
          </h2>
          <HowToPlay />
          <div className="manual-controls">
            <span>
              <kbd>A</kbd> Select all
            </span>
            <span>
              <kbd>Q</kbd> Select half
            </span>
            <span>
              <kbd>F</kbd> Home star
            </span>
            <span>
              <kbd>SPACE</kbd> + drag to pan
            </span>
          </div>
          <p className="manual-note">
            On touch screens, drag to pan and pinch to zoom. Switch to Select to
            draw a selection box. Your sanctuary lasts 35 seconds, ending when
            you send units out. Worlds reset after their last explorer leaves
            and the reconnect window closes.
          </p>
          <label className="skip-help">
            <input
              type="checkbox"
              checked={skipHelp}
              onChange={(e) => {
                setSkipHelp(e.target.checked);
                localStorage.setItem(
                  "solstice-skip-help",
                  String(e.target.checked),
                );
              }}
            />
            Don’t show this again
          </label>
          <button
            className="join-button"
            onClick={() => {
              localStorage.setItem("solstice-help-seen", "true");
              setHelp(false);
              if (pendingJoin) {
                setPendingJoin(false);
                join();
              }
            }}
          >
            <span>{pendingJoin ? "Start playing" : "Got it"}</span>
            <Check size={18} />
          </button>
        </Modal>
      )}
      {leavePrompt && (
        <Modal
          title="LEAVE THIS UNIVERSE?"
          onClose={() => setLeavePrompt(false)}
        >
          <p className="manual-note">
            Your stars remain vulnerable for other explorers to capture. Leaving
            gives up this empire; your next visit starts with a new star.
          </p>
          <button className="join-button" onClick={leave}>
            <span>Leave universe</span>
            <LogOut size={18} />
          </button>
          <button
            className="settings-action"
            onClick={() => setLeavePrompt(false)}
          >
            <RotateCcw size={17} /> Keep playing
          </button>
        </Modal>
      )}
    </main>
  );
}
