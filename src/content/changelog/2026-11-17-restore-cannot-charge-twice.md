---
title: A restore cannot charge twice; the dashboard gets its own origin
date: 2026-11-17
type: Fix
areas: [Ledger, Dashboard, Self-hosting]
docs:
  - label: Backups and the restore drill
    href: /self-hosting/backups/
  - label: The security model
    href: /self-hosting/security/
---

Restoring a database older than the network's store could have re-attempted operations the
network had already settled. The reconciler now reads the network's operation list back and
resolves each gap under the operation's committed identity — the drift surfaces as
`unknown_to_server` until it settles, and no charge can replay.

The same release moved the dashboard to its own listener and origin (`PS_DASHBOARD_LISTEN` /
`PS_DASHBOARD_ORIGIN`), with Host and Origin checked against the configured name — one more
boundary that fails closed instead of trusting a forwarded header.
