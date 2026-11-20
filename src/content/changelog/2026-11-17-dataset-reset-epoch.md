---
title: Dataset reset opens a new epoch, from the API and the dashboard
date: 2026-11-17
type: Feature
areas: [API, Dashboard]
docs:
  - label: Concepts
    href: /concepts/
  - label: The CLI
    href: /cli/
---

`POST /v1/project/reset` — and the same button in the dashboard — archives the project's whole
dataset and opens a new, empty epoch. Nothing is deleted: the earlier epoch's journal, payments
and events stay archived and inspectable, and the project's keys keep working.

The reset needs the project's slug typed as confirmation, in the CLI with `--confirm` or
interactively — a clean slate you can't trigger by accident.
