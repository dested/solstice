# Second playtest fixes

- **Date:** 2026-09-06
- **Status:** done
- **Type:** analysis
- **What:** Resolve Handback 2d444d85-856e-4eec-a7fa-592575f74c4d, add reinforcement healing, commit/push and release.

## Evidence

Fetched the full brief with Handback get_walkthrough (Personal space). Downloaded all 235 assets. Viewed all 23 contact sheets first, then read the complete transcript/report/timeline, then inspected all 207 screenshots through 52 ordered enlarged contact pages plus the full 0:36 frame. Evidence and signed download metadata remain ignored under artifacts/handback-round2.

The highlighted selection at 0:32–0:38 is the technical server/bot/demo paragraph in the manual; it is removed. The minimap request is a two-click overview/return toggle, not browser fullscreen. The blue swarm seen around 3:06 continues toward the right in later frames and belongs to the human named test at 4:31. A specific original input order cannot be reconstructed from screenshots.

## Changes and answers

| Recording | Resolution |
| --- | --- |
| 0:15–0:38 | Compact desktop guide; remove highlighted implementation paragraph. |
| 0:40–1:52 | Human arrivals favor human neighbors while retaining sanctuary and threat avoidance. |
| 0:59–1:34 | Larger/brighter units, white selection cores, stronger selection rectangle, more active solar corona. Labels draw over selection highlights. |
| 1:12; 3:17; 4:32 | Server emits bounded star-impact and arrival events. Short pops, sparks, localized capture burst, distinct synthesized hit/arrival/upgrade/gain/loss sounds. Milestone events take priority over cosmetic traffic. |
| 2:12 | Bots think roughly each second, commit 80–90% of available attack swarms when sufficient, watch expanding territory, reinforce the frontier and repair damaged stars. They leave moving orders alone. |
| 2:59–3:17 | Collision removes only the contacting pair. Regression confirms survivors keep moving toward the original destination. No reproduced stop-on-hit bug; exact recorded destination remains unknown. |
| 3:27–3:46 | Replace jittered rows with seeded irregular clustered sampling, 274 stars, 430 minimum spacing. Galaxy-scale markers distinguish game stars from background dust. |
| 4:13–4:21 | One authoritative server per universe, fixed 20 Hz simulation, 10 Hz binary position snapshots, 2 Hz metadata, 100 ms client interpolation. Not deterministic client lockstep. Gameplay positions agree across clients; purely cosmetic animation can differ. All own units are included; remote units use viewport interest/LOD. |
| 4:21–4:29 | Tips × persists; Settings can restore the panel. |
| 4:53–5:06 | Quieter Home styling. Expand toggles overview and exact previous target camera; portrait overview fits the entire world. |
| Follow-up | Reinforcements heal friendly stars first, one unit per defense point; remaining units upgrade or defend at maximum level. Inspector, order feedback, guide and bots understand repairs. |

## Verification

- Production TypeScript/Vite build passes.
- 22 tests / 90 assertions pass, including healing, continued movement after contact, spawn proximity and bot commitment.
- 64-client network regression passes; extra client creates a second room. Two independent clients receive the same moving-unit coordinates in at least three snapshots.
- Desktop/390×844 touch regression passes: selection/capture, reload reconnect, tip dismissal persistence, overview return, portrait whole-world fit, real pinch and box selection, audio/effects switches, no JavaScript/WebGL errors.
- Existing bx onboarding flow passes 27 steps. Exploratory bx agent did not complete: `tier=sonnet (escalated) ended=wall turns=57 wall=92.3s tokens=155/2563 (167936 cached) cost=$0.0597 est=$0.10`. Deterministic browser checks provide the proof; this run is not claimed as a pass.
- Dedicated round-two bx replay passes 33 steps, including tip restoration from Settings. Use `bx --profile solstice-round2 --headless run flows/handback-round2.flow.ts` to isolate it from other browser work. Initial default-profile attempts hit camera timeouts and a tab replacement; the isolated run completed in 9.5 seconds.
- Private GitHub remote: https://github.com/dested/solstice; implementation e70e221 pushed to master.
- Drydock release: image `local-e70e221`, digest `sha256:c2ee7326c41926ada824b319bfcdf6be8dd1d76c5fd0fc8dd9e58b18975995ef`. Game revision 4 and bot revision 4 both COMPLETED, one running task each. Live HTTPS and Colyseus smoke passed (21 binary frames, 274 stars, two joined bots). Diagnostic player left; zero worlds remained.
- Posted the full report, answers, commit link and four uploaded proof screenshots to Handback for human review. The walkthrough is in review, not marked resolved.

Real phone hardware, subjective speaker playback and production task-density load testing remain outside the completed checks. Current ECS deployment uses one game task and one host; independent bot tasks and Redis-backed matchmaking exist, but automatic per-worker ingress routing and durable world migration do not.
