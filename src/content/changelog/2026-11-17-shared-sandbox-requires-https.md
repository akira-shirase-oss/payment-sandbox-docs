---
title: A sandbox off this machine requires https — and an explicit flag
date: 2026-11-17
type: Security
areas: [CLI, SDK]
docs:
  - label: Deployment
    href: /self-hosting/deployment/
---

`sandbox-cli` and the SDK refuse a non-loopback API URL by default; a shared sandbox you run
takes `--allow-non-local` (or `PS_ALLOW_NON_LOCAL=1`). Plain `http://` to that machine is refused
even then — a sandbox key in clear text is worse than no call — and only
`--allow-plain-http`, meant for a private network you control, lifts it.

For a private certificate authority, `--ca-cert` adds a PEM file alongside the system's roots;
there is no flag that skips verification.
