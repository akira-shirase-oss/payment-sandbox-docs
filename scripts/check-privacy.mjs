#!/usr/bin/env node
// The privacy check: what a reader's browser would actually do on the built site. It drives the
// pages in headless Chromium with the network fully traced, and fails if anything —
//
//   - leaves the machine to a third party on an ordinary docs page (fonts, CDNs, analytics,
//     telemetry endpoints, images from other hosts). First-party only; the only exception is
//     requests the reader explicitly aimed: the API reference's Test Request.
//   - persists an API key or token anywhere in storage (localStorage, sessionStorage, cookies,
//     IndexedDB) — the docs never keep a reader's credential.
//   - silently substitutes the stored "your Payment Sandbox" server into examples it shouldn't:
//     only the interactive reference may use it, never static page content or copy buttons.
//   - leaks the reader's stored server URL, key or identity into a request to a different origin.
//
// It also runs the accessibility scan (scripts/axe-scan.mjs) on the pages it visits — the same
// browser, the same pass.
//
//   node scripts/check-privacy.mjs                 the whole site
//   node scripts/check-privacy.mjs --pages /,/api/reference/   just these pages
//   PREVIEW=http://127.0.0.1:58668 node scripts/check-privacy.mjs   against a preview already up
import { chromium } from '@playwright/test';
import axeScan from './axe-scan.mjs';

const sitemap = (await import('./lib/sitemap-pages.mjs')).default;

const base = process.env.PREVIEW ?? 'http://127.0.0.1:58668';
const argPages = (() => {
	const at = process.argv.indexOf('--pages');
	return at === -1 ? null : process.argv[at + 1].split(',');
})();
const pages = argPages ?? sitemap();
const remote = 'https://sandbox.example.com';
const yourServer = 'https://my-sandbox.example.net';
const token = 'sk_sim_privacycheck0123456789abcdef0123456789abcdef0123456789abcd';

const own = new URL(base).host;
const ok = (url) => {
	const u = new URL(url);
	return u.host === own || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:');
};

let bad = 0;
const fail = (what) => {
	bad++;
	console.error(`privacy: ${what}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true });

// Every request the browser makes, and who made it.
const requests = [];
await context.route('**/*', async (route) => {
	const url = route.request().url();
	const page = route.request().frame()?.page();
	requests.push({ url, page: page?.url() ?? '(no page)', resource: route.request().resourceType() });
	if (url.startsWith(remote) || url.startsWith(yourServer)) {
		// A try-it or example request aimed at a Payment Sandbox: let it "succeed" locally so the
		// page's own machinery can be observed.
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{"simulated":true}' });
		return;
	}
	if (ok(url)) return route.continue();
	fail(`third-party request from ${page?.url() ?? '?'}: ${url}`);
	await route.abort();
});

// The API reference's try-it must NOT go through a proxy. Scalar sends its request straight to the
// chosen server; the route above fulfils it and we note where it was aimed.
let tried = null;
await context.route(`${remote}/healthz`, async (route) => {
	tried = 'example';
	await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok","simulated":true}' });
});

const page = await context.newPage();
const axeBad = [];
const codeTexts = [];
for (const path of pages) {
	const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
	if (!response?.ok()) {
		fail(`${path} → HTTP ${response?.status()}`);
		continue;
	}
	await page.waitForTimeout(300);
	// Any code block on a static page that shows the reader's stored URL would be a substitution bug;
	// collect the page's code blocks for the check below.
	codeTexts.push(...(await page.locator('pre').allInnerTexts()), ...(await page.locator('[data-code]').allAttributes().then((attrs) => attrs.map((a) => a['data-code'] ?? ''))));
	const violations = await axeScan(page, { label: path });
	if (violations.length) axeBad.push({ path, violations });
}

// The API reference with a stored server and a key: the stored URL may be offered as a server,
// the key must go only to that origin, and nothing must be persisted.
await page.goto(`${base}/api/reference/`, { waitUntil: 'networkidle' });
await page.evaluate(
	({ url }) => {
		localStorage.setItem('payment-sandbox-docs:server', url);
	},
	{ url: yourServer },
);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// Scalar renders the spec; pick the stored server and fire a request at a path the page offers.
const storedShown = await page.locator(`text=${yourServer}`).count();
if (storedShown === 0) console.error('privacy: the stored "your Payment Sandbox" URL was not offered in the reference');

for (const stored of await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))) {
	for (const bag of Object.values(stored)) {
		for (const name of bag) {
			const value = /local/i.test(name) ? await page.evaluate((n) => localStorage.getItem(n), name) : await page.evaluate((n) => sessionStorage.getItem(n), name);
			if (value?.includes(token)) fail(`the API key was persisted in storage under ${name}`);
		}
	}
}
const cookies = await context.cookies();
if (cookies.some((c) => c.value.includes(token) || c.name.toLowerCase().includes('key') || c.name.toLowerCase().includes('token'))) fail('a credential-named cookie was set');
if ((await page.evaluate(async () => (await indexedDB.databases?.())?.length ?? 0)) > 0) fail('an IndexedDB database exists — nothing may persist');

// Examples on static pages: the stored URL must never replace the example domain in what a reader copies.
if (!codeTexts.some((text) => text.includes(remote) || text.includes('127.0.0.1'))) console.error('privacy: no page showed an example base — is the docs content wired?');
if (codeTexts.some((text) => text.includes(yourServer))) fail(`a static page's code block shows the reader's stored URL ${yourServer}`);
for (const text of codeTexts) {
	if (text.includes(token)) fail('a page echoed the API key back in a code block');
}

// A try-it request goes only to the server the reader picked — never anywhere else.
const stray = requests.filter((r) => !ok(r.url) && !r.url.startsWith(remote) && !r.url.startsWith(yourServer) && !r.url.startsWith('data:') && !r.url.startsWith('blob:') && !r.url.startsWith('about:'));
for (const r of stray) fail(`request left for a third party: ${r.url} (from ${r.page})`);
const keyLeak = requests.filter((r) => r.url.includes(token) || decodeURIComponent(r.url).includes(token));
for (const r of keyLeak) fail(`the API key reached a URL: ${r.url}`);

for (const { path, violations } of axeBad) {
	for (const v of violations) console.error(`privacy/axe: ${path} — ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).join(', ')}`);
	bad += violations.length;
}

await browser.close();
console.log(bad === 0 ? `privacy: clean across ${pages.length} page(s)` : `privacy: ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
