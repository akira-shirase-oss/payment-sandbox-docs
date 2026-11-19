#!/usr/bin/env node
// Runs the docs' examples against a real Payment Sandbox and fails on any difference from what the
// pages show. The examples live in the MDX itself:
//
//   ```sh run=quickstart                  a command, run in order in one bash session per suite
//   ```sh run=cli exit=1                  a command the page shows failing: it must end with that status
//   ```sh run=cli stderr=1                its standard error is part of its output (an `error:` line)
//   ```text output=ops match=lines        a stream: every line shown must arrive, in any order
//   ```http output=quickstart             what the command before it prints; compared after
//                                          normalising ids, times, secrets and hashes
//   ```sh title="receiver.mjs" run=webhooks file=receiver.mjs   written to receiver.mjs in the current directory
//   {/* snippet webhooks: snippets/receiver.sh */}   a script sourced at that point
//
// Every suite runs in one bash session, in the order of SUITES (later suites use what earlier ones
// export, such as PS_API_KEY); a page's blocks run in document order. A block with
// `step=NAME` in its info string can be left out with `--skip NAME`.
//
//   node scripts/snippets.mjs                       check every suite (CI: the quick start's own
//                                                   install block brings the stack up, PostgreSQL
//                                                   included, with Docker Compose)
//   node scripts/snippets.mjs --base http://127.0.0.1:58660 --skip stack,install
//                                                   against a stack already running elsewhere,
//                                                   on your own port band
//   node scripts/snippets.mjs --update ...          write what ran into the pages' output blocks
//   node scripts/snippets.mjs --list                print the steps without running them
//   node scripts/snippets.mjs --coverage            count every code block: run, a checked output,
//                                                   or `not-run="reason"`; fails on any other block
//
// Addresses. Hosted pages show https://sandbox.example.com, a reserved domain (RFC 2606), with the
// hosted checkout at https://pay.sandbox.example.com and the dashboard at
// https://dashboard.sandbox.example.com. The pages that run on this machine show the server's own
// default addresses: http://127.0.0.1:56080 (the API), :56081 (the simulated network), :56082 (the
// development store), :56083 (the checkout), :56084 (the dashboard), :56100 (a webhook receiver) —
// the same ports the product's docs and defaults use. PostgreSQL is not mapped: `stack.sh env`
// prints its real address (127.0.0.1:56432 locally) for both shown and run text.
//
// At run time each shown address is swapped for the real one: --base for the API and --sim,
// --store, --checkout, --dashboard and --receiver for the others (defaults: the base port + 1, +2,
// +3, +4 and +20), so a developer's allotted port band is honoured and the outputs compare equal
// either way. The environment the suite's own bash session starts with sets the matching PS_*
// variables (PS_LISTEN, PS_SIM_LISTEN, PS_CHECKOUT_LISTEN, ...), so the servers the examples start
// bind the band addresses while the page keeps showing the product's defaults — a reader on a free
// machine runs exactly what the page shows.
//
// A block that can't run here (a systemd unit, a Cloudflare step, a shape rather than a command)
// says so in its info string, `not-run="why"`, so the gap is counted and visible, never silent. One
// that could run but isn't wired up yet says `not-run="todo: why"`, and is counted apart.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DOCS = join(ROOT, 'src/content/docs');
/**
 * The address pages show. Examples use https://sandbox.example.com, a domain reserved for examples
 * (RFC 2606); the local pages show http://127.0.0.1:56080, the API's own default listen address,
 * where the reader really runs it. The checkout and dashboard, separate origins, have their own
 * shown names on hosted pages and their own ports on the local ones.
 */
