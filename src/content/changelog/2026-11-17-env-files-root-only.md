---
title: Env files are root-only; migrations run as their own user
date: 2026-11-17
type: Security
areas: [Self-hosting]
docs:
  - label: Configuration
    href: /self-hosting/configuration/
  - label: The security model
    href: /self-hosting/security/
---

Every file under `/etc/payment-sandbox` is `root:root` mode `0600`: systemd reads each unit's
`EnvironmentFile=` as root before dropping to the service user, so no service user can read any
of them — the schema owner's password in `migrate.env` never reaches a process the server's user
could inspect.

`payment-sandbox-migrate.service` is a one-shot with `DynamicUser=yes`: migrations run as a
throwaway user, and the runtime role `ps_app` never holds schema ownership — the split is
enforced at startup, not documented and hoped.
