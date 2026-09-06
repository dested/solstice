# Home button spacing

- **Date:** 2026-09-06
- **Status:** done
- **Type:** notes
- **What:** Fix the edge-crammed Home button from the user's screenshot.

Added 10px horizontal padding, a compact 40px desktop height, non-shrinking icon, inset F key badge and keyboard focus outline. Phone touch target remains 44px. Production build passes. The existing 27-step bx navigation replay passes, including overview → Home; inspected its screenshot.

Exploratory agent hit its wall ceiling; it is not counted as verification: `tier=sonnet (escalated) ended=wall turns=34 wall=62.0s tokens=109/2495 (90932 cached) cost=$0.0458 est=$0.06`. Deterministic replay supplied the check. Existing desktop/touch browser regression also passed and the 390px mobile screenshot was inspected.

Implementation a6a9fd1 is pushed and deployed as local-a6a9fd1. Game and bots revision 5 are stable; HTTPS health passes. Live stylesheet index-BeYyvWNI.css verified. Direct production measurement confirms 8px 10px padding, 40px height, 18px shortcut badge and 11px right inset. Screenshot artifacts/production-home-final.png inspected; no console errors; diagnostic player left cleanly.

Deployment verifier incident: an exploratory bx agent navigated to unrelated localhost:3000 and attempted signup (422) and login (401). It was stopped; no successful signup/login observed. Final checks used direct bx against the verified production URL. User informed. Avoid further exploratory agents for this browser workflow; use isolated deterministic checks.
