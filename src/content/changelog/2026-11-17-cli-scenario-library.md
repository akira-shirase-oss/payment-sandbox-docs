---
title: 'sandbox-cli, and the seeded failure-scenario library'
date: 2026-11-17
type: Feature
areas: [CLI, Simulator]
docs:
  - label: The CLI
    href: /cli/
  - label: Failure scenarios
    href: /scenarios/
---

`sandbox-cli` covers the API from a terminal — payments, the ledger, checkout sessions, webhook
endpoints, events, reconciliation and the typed dataset reset — with honest exit statuses:
success, declined, uncertain and unreachable are different numbers, so a script can act on the
truth instead of parsing prose.

The seeded scenario library ships with it: named failures the simulated network produces on
demand — declines, lost replies, timeouts, network faults and a virtual clock that advances time
without touching journal history. `scenarios run --all --check` proves a deployment still
produces every scenario's committed trace after an upgrade.
