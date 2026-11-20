---
title: Money-moving calls report "unknown", never a false refusal
date: 2026-11-17
type: Fix
areas: [API, CLI]
docs:
  - label: Concepts
    href: /concepts/
  - label: Payments
    href: /payments/
---

Server errors and gateway timeouts on money-moving calls used to surface as refusals — an answer
that read "this did not happen" when it might have. They now report `uncertain`: the committed
operation's own identity says whether it landed, and reconciliation reads the simulated network
back under that same identity to settle it.

Declined stays declined; unreachable stays unreachable. Only the ambiguous case changed — it now
tells the truth.
