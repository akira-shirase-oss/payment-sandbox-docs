---
title: Checkout sessions and webhook endpoints in the SDK and CLI, plus an API reference
date: 2026-11-17
type: Feature
areas: [API, SDK, CLI, Checkout, Webhooks]
docs:
  - label: Hosted checkout
    href: /checkout/
  - label: Webhooks
    href: /webhooks/
  - label: API reference
    href: /api/reference/
---

The two surfaces that were API-only reached the tooling: `sandbox-cli checkout create`, webhook
endpoint register/list/rotate/disable from the CLI, and both surfaces in the SDK — so a test
store can drive the payer journey and the delivery loop without a single hand-written request.

The API reference is published as OpenAPI and rendered on this site with every route, its error
envelope and a place to put your own `sk_sim_…` to try it with.
