# Payment Sandbox Docs — agent instructions

The docs site for [payment-sandbox](https://github.com/akira-shirase-oss/payment-sandbox), built with
Astro Starlight and deployed to Cloudflare Pages as `docs.payment-sandbox.404human.dev`. The product
repository is read-only reference for this worktree; never edit it from here.

Payment Sandbox is **simulated money**: it moves no real funds, accepts no real cards, and every page
that shows a payment must say so (`:::caution` or the `.sim-notice` style). Never imply real funds
move; never write a real-processor-shaped credential (`sk_live_…`).

## The model (same as the sibling docs sites)

- `src/content/docs/*.mdx` are the pages. Code fences carry test markers: `run=<suite>` executes,
  `output=<suite>` must match the real server (normalised), `not-run="why"` explains a block that
  cannot run. `node scripts/snippets.mjs --coverage` fails on any unmarked block.
- Suites run against a `sandbox-server` (plus `sandbox-sim`, checkout, dashboard and a webhook
  receiver) built from the product's `main` with the quick start's own commands. Hosted pages show
  `https://sandbox.example.com` (RFC 2606; the other origins are `pay.sandbox.example.com`,
  `dashboard.sandbox.example.com`, `store.sandbox.example.com`, `receiver.example.com`); the pages
  that run on this machine show `http://127.0.0.1:56080` and say so — the list lives in
  `scripts/check-urls.mjs` (`ALLOWED`) and `scripts/snippets.mjs` (`LOCAL_PAGES`, `MAPPINGS`).
  Keep them aligned.
- `src/data/openapi.json` is a **draft** authored here from `docs/API.md` and
  `crates/sandbox-server/src/routes.rs`; `scripts/check-openapi.mjs` keeps it bidirectionally in
  sync with the routes the server declares. It moves into the product repository once reviewed.
- `scripts/check.sh` is the gate before every push: node tests, the accessibility scan's self-test,
  snippet coverage, `npm run build` (internal links, CSP hashes, the output checks), no home paths
  in tracked files.

## Non-negotiables

- No secrets, real hostnames, home paths, user names, commit hashes or internal decision numbers in
  anything committed (public repo). The only real hostname allowed is
  `docs.payment-sandbox.404human.dev`. `scripts/check-dist.mjs` enforces most of this in the output.
- Every example runs in CI or carries a `not-run` reason. Never fake an output block.
- Neutral theme: Starlight tokens only, no product palette — a shared design system is coming.
- Small commits on `main`; the coordinator reviews and pushes.

## Verification

`scripts/check.sh` before every commit that touches pages, scripts or config; `npm run build`
before any commit, always.
