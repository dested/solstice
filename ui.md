# Solstice — Visual language

## Direction

A dark, spacious galaxy with luminous faction colors and clear tactical information. Stars and swarms carry the spectacle; controls stay compact and readable. Readability of selection, ownership and numbers takes priority over bloom.

## Tokens

| Role | Current value |
| --- | --- |
| Background | `#050a14` |
| Primary text | `#d9e2eb` |
| Gold accent | `--gold: #f3cca0` |
| Muted text | `--muted: #7d91a7` |
| Divider | `--line: rgba(164, 187, 209, 0.13)` |
| Modal | `#0b1522`, border `#394958` |
| Quiet control | `#101d2a`, border `#334454`, text `#c5d4e2` |
| Selected particles | Warm white cores, retaining the faction glow |
| Faction colors | `PALETTE` / `factionColor` in `shared/types.ts` |

Space Grotesk is the body/display face (400/500/600). IBM Plex Mono is used for numeric labels, small captions and keyboard shortcuts (400/500). Both load from local font packages through `src/style.css`.

## Layout and controls

- The full-viewport Three.js canvas sits under a pointer-transparent drawing overlay; React places interactive controls above it.
- Desktop: stats across the top, dismissible guidance left, Players right, minimap bottom-left, camera controls right, orders bottom-center.
- Mobile: compact top stats, toggleable Players panel, bottom commands and pan/select mode. Preserve safe spacing between inspector, Home, minimap and command bar.
- Players always pins your row, including outside the top five; other connected players scroll beneath it. Bots have an explicit badge.
- Map labels use numbers for units/defense, production and levels. Do not restore star/player names beneath stars.
- Use existing `icon-button`, `text-button`, `join-button`, `setting-row`, `switch` and `home-button` classes. Major join actions use gold; routine navigation uses muted surfaces.
- Home: 40px desktop height, 44px phone touch target, `8px 10px` padding, 8px desktop icon gap, non-shrinking icon. Its desktop F badge is 18×18px with its own border; hide it on phones. Never let the icon or shortcut sit against the button edge.
- The minimap expand control toggles galaxy overview and the previous camera view. It is distinct from browser fullscreen in Settings.
- Preserve visible keyboard focus, accessible button names and 44px mobile controls. Disabled actions are dimmed and unavailable.

## Effects

- Procedural solar bodies and animated corona, small particle trails, restrained bloom. High quality currently uses bloom strength 0.28 and capped rendering resolution.
- Selected units get distinct white cores and larger particles; box selection has a visible border. Draw numeric backplates above selection highlights.
- Star arrivals use small brief pops; capture uses a larger localized ring and sparks. Do not make order/upgrade effects resemble a new swarm.
- At galaxy scale, playable stars get markers that separate them from decorative background dust. Star placement should not form obvious rows or columns.
- Sound is opt-in. Hits, arrivals, captures, losses and upgrades have distinct synthesized cues; rapid events are throttled.
- Respect reduced-motion and quality settings. Gameplay information must remain visible with bloom disabled.

## Components and copy

`App.tsx` owns the HUD, Players, settings and dialogs. `HowToPlay.tsx` owns the four SVG instruction cards. `presentation.ts` owns contextual repair/upgrade/defense and event descriptions. `Renderer.ts` owns canvas selection, labels, effects and minimap.

Keep in-game copy direct: “Players”, “Home”, “Repair ordered”, “Upgrade complete”. Explain spending and limits where the player makes a decision. The guide covers selection, orders, capture, repair and upgrades; keep it compact on desktop and scrollable on small screens. Keep server architecture and deployment explanations in developer documentation.

Avoid excessive glow over numbers, ambiguous chart names, full-width navigation with missing padding, hidden own-player rankings, and technical infrastructure notes in the play flow.
