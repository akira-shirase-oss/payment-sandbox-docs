# Payment Sandbox Docs

The documentation for [Payment Sandbox](https://github.com/akira-shirase-oss/payment-sandbox), the
simulated-money payment platform for development and CI: the quick start, payment and ledger guides,
checkout and webhooks, the CLI and TypeScript SDK, self-hosting and operations, an honest security
page, and the changelog.

**Read it at <https://docs.payment-sandbox.404human.dev>.**

> SIMULATED MONEY ONLY. Payment Sandbox moves no real funds, accepts no real cards, and never will.
> Every page that shows a payment says so.

Built with Astro Starlight, deployed to Cloudflare Pages. The product's API is documented with a
first-party [Scalar](https://github.com/scalar/scalar) reference at `/api/reference/`.

## Why this repository checks itself

Documentation that drifts from the code is worse than none, so CI checks the docs against Payment
Sandbox itself (`.github/workflows/ci.yml`), on every push and every night:

- **Every code block runs.** The pages' commands are executed in order by `scripts/snippets.mjs`
  against a `sandbox-server` built from payment-sandbox `main` with the quick start's own commands;
  the block after a command is compared with what the server actually printed (ids, times, secrets
  and hashes normalised). A block that can't run in CI — a systemd unit, a Cloudflare step — says so
  on the page (`not-run="why"`) and `node scripts/snippets.mjs --coverage` fails on any block that
  neither runs nor explains itself.
- **The API reference can't drift.** `src/data/openapi.json` is a draft OpenAPI document authored
  here from the server's real request and response shapes; CI fails when a route in
  `crates/sandbox-server/src/routes.rs` is missing from it, or when it names a route the server does
  not have (`scripts/check-openapi.mjs`). The draft is meant to move into payment-sandbox, where a
  generated spec replaces it; until then the check keeps the draft honest.
- **Nothing private leaks.** `scripts/check-privacy.mjs` drives the built site in a browser and
  fails on any third-party request; the API reference's Test Request goes only to the server the
  reader chooses, and no credential is persisted anywhere.
- **The output is scanned.** `scripts/check-dist.mjs` fails on a private machine path, a username,
  an internal decision number or an unmasked sandbox credential in anything that ships.
- **Accessibility is a gate, not a scan.** `scripts/axe-scan.check.mjs` first proves the scanner can
  find a violation, then every page passes WCAG 2.x plus best-practice rules.

## Working on it

```sh
npm install                  # Node ≥ 22.17
npm run dev                  # local preview
npm test                     # the snippet runner's own tests
npm run build                # build + every output check
node scripts/snippets.mjs    # run every example against the real stack (needs the product + its
                             # services: PostgreSQL via the product's stack.sh, on your port band)
node scripts/snippets.mjs --list         # the steps, without running them
node scripts/snippets.mjs --coverage     # count every block: run, checked output, or not-run reason
bash scripts/check.sh        # everything CI does, locally
```

The examples a reader sees use `https://sandbox.example.com`, a reserved example domain (RFC 2606);
the pages that run on this machine show `http://127.0.0.1:56080`, the server's own default. At run
time each shown address is swapped for the stack's real one (`--base` and friends map them onto a
port band), so the snippets run anywhere a Payment Sandbox does — a developer's machine in its
allotted band, CI on its own.

## Content rules

- Say what Payment Sandbox does on `main` today. Something not built yet is left out, or marked.
- Say SIMULATED MONEY on every page that shows a payment; never a real card, never real funds.
- Examples on hosted pages call `https://sandbox.example.com` (and the `*.sandbox.example.com`
  origins). A local example lives on the quick start, the CLI and SDK pages, and self-hosting —
  listed in `scripts/check-urls.mjs` — and says it's on this machine.
- Amounts are integer minor units (`4200` = USD 42.00); the pages show them as the API does.

## Deploying

Cloudflare Pages, project `payment-sandbox-docs`:

```sh
npm run build
npx -y wrangler@4.148.0 pages deploy dist --project-name payment-sandbox-docs --branch main
npm run check:live -- https://docs.payment-sandbox.404human.dev   # headers, search, the reference, the feed
```

## License

MIT, like Payment Sandbox.
