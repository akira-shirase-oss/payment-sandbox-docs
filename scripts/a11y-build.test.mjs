// The build's accessibility helpers, proven on fixture HTML — the same checks that run on dist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;

/** Run focusable-tables.mjs over a fake dist/ and return the resulting page. */
function processPage(html) {
	const dir = mkdtempSync(join(tmpdir(), 'docs-a11y-'));
	mkdirSync(join(dir, 'dist'), { recursive: true });
	writeFileSync(join(dir, 'dist', 'index.html'), html);
	execFileSync('node', [join(ROOT, 'scripts/focusable-tables.mjs')], { env: { ...process.env, DIST: join(dir, 'dist') } });
	const out = readFileSync(join(dir, 'dist', 'index.html'), 'utf8');
	rmSync(dir, { recursive: true, force: true });
	return out;
}

test('a wide table becomes focusable, a small one stays put', () => {
	const wide = `<div class="table-wrapper"><table>${'<tr><th>column</th>'.repeat(12)}</tr>${'<tr><td>value with quite a long cell text here</td>'.repeat(12)}</tr>'.repeat(6)}</table></div>`;
	const small = `<div class="table-wrapper"><table><tr><td>a</td><td>b</td></tr></table></div>`;
	const out = processPage(`<html><body>${wide}${small}</body></html>`);
	const tabbed = out.match(/tabindex="0" role="region" aria-label="Scrollable table"/g) ?? [];
	assert.equal(tabbed.length, 1, 'exactly one table got the attributes');
	assert.ok(out.indexOf(tabbed[0]) < out.indexOf(small), 'it was the wide one');
});

test('a long code block becomes focusable', () => {
	const code = `<div class="expressive-code"><figure class="frame"><pre><div class="ec-line"><span style="--0:#fff">${'x = "'.concat('a'.repeat(120), '"')}</span></div></pre></figure></div>`;
	const out = processPage(`<html><body>${code}</body></html>`);
	assert.match(out, /tabindex="0" role="region" aria-label="Scrollable code"/);
});

test('inline scripts get hashed into the CSP', () => {
	const dir = mkdtempSync(join(tmpdir(), 'docs-csp-'));
	mkdirSync(join(dir, 'dist'), { recursive: true });
	writeFileSync(join(dir, 'dist', 'index.html'), `<html><body><script>console.log('hi')</script></body></html>`);
	writeFileSync(join(dir, 'dist', '_headers'), `/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' INLINE_SCRIPT_HASHES\n`);
	execFileSync('node', [join(ROOT, 'scripts/csp-hashes.mjs')], { env: { ...process.env, DIST: join(dir, 'dist') } });
	const headers = readFileSync(join(dir, 'dist', '_headers'), 'utf8');
	assert.match(headers, /script-src 'self' 'wasm-unsafe-eval' 'sha256-[A-Za-z0-9+/=]+'/);
	assert.ok(!headers.includes('INLINE_SCRIPT_HASHES'), 'the marker was replaced');
	rmSync(dir, { recursive: true, force: true });
});
