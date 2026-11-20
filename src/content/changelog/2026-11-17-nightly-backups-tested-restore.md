---
title: Nightly backups of both stores, and a restore that is drilled
date: 2026-11-17
type: Feature
areas: [Self-hosting, Ledger]
docs:
  - label: Backups and the restore drill
    href: /self-hosting/backups/
---

`payment-sandbox-backup.timer` writes three artifacts nightly: a live `pg_dump --format=custom`
of the database as the schema owner, a copy of the simulated network's own store taken while the
network is stopped (a payment sent in that window comes back `uncertain` and settles), and an
archive of `/etc/payment-sandbox` — secrets included, because `PS_SECRET_KEY` is what opens the
stored webhook secrets.

Restores are proven, not assumed: `scripts/restore-rehearsal.sh` restores into a fresh database
and compares a fingerprint of every table, journal digest, trigger, grant and sequence — and
checks the journal's protections on the copy itself.