export const EXAMPLE_BASE = 'https://sandbox.example.com';
const DEFAULT_BASE = 'http://127.0.0.1:56080';
/** The other local addresses pages show: sim, dev store, checkout, dashboard, webhook receiver. */
const SHOWN_SIM = 'http://127.0.0.1:56081';
const SHOWN_STORE = 'http://127.0.0.1:56082';
const SHOWN_CHECKOUT = 'http://127.0.0.1:56083';
const SHOWN_DASHBOARD = 'http://127.0.0.1:56084';
const SHOWN_RECEIVER = 'http://127.0.0.1:56100';
/** The hosted forms of the other origins, on reserved example names. */
const EXAMPLE_CHECKOUT = 'https://pay.sandbox.example.com';
const EXAMPLE_DASHBOARD = 'https://dashboard.sandbox.example.com';
const EXAMPLE_STORE = 'https://store.sandbox.example.com';
const EXAMPLE_RECEIVER = 'https://receiver.example.com';
const LOCAL_PAGES = /content\/docs\/(quick-start|payments|ledger|checkout|webhooks|scenarios|cli|sdk)\.mdx$|content\/docs\/self-hosting\//;
/** The address a page shows its examples with. */
export const shownBase = (file) => (LOCAL_PAGES.test(file ?? '') ? DEFAULT_BASE : EXAMPLE_BASE);
/** Suites in the order they run; later suites build on the state earlier ones leave. */
const SUITES = ['quickstart', 'payments', 'ledger', 'checkout', 'webhooks', 'scenarios', 'cli', 'sdk', 'ops'];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
	const at = args.indexOf(`--${name}`);
	return at === -1 ? fallback : args[at + 1];
};
const base = option('base', DEFAULT_BASE);
const derive = (offset) => {
	const url = new URL(base);
	url.port = String(Number(url.port || (url.protocol === 'https:' ? 443 : 80)) + offset);
	return url.origin;
};
const simBase = option('sim', derive(1));
const storeBase = option('store', derive(2));
const checkoutBase = option('checkout', derive(3));
const dashboardBase = option('dashboard', derive(4));
const receiverBase = option('receiver', derive(20));
const skip = new Set((option('skip', '') || '').split(',').filter(Boolean));
const only = option('suite', '');
const workdir = resolve(option('cwd', join(ROOT, '.snippets/work')));

/** The host:port form a flag like --listen takes: no scheme, but the same shown address. */
const hostPort = (url) => new URL(url).host;

/** A {shown, real} pair; real may be a string or a thunk read at call time (tests pass their own). */
const realOf = ({ real }) => (typeof real === 'function' ? real() : real);

/**
 * Full-URL shown→real pairs, longest first. Hosted pages name the extra origins on the reserved
 * example names (the sandbox only delivers webhooks to loopback, so the "hosted" receiver is
 * pretend and maps to the band like everything else); the local pages show the product's defaults.
 */
export const MAPPINGS = [
	{ shown: EXAMPLE_BASE, real: () => base },
	{ shown: EXAMPLE_CHECKOUT, real: () => checkoutBase },
	{ shown: EXAMPLE_DASHBOARD, real: () => dashboardBase },
	{ shown: EXAMPLE_STORE, real: () => storeBase },
	{ shown: EXAMPLE_RECEIVER, real: () => receiverBase },
	{ shown: SHOWN_SIM, real: () => simBase },
	{ shown: SHOWN_STORE, real: () => storeBase },
	{ shown: SHOWN_CHECKOUT, real: () => checkoutBase },
	{ shown: SHOWN_DASHBOARD, real: () => dashboardBase },
	{ shown: SHOWN_RECEIVER, real: () => receiverBase },
	{ shown: DEFAULT_BASE, real: () => base },
];
/** The pairs whose host:port and bare-port forms are also rewritten: loopback only — an https
 *  origin's bare port is empty, and a bare `sandbox.example.com` would match inside
 *  `pay.sandbox.example.com`. */
const localOf = (mappings) => mappings.filter(({ shown }) => new URL(shown).hostname === '127.0.0.1');

/** Project slugs are unique per installation and the dataset outlives a run, so the page's `my-store`
 *  runs as a fresh slug each time — a second run would otherwise hit the taken-slug `409`. */
const SHOWN_SLUG = 'my-store';
const RUN_SLUG = `my-store-${process.pid}`;

/**
 * A block's code as it runs: the example domains and every shown local address becomes the stack's.
 * Full URLs first, then the host:port forms (`PS_LISTEN=127.0.0.1:56080`, `Origin: ...:56083`), then
 * the bare ports whole-word (`PS_WEBHOOK_PORTS=56100`, `RECEIVER_PORT 56100`) — ordered longest-
 * first so no replacement produces a later search string. Ports like 56080 could collide with an
 * amount in prose, but only code blocks are rewritten, and an amount of exactly a shown port's
 * minor units is one the docs simply never use.
 */
