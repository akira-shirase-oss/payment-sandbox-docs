---
title: The TypeScript SDK
date: 2026-11-17
type: Feature
areas: [SDK]
docs:
  - label: The TypeScript SDK
    href: /sdk/
---

`@sandbox/sdk` gives a store the whole API in TypeScript: payments through holds, captures,
voids and refunds, checkout sessions, webhook endpoints and signed verification, balances and
journal explanations, and the dataset reset. Its constructor is where the sandbox-only contract
lives — a key that isn't `sk_sim_…`, a real processor's host, `NODE_ENV=production`, a
non-loopback URL or plain `http://` off this machine are all refused before a request exists.

The examples in the docs run as written against the product's own stack, outputs checked.
