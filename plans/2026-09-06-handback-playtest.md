# First playtest fixes

- **Date:** 2026-09-06
- **Status:** done
- **Type:** analysis
- **What:** Resolve Handback db40734c-e316-427f-998a-d0be38879edc and the follow-up request for simpler labels and a complete Players panel.

## Evidence reviewed

Fetched the full brief through Handback get_walkthrough (Personal space), then downloaded the complete asset list. Read all 17 contact sheets first, then the transcript/timeline, and inspected all 153 screenshots in enlarged app crops. Extracted frames from the video at 2:55–3:09 to examine the zoom/background complaint. Assets are local, ignored under artifacts/handback; no signed URLs or credentials are committed.

The frames override two report interpretations: the imagery request at 0:30 concerns the open flight manual, and the zoomed-out 'curtain' is the procedural diagonal nebula field, not an external image. The guide had been opened manually in the recording; automatic onboarding did not previously exist.

## Outcomes

| Point | Resolution |
| --- | --- |
| KP1 | Illustrated four-step manual; brighter, framed player-name/join form. |
| KP2 | First Join opens the guide before matchmaking. Completion persists across visits. Don't show again persists immediately; manual help remains available. |
| KP3 | Server is authoritative. The separate bot service supplies ordinary network clients, explicitly labeled BOT. Start-screen simulation is local. Guide explains this. |
| KP4 | Every generated coordinate scaled 2×; 13,600-square world retains ~270 stars and 64-player capacity. Updated spawn distances, bot reach, camera bounds, collision and visibility indexes. |
| KP5 | Lower selection intensity, smaller particles/trails, reduced bloom. Commands/upgrades no longer emit particles resembling a swarm. Numeric labels have dark backplates. |
| KP6 | Larger, higher-contrast Stars / Units / Production totals, including phone layout. |
| KP7 | Actual mobile touch input, pinch zoom, box selection, Players panel and viewport bounds verified. |
| KP8 | Quiet local rings; explicit upgrade completion/rate messages. Inspector shows level/max, spent/required units, and explains capped stars or protection. |
| KP9 | Subdued the zoom-revealed procedural cloud band. Separately fixed a real rendering defect: Three cached ten menu instances, silently hiding live star bodies beyond the first ten. Geometry capacity now resets on world changes and buffers reuse normal snapshots. |
| KP10 | Visible Home button next to minimap, F shortcut retained; falls back to owned stars or surviving units. |
| KP11 | Orders identify attack/reinforce/upgrade intent. Battle feed names the opponent; capture notices distinguish gains/losses. Friendly upgrade spending is explained. |
| Follow-up | Removed star/player names from map labels; show unit/defense numbers, production and levels. Right panel is Players with your row always pinned and all other connected players in a scrollable list. |

## Verification

- `bun test`: 16 tests, 55 assertions. Includes pinned rank outside top five, upgrade limits/progress, combat attribution, spacing/capacity and expanded-frontier visibility.
- `bun run test:network`: 64 clients, 65th overflow, server movement, forged ownership rejection, binary state and reconnection.
- `bun run test:browser`: desktop capture, help/onboarding/reconnect, WebGL instance count matching the full live world, Home navigation, settings; actual phone taps, pinch and selection. Uses installed Chrome.
- `bx run flows/handback-onboarding.flow.ts`: 27-step deterministic replay passed. Screenshots of guide, full galaxy, Home.
- The exploratory bx agent run stalled and was stopped; its report is not counted as verification. Replaced with the deterministic bx flow above. Existing Chrome regression covers touch/CDP that bx's current flow surface does not expose.
- `bun run build`: TypeScript and production build pass.

Deployment files and actual AWS topology are documented separately in deploy/README.md. No simulation durability or automatic routing for additional game replicas was added by this playtest pass.