export const runnable = (code, mappings = MAPPINGS, slug = RUN_SLUG) => {
	let out = code;
	for (const entry of mappings) out = out.replaceAll(entry.shown, realOf(entry));
	for (const entry of localOf(mappings)) out = out.replaceAll(hostPort(entry.shown), hostPort(realOf(entry)));
	for (const entry of localOf(mappings)) out = out.replace(new RegExp(`\\b${new URL(entry.shown).port}\\b`, 'g'), new URL(realOf(entry)).port);
	return out.replaceAll(SHOWN_SLUG, slug);
};

// ---------------------------------------------------------------- reading the pages

function mdxFiles(dir) {
	return readdirSync(dir)
		.flatMap((name) => {
			const path = join(dir, name);
			return statSync(path).isDirectory() ? mdxFiles(path) : path.endsWith('.mdx') ? [path] : [];
		})
		.sort();
}

// The indent is spaces and tabs only: `\s` would let a match start on the blank line before a fence and
// then look for a closing fence after a blank line too, swallowing the blocks in between.
const FENCE = /^([ \t]*)(`{3,})([\w-]*)([^\n]*)\n([\s\S]*?)\n\1\2[ \t]*$/gm;
/** Every fenced block in a page's text: `[indent, fence, lang, info, body]` per match. */
export const fences = (text) => [...text.matchAll(FENCE)];
const COMMENT = /\{\/\*\s*snippet\s+([\w-]+):\s*(\S+)((?:\s+[^\s*]\S*)*)\s*\*\/\}/g;
// A key starts the info string or follows a space, so `run=` never matches inside `not-run=`.
const meta = (text, key) => text.match(new RegExp(`(?:^|\\s)${key}=("([^"]*)"|\\S+)`))?.[2] ?? text.match(new RegExp(`(?:^|\\s)${key}=(\\S+)`))?.[1];

/** Every step of every suite, in document order. */
function readSteps() {
	const steps = [];
	for (const file of mdxFiles(DOCS)) {
		const text = readFileSync(file, 'utf8');
		const found = [];
		for (const match of text.matchAll(FENCE)) {
			const [, indent, , lang, info, body] = match;
			const run = meta(info, 'run');
			const output = meta(info, 'output');
			if (!run && !output) continue;
			const code = body
				.split('\n')
				.map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
				.join('\n');
			found.push({ at: match.index, kind: run ? 'run' : 'output', suite: run ?? output, lang, info, code, file, start: match.index, end: match.index + match[0].length, indent });
		}
		for (const match of text.matchAll(COMMENT)) {
			found.push({ at: match.index, kind: 'script', suite: match[1], path: match[2], args: (match[3] ?? '').trim(), file });
		}
		found.sort((a, b) => a.at - b.at);
		for (const step of found) {
			if (step.kind === 'output') {
				const previous = steps.findLast((candidate) => candidate.suite === step.suite);
				if (!previous || previous.kind !== 'run' || previous.expect) throw new Error(`${relative(ROOT, file)}: an output block with no command before it`);
				previous.expect = step;
			} else {
				steps.push(step);
			}
		}
	}
	for (const step of steps) if (!SUITES.includes(step.suite)) throw new Error(`${relative(ROOT, step.file)}: unknown suite "${step.suite}"`);
	return steps;
}

// ---------------------------------------------------------------- normalising output

/** Split `curl -i` output into its head and body; anything else is all body. */
function split(text) {
	const normal = text.replace(/\r\n/g, '\n');
	if (/^HTTP\/[\d.]+ \d{3}/.test(normal)) {
		const at = normal.indexOf('\n\n');
		return at === -1 ? { head: normal.trimEnd(), body: '' } : { head: normal.slice(0, at), body: normal.slice(at + 2) };
	}
	return { head: null, body: normal };
}

/** JSON bodies are compared by value, and shown indented. */
function jsonBody(body) {
	const trimmed = body.trim();
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
	try {
		return JSON.parse(trimmed);
	} catch {
		return null;
	}
}

/** A JSON body indented, with every number exactly as the server wrote it (`45.0` stays `45.0`). */
function indent(body) {
	try {
		const exact = JSON.parse(body.trim(), (key, value, context) => (typeof value === 'number' ? JSON.rawJSON(context.source) : value));
		return JSON.stringify(exact, null, 2);
	} catch {
		return null;
	}
}

