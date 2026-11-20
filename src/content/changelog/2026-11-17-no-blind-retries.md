---
title: No blind retries on money-moving calls
date: 2026-11-17
type: Improvement
areas: [CLI, SDK, API]
docs:
  - label: Concepts
    href: /concepts/
---

A request is never re-sent with a plain `POST` after an answer that may follow a commit. When a
reply is lost the operation is reported `uncertain` and retried under the **same** idempotency
key — the CLI prints the key to reuse rather than minting a fresh one, and waits cap each attempt
by what is left of the deadline instead of the whole budget every time.

The visible result: retrying is safe by construction, and a lost answer can never produce a
second charge.
