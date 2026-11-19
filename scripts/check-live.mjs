#!/usr/bin/env node
// The live check: what the deployed site actually does, driven in a browser against the real URL —
// never assumed from the build. Run against production (or a Pages preview) after deploy:
//
//   node scripts/check-live.mjs https://docs.payment-sandbox.404human.dev
//   node scripts/check-live.mjs http://127.0.0.1:58668   (a local preview of dist)
//
// Fails if a page 404s, the security headers are missing, the search or the llms files 404, the
// API reference doesn't render the spec, or the changelog feed is broken.
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? process.env.LIVE ?? 'https://docs.payment-sandbox.404human.dev').replace(/\/$/, '');
// The pages a reader must reach today; grows as content lands.
const PAGES = ['/', '/quick-start/', '/changelog/', '/api/reference/'];

let bad = 0;
const fail = (what) => {
	bad++;
	console.error(`live: ${what}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();

for (const path of PAGES) {
	const response = await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
	if (!response?.ok()) fail(`${path} → HTTP ${response?.status()}`);
}

// Security headers on a page.
const response = await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
const headers = response?.headers() ?? {};
for (const name of ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy'])
	if (!headers[name]) fail(`/ is missing the ${name} header`);
if (headers['x-frame-options'] !== 'DENY') fail(`x-frame-options is ${headers['x-frame-options']}, not DENY`);

// The files a tool or a reader fetches directly.
for (const file of ['/openapi.json', '/llms.txt', '/llms-full.txt', '/changelog/rss.xml', '/index.md', '/robots.txt', '/favicon.svg']) {
	const res = await page.request.get(`${base}${file}`);
	if (!res.ok()) fail(`${file} → HTTP ${res.status()}`);
}

// Search: pagefind's index must exist and answer.
const pf = await page.request.get(`${base}/pagefind/pagefind.js`);
if (!pf.ok()) fail('/pagefind/pagefind.js → search index missing');

// The reference renders the spec: a path from the document must appear.
await page.goto(`${base}/api/reference/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const ops = await page.locator('text=/\\/v1\\/payments/').count();
if (ops === 0) fail('the API reference did not render a /v1/payments operation');

// The changelog feed parses and has items.
const rss = await page.request.get(`${base}/changelog/rss.xml`);
const rssText = rss.ok() ? await rss.text() : '';
if (!rssText.includes('<item>')) fail('changelog RSS has no items');

await browser.close();
console.log(bad === 0 ? `live: ${base} clean` : `live: ${bad} problem(s) on ${base}`);
process.exit(bad ? 1 : 0);