/**
 * A credential the API shows exactly once (a project key, a webhook secret, a checkout session's
 * client secret). Never committed — the page writes `sk_sim_…`, and normalise() maps the real value
 * to the same elision so the comparison still proves the field was there and shaped right.
 */
const SECRET = /\b((?:sk|whsec|cs)_sim_)[0-9a-z]{8,}\b/g;
const mask = (text) => text.replace(SECRET, '$1…');

/** What the page shows: headers as they came, a JSON body indented, local addresses as the page writes them, secrets elided. */
export function display(text, file) {
	const local = LOCAL_PAGES.test(file ?? '');
	let swapped = text.replaceAll(RUN_SLUG, SHOWN_SLUG);
	for (const entry of MAPPINGS) swapped = swapped.replace(new RegExp(escape(realOf(entry)), 'g'), local ? shownLocalOf(entry.shown) : hostedOf(entry.shown));
	const { head, body } = split(swapped);
	const json = jsonBody(body);
	const shownBody = json === null ? mask(body.trimEnd()) : (indent(mask(body)) ?? JSON.stringify(json, null, 2));
	return head === null ? shownBody : shownBody === '' ? mask(head) : `${mask(head)}\n\n${shownBody}`;
}

/** What a local page shows for an origin whose real address was substituted. */
const shownLocalOf = (shown) => (shown === EXAMPLE_BASE ? DEFAULT_BASE : shown === EXAMPLE_CHECKOUT ? SHOWN_CHECKOUT : shown === EXAMPLE_DASHBOARD ? SHOWN_DASHBOARD : shown === EXAMPLE_STORE ? SHOWN_STORE : shown === EXAMPLE_RECEIVER ? SHOWN_RECEIVER : shown);

/** The hosted form of a shown address: the API and the extra origins on their example names. */
const hostedOf = (shown) =>
	shown === DEFAULT_BASE || shown === EXAMPLE_BASE
		? EXAMPLE_BASE
		: shown === SHOWN_CHECKOUT || shown === EXAMPLE_CHECKOUT
			? EXAMPLE_CHECKOUT
			: shown === SHOWN_DASHBOARD || shown === EXAMPLE_DASHBOARD
				? EXAMPLE_DASHBOARD
				: shown === SHOWN_STORE || shown === EXAMPLE_STORE
					? EXAMPLE_STORE
					: shown === SHOWN_RECEIVER || shown === EXAMPLE_RECEIVER
						? EXAMPLE_RECEIVER
						: shown;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What is compared: values that differ on every run become placeholders. */
export function normalise(text) {
	let swapped = text.replaceAll(RUN_SLUG, SHOWN_SLUG);
	for (const entry of MAPPINGS) swapped = swapped.replace(new RegExp(escape(realOf(entry)), 'g'), `<${name(entry.shown)}>`);
	for (const { shown } of MAPPINGS) swapped = swapped.replaceAll(shown, `<${name(shown)}>`);
	swapped = swapped.replaceAll(workdir, '<work>');
	const { head, body } = split(swapped);
	const json = jsonBody(body);
	const flatBody = json === null ? body.trim() : JSON.stringify(json);
	const all = mask(`${head ?? ''}\n\n${flatBody}`)
		.replace(/"(id|payment_id|session|client_secret|secret|cursor|next_before|next_cursor|idempotency_key)":\s*"(cs_|whsec_)?[^"]*?"/g, '"$1":"<id>"')
		.replace(/"(generation|next_after)":\s*"[^"]*?"/g, '"$1":"<id>"') // the database's restore generation, sealed cursors
		.replace(/\bcli_[a-z]+\b/g, 'cli_<key>') // the CLI's generated idempotency keys
		.replace(/\bsimnet_[0-9a-f]+\b/g, 'simnet_<ref>') // the simulated network's own operation ref
		.replace(/\bin \d+m?s\b/g, 'in <n>ms') // npm's "added 1 package … in 128ms"
		.replace(/"(created_at|since_beat_ms|finished_at|dataset_epoch|from_epoch|to_epoch|archived_payments|now_seconds|seq|expires_in|attempts_left|line_count)":\s*\d+/g, '"$1":<n>')
		.replace(/^#\d+/gm, '#<n>') // journal entry numbers in the CLI's words
		.replace(/\b[0-9a-f]{64}\b/g, '<hex64>') // generated keys (openssl rand -hex 32), raw secrets
		.replace(/"(finished_at|expires_at|created_at|circuit_open_until)":\s*"?\d{4}-?\d\d-?\d\d[^",\s]*"?/g, '"$1":"<time>"')
		.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<uuid>')
		.replace(/\b[0-9a-f]{32}\b/g, '<hex32>')
		.replace(/sha256:[0-9a-f]{64}/g, 'sha256:<hash>')
		.replace(/\b[0-9a-f]{40}\b/g, '<commit>')
		.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>')
		.replace(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:?\d\d)?/g, '<time>')
		.replace(/^date: .*$/gim, 'date: <date>')
		.replace(/^content-length: \d+$/gim, 'content-length: <n>')
		.replace(/^retry-after: \d+$/gim, 'retry-after: <seconds>')
		.replace(/^sandbox-signature: .*$/gim, 'sandbox-signature: <sig>')
		.replace(/\(commit [^,)]+, built \d{4}-\d\d-\d\d\)/g, '(commit <commit>, built <day>)')
		.replace(/[ \t]+$/gm, '');
	return all.trim();
}

