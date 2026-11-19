#!/usr/bin/env node
// Finds every URL a reader could copy from a page — in code blocks and in prose — and fails on
// ones that would mislead:
//
//   - http://localhost or http://127.0.0.1 outside the pages that run on this machine
//     (ALLOWED below; everywhere else examples use https://sandbox.example.com, with
//     https://pay.sandbox.example.com and https://dashboard.sandbox.example.com for the
//     checkout and dashboard origins)
//   - 0.0.0.0 anywhere (a listen address, not one to visit)
//   - internal paths, credentials or tokens
//   - private IPv4 subnets (10/8, 172.16/12, 192.168/16) — they would leak the author's network.
//     Documentation subnets 198.51.100.0/24, 203.0.113.0/24 (TEST-NET-2/3) and 127/8 stay allowed.
//   - a URL whose scheme isn't https (or http on the local pages)
//   - a trailing slash on the example domain (the API's paths have none; a bare https://sandbox.example.com/
//     in prose is fine)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;
const DOCS = join(ROOT, 'src/content/docs');
const PAGES = join(ROOT, 'src/pages');
const EXAMPLE = 'https://sandbox.example.com';

// Pages that run on this machine may show its own addresses (the quick start; the CLI's default
// PS_API_URL; the SDK's apiUrl; listen addresses and health checks in self-hosting). Everywhere
// else is https://sandbox.example.com.
export const ALLOWED = [
	/^src\/content\/docs\/(quick-start|cli|sdk)\.mdx$/, // the quick start; the CLI's default --api-url; the SDK's apiUrl
	/^src\/content\/docs\/self-hosting\//, // listen addresses, loopback backends, local health checks
	/^src\/pages\/api\/reference\.astro$/, // the reference's "the quick start on this machine" server
];
const LOCAL = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[?::1|dashboard\.localhost)/;
const PRIVATE_V4 = /^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
const URL_IN_TEXT = /https?:\/\/[^\s"'`)\]},;>]+/g;

export function problems(text, file) {
	const bad = [];
	const local = ALLOWED.some((ok) => ok.test(file));
	for (const match of text.matchAll(URL_IN_TEXT)) {
		const url = match[0].replace(/[.,;:]+$/, '');
		if (LOCAL.test(url) && !local) bad.push(`${url} is a this-machine address on a page that isn't local`);
		else if (PRIVATE_V4.test(url)) bad.push(`${url} is a private IPv4 address — use a documentation subnet or an example name`);
		else if (/^https?:\/\/0\.0\.0\.0/.test(url)) bad.push(`${url}: 0.0.0.0 listens everywhere; it isn't an address to visit`);
		else if (/[?&](token|key|secret|sig|password)=[A-Za-z0-9]/i.test(url)) bad.push(`${url} looks like it carries a credential`);
		else if (/^http:\/\/(?!localhost|127\.|0\.0\.0\.0|\[?::1|dashboard\.localhost)/.test(url) && !/sandbox\.example\.com/.test(url)) bad.push(`${url} is plain http`);
		else if (url.startsWith(`${EXAMPLE}/`) && !/^https:\/\/sandbox\.example\.com\/(healthz|readyz|v1)/.test(url))
			bad.push(`${url}: the example domain only pretends to serve API paths, no other pages`);
		else if (/^https:\/\/(pay|dashboard)\.sandbox\.example\.com\//.test(url) && !/^https:\/\/pay\.sandbox\.example\.com\/(c\/|api\/sessions\/|$)/.test(url) && !/^https:\/\/dashboard\.sandbox\.example\.com\/$/.test(url + '/'))
			bad.push(`${url}: the example origins only pretend to serve the checkout page and its session API`);
	}
	return bad;
}

export function scan(dir) {
	const bad = [];
	const walk = (at) => {
		for (const name of readdirSync(at)) {
			const path = join(at, name);
			if (statSync(path).isDirectory()) walk(path);
			else if (/\.(mdx?|astro)$/.test(name)) {
				const file = relative(ROOT, path);
				for (const problem of problems(readFileSync(path, 'utf8'), file)) bad.push(`${file}: ${problem}`);
			}
		}
	};
	walk(dir);
	return bad;
}

export function main(dir = join(ROOT, 'src')) {
	const bad = scan(dir);
	for (const problem of bad) console.error(`check-urls: ${problem}`);
	console.log(`check-urls: ${bad.length === 0 ? 'all URLs are example or labelled-local' : `${bad.length} bad URL(s)`}`);
	process.exit(bad.length ? 1 : 0);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
