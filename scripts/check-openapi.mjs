#!/usr/bin/env node
// The draft spec's contract with the server it describes. src/data/openapi.json is a draft authored
// here (README says why: it moves into payment-sandbox once reviewed, and this repo then serves the
// product's copy, as other docs sites do). Until then this check keeps the draft honest by comparing
// it both ways against the server's real route table:
//
//   - every .route("...", …) in sandbox-server's production router must exist in the spec, with the
//     same methods;
//   - every path the spec declares must exist as a route in the server;
//   - methods are compared too, so a route that gains DELETE or loses POST fails here.
//
// It reads the product's crates/sandbox-server/src/routes.rs — from PAYMENT_SANDBOX_DIR (a local
// checkout or the copy CI makes), else it fetches the file from the product's default branch on
// GitHub. The dashboard's own page API (src/web/dashboard.rs, /api/...) and the checkout's
// (src/web/checkout.rs, /api/sessions/...) are deliberately out of scope: they answer the products'
// own pages on their own origins, not API callers; so is the simulated network's internal API
// (sandbox-sim), which only the server calls.
//
//   node scripts/check-openapi.mjs                        local tree via PAYMENT_SANDBOX_DIR, else fetch
//   PAYMENT_SANDBOX_DIR=../payment-sandbox node scripts/check-openapi.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;
const SPEC = join(ROOT, 'src/data/openapi.json');
const PRODUCT = process.env.PAYMENT_SANDBOX_DIR ?? new URL('../../payment-sandbox', import.meta.url).pathname;
const ROUTES_RS = join(PRODUCT, 'crates/sandbox-server/src/routes.rs');
const REMOTE = 'https://raw.githubusercontent.com/akira-shirase-oss/payment-sandbox/main/crates/sandbox-server/src/routes.rs';

const METHODS = /(?<![\w:])(get|post|put|patch|delete)\s*\(/g;
const ROUTE_START = /\.route\(\s*"([^"]+)"\s*,/g;

/** The text of a .route("path", <handlers>) call's handler argument, found by paren depth. */
function handlerText(source, from) {
	let depth = 1; // we start inside .route(
	let inString = false;
	for (let at = from; at < source.length; at++) {
		const ch = source[at];
		if (inString) {
			if (ch === '"' && source[at - 1] !== '\\') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '(') depth++;
		else if (ch === ')' && --depth === 0) return source.slice(from, at);
	}
	return null;
}

/** The production part of routes.rs: everything before a test module, if there is one. */
export function productionSource(text) {
	const test = text.search(/^#\[cfg\(test\)\]/m);
	return test === -1 ? text : text.slice(0, test);
}

/** Every (path, methods[]) the production router declares. */
export function serverRoutes(text) {
	const source = productionSource(text);
	const routes = [];
	for (const match of source.matchAll(ROUTE_START)) {
		const handlers = handlerText(source, match.index + match[0].length);
		if (handlers === null) continue;
		const methods = [...handlers.matchAll(METHODS)].map((m) => m[1].toUpperCase());
		if (methods.length === 0) continue; // `.route("/x", any_service)` — not an HTTP method table
		routes.push({ path: match[1], methods: [...new Set(methods)].sort() });
	}
	return routes;
}

/** Every (path, methods[]) the OpenAPI document declares. */
export function specRoutes(spec) {
	const routes = [];
	for (const [path, item] of Object.entries(spec.paths ?? {})) {
		const methods = Object.keys(item).filter((key) => ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(key));
		routes.push({ path, methods: methods.map((m) => m.toUpperCase()).sort() });
	}
	return routes;
}

export async function main() {
	let source;
	if (existsSync(ROUTES_RS)) {
		source = readFileSync(ROUTES_RS, 'utf8');
	} else {
		console.error(`check-openapi: no local product tree at ${PRODUCT}; fetching the route table from GitHub`);
		const response = await fetch(REMOTE);
		if (!response.ok) {
			console.error(`check-openapi: could not read the server's routes (HTTP ${response.status})`);
			process.exit(1);
		}
		source = await response.text();
	}
	const server = serverRoutes(source);
	const spec = specRoutes(JSON.parse(readFileSync(SPEC, 'utf8')));

	let bad = 0;
	const fail = (what) => {
		bad++;
		console.error(`check-openapi: ${what}`);
	};
	const key = ({ path, methods }) => `${methods.join('+')} ${path}`;

	for (const route of server) {
		const inSpec = spec.find((candidate) => candidate.path === route.path);
		if (!inSpec) fail(`server route ${key(route)} is missing from the spec`);
		else {
			for (const method of route.methods) if (!inSpec.methods.includes(method)) fail(`server route ${route.path} has ${method}; the spec has ${inSpec.methods.join('+')}`);
			for (const method of inSpec.methods) if (!route.methods.includes(method)) fail(`the spec gives ${route.path} a ${method} the server doesn't have`);
		}
	}
	for (const route of spec) {
		if (!server.some((candidate) => candidate.path === route.path)) fail(`the spec declares ${key(route)} but the server has no such route`);
	}

	if (bad === 0) console.log(`check-openapi: spec and server agree on ${server.length} routes`);
	process.exit(bad ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