const name = (shown) =>
	shown === EXAMPLE_BASE || shown === DEFAULT_BASE
		? 'base'
		: shown === SHOWN_CHECKOUT || shown === EXAMPLE_CHECKOUT
			? 'checkout'
			: shown === SHOWN_DASHBOARD || shown === EXAMPLE_DASHBOARD
				? 'dashboard'
				: shown === SHOWN_SIM
					? 'sim'
					: shown === SHOWN_STORE || shown === EXAMPLE_STORE
						? 'store'
						: 'receiver';

/**
 * Whether what ran matches the page's output block. Normally the whole normalised text must be equal. With
 * `match=lines` (a stream, whose frames a server may merge or add to), every line the page shows must be
 * among the lines that arrived, in any order: the page shows real frames, and losing one still fails.
 */
export function matches(actual, expect) {
	if (meta(expect.info ?? '', 'match') !== 'lines') return normalise(actual) === normalise(expect.code);
	const seen = new Set(normalise(actual).split('\n'));
	return normalise(expect.code)
		.split('\n')
		.filter((line) => line.trim() !== '')
		.every((line) => seen.has(line));
}

// ---------------------------------------------------------------- running a suite

function runAll(steps) {
	const dir = join(ROOT, '.snippets', 'run');
	mkdirSync(dir, { recursive: true });
	mkdirSync(workdir, { recursive: true });
	// Aliases work as in an interactive shell (the CLI page defines one), so each block is sourced
	// from its own file: a later line sees what an earlier one defined.
	const lines = [
		'set -euo pipefail',
		'shopt -s expand_aliases',
		// However the run ends — a failing step, an early stop — the servers and handlers it
		// started are its own children; reap them so a stopped suite never leaves a stale port.
		"trap 'kill $(jobs -p) 2>/dev/null || true' EXIT",
		`cd ${JSON.stringify(workdir)}`,
		`export BASE=${JSON.stringify(base)}`,
		`export SIM_BASE=${JSON.stringify(simBase)}`,
		`export CHECKOUT_BASE=${JSON.stringify(checkoutBase)}`,
		`export DASHBOARD_BASE=${JSON.stringify(dashboardBase)}`,
		`export RECEIVER_BASE=${JSON.stringify(receiverBase)}`,
		`export SNIPPET_HOME=${JSON.stringify(workdir)}`,
		// The band, in the product's own variables: the servers the examples start bind these,
		// while the page keeps showing the defaults a reader would use.
		`export PS_LISTEN=${JSON.stringify(hostPort(base))}`,
		`export PS_SIM_LISTEN=${JSON.stringify(hostPort(simBase))}`,
		`export PS_SIM_URL=${JSON.stringify(simBase)}`,
		`export PS_CHECKOUT_LISTEN=${JSON.stringify(hostPort(checkoutBase))}`,
		`export PS_CHECKOUT_ORIGIN=${JSON.stringify(checkoutBase)}`,
		`export PS_DASHBOARD_LISTEN=${JSON.stringify(hostPort(dashboardBase))}`,
		`export PS_DASHBOARD_ORIGIN=${JSON.stringify(dashboardBase)}`,
		`export PS_WEBHOOK_PORTS=${JSON.stringify(new URL(receiverBase).port)}`,
		`export PS_API_URL=${JSON.stringify(base)}`,
	];
	steps.forEach((step, index) => {
		const out = join(dir, `${index}.out`);
		const marker = `echo "=== step ${index}: ${relative(ROOT, step.file)}" >&2`;
		if (step.kind === 'script') {
			// A script may read what the command before it printed, as $SNIPPET_LAST.
			const last = steps.slice(0, index).findLast((earlier) => earlier.kind === 'run' && !meta(earlier.info, 'file'));
			const lastOut = last ? join(dir, `${steps.indexOf(last)}.out`) : '/dev/null';
			lines.push(marker, `export SNIPPET_LAST=${JSON.stringify(lastOut)}`, `source ${JSON.stringify(join(ROOT, step.path))}${step.args ? ` ${step.args}` : ''}`);
			return;
		}
		const code = runnable(step.code);
		const file = meta(step.info, 'file');
		if (file) {
			lines.push(marker, `cat > ${JSON.stringify(file)} <<'DOCS_SNIPPET_EOF'`, code, 'DOCS_SNIPPET_EOF');
			return;
		}
		if (skip.has(meta(step.info, 'step') ?? '')) {
			lines.push(`echo "=== step ${index}: skipped (${meta(step.info, 'step')})" >&2`);
			return;
		}
		const source = join(dir, `${index}.sh`);
		writeFileSync(source, `${code}\n`);
		// `exit=N`: a command the page shows failing; it must end with that status. `stderr=1`: what
		// it prints on standard error is part of its output too (an `error:` line, a summary).
		const expected = meta(step.info, 'exit');
		const streams = meta(step.info, 'stderr') === '1' ? ' 2>&1' : '';
		if (expected === undefined) {
			lines.push(marker, `source ${JSON.stringify(source)} > ${JSON.stringify(out)}${streams}`);
		} else {
			lines.push(
				marker,
				'set +e',
				`source ${JSON.stringify(source)} > ${JSON.stringify(out)}${streams}`,
				'__status=$?',
				'set -e',
				`[[ $__status == ${Number(expected)} ]] || { echo "step ${index}: exit $__status, the page says ${Number(expected)}" >&2; cat ${JSON.stringify(out)} >&2; exit 1; }`,
			);
		}
	});
	const script = join(dir, 'suite.sh');
	writeFileSync(script, `${lines.join('\n')}\n`);
	const result = spawnSync('bash', [script], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
	if (result.status !== 0) {
		console.error(`snippets: the run stopped (exit ${result.status}); its script is ${relative(ROOT, script)}`);
		return false;
	}
	let ok = true;
	steps.forEach((step, index) => {
		if (step.kind !== 'run' || !step.expect) return;
		// A step skipped this run leaves no .out; its output stays unchecked rather than "empty".
		if (skip.has(meta(step.info, 'step') ?? '')) return;
		const outFile = join(dir, `${index}.out`);
		// A suite that stopped early leaves no .out for the steps it never reached — count them
		// as differences (the run already failed) instead of crashing on the missing file.
		const actual = statSync(outFile, { throwIfNoEntry: false }) ? readFileSync(outFile, 'utf8') : '';
		step.actual = actual;
		// Masking maps a real credential to its elision on BOTH sides, so a block written before a
		// mask existed would match while still leaking the secret. The page must never carry one.
		if (SECRET.test(step.expect.code)) {
			ok = false;
			console.error(`snippets: ${relative(ROOT, step.file)}: an output block carries an unmasked credential — write ${'sk|whsec|cs'}_sim_… instead`);
		}
		if (!matches(actual, step.expect)) {
			ok = false;
			console.error(`\nsnippets: ${relative(ROOT, step.file)}: the output differs from the page for:\n${step.code}\n--- the page (normalised)\n${normalise(step.expect.code)}\n--- the server (normalised)\n${normalise(actual)}\n`);
		}
	});
	return ok;
}

function update(steps) {
	const byFile = new Map();
	for (const step of steps) {
		// Only blocks whose output really differs are rewritten, so ids and dates don't churn.
		if (step.kind === 'run' && step.expect && step.actual !== undefined && !skip.has(meta(step.info, 'step') ?? '') && !matches(step.actual, step.expect)) {
			const list = byFile.get(step.file) ?? [];
			list.push(step.expect.end === undefined ? null : step);
			byFile.set(step.file, list);
		}
	}
	for (const [file, list] of byFile) {
		let text = readFileSync(file, 'utf8');
		for (const step of list.sort((a, b) => b.expect.start - a.expect.start)) {
			const { indent, info, lang, start, end } = step.expect;
			const fence = '```';
			const body = display(step.actual, step.file)
				.split('\n')
				.map((line) => (line === '' ? '' : `${indent}${line}`))
				.join('\n');
			text = `${text.slice(0, start)}${indent}${fence}${lang}${info}\n${body}\n${indent}${fence}${text.slice(end)}`;
		}
		writeFileSync(file, text);
		console.log(`snippets: wrote ${list.length} output block(s) into ${relative(ROOT, file)}`);
	}
}

// ---------------------------------------------------------------- coverage

/** Every fenced block on every page, by what happens to it. */
export function coverage() {
	const pages = [];
	for (const file of mdxFiles(DOCS)) {
		const text = readFileSync(file, 'utf8');
		const page = { file: relative(DOCS, file), run: 0, output: 0, notRun: 0, todo: 0, unmarked: [] };
		for (const match of text.matchAll(FENCE)) {
			const info = match[4];
			if (meta(info, 'run')) page.run++;
			else if (meta(info, 'output')) page.output++;
			else if (meta(info, 'not-run')?.startsWith('todo:')) page.todo++;
			else if (meta(info, 'not-run')) page.notRun++;
			else page.unmarked.push(text.slice(0, match.index).split('\n').length);
		}
		if (page.run + page.output + page.notRun + page.todo + page.unmarked.length > 0) pages.push(page);
	}
	return pages;
}

function printCoverage() {
	const pages = coverage();
	const sum = (key) => pages.reduce((total, page) => total + (Array.isArray(page[key]) ? page[key].length : page[key]), 0);
	for (const page of pages) {
		console.log(`${page.file.padEnd(36)} run ${String(page.run).padStart(3)}  output ${String(page.output).padStart(3)}  not-run ${String(page.notRun).padStart(3)}  todo ${String(page.todo).padStart(3)}${page.unmarked.length ? `  UNMARKED at lines ${page.unmarked.join(', ')}` : ''}`);
	}
	const all = sum('run') + sum('output') + sum('notRun') + sum('todo') + sum('unmarked');
	console.log(`snippets coverage: ${all} blocks; ${sum('run')} run, ${sum('output')} outputs checked, ${sum('notRun')} can't run here (with a reason), ${sum('todo')} could run but aren't wired yet (not-run="todo: …"), ${sum('unmarked')} unmarked`);
	process.exit(sum('unmarked') > 0 ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

function main() {
	if (flag('coverage')) printCoverage();
	const steps = readSteps();
	const suites = SUITES.filter((name) => (only ? name === only : true)).map((name) => [name, steps.filter((step) => step.suite === name)]);
	if (flag('list')) {
		for (const [name, list] of suites) {
			console.log(`${name}: ${list.length} steps`);
			for (const step of list) console.log(`  ${step.kind.padEnd(6)} ${relative(ROOT, step.file)} ${step.kind === 'script' ? step.path : (step.code.split('\n')[0] ?? '').slice(0, 100)}${step.expect ? '  [checked]' : ''}`);
		}
		process.exit(0);
	}
	const ordered = suites.flatMap(([name, list]) => {
		if (list.length > 0) console.log(`snippets: suite ${name}, ${list.length} steps`);
		return list;
	});
	const failed = !runAll(ordered);
	if (flag('update')) update(steps);
	const checked = steps.filter((step) => step.expect && step.actual !== undefined).length;
	console.log(`snippets: ${checked} outputs checked${failed ? ', with differences' : ', all match'}`);
	process.exit(failed && !flag('update') ? 1 : 0);
}
