# Home button spacing

- **Date:** 2026-09-06
- **Status:** active
- **Type:** notes
- **What:** Fix the edge-crammed Home button from the user's screenshot.

Added 10px horizontal padding, a compact 40px desktop height, non-shrinking icon, inset F key badge and keyboard focus outline. Phone touch target remains 44px. Production build passes. The existing 27-step bx navigation replay passes, including overview → Home; inspected its screenshot.

Exploratory agent hit its wall ceiling; it is not counted as verification: `tier=sonnet (escalated) ended=wall turns=34 wall=62.0s tokens=109/2495 (90932 cached) cost=$0.0458 est=$0.06`. Deterministic replay supplied the check. Deployment pending.
