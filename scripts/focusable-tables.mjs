#!/usr/bin/env node
// Post-build: the tables and code blocks that overflow sideways become focusable, so a keyboard
// can reach and scroll them (WCAG 2.1.1 / the axe "scrollable-region-focusable" rule). Runs after
// astro build on dist/.
//
// Starlight wraps each table in <div class="table-wrapper">; this gives the wrapper tabindex="0"
// plus a role and a name ("Scrollable table") so a screen reader says what the focus is for. The
// same goes for <div class="expressive-code"> blocks, whose <pre> scrolls. Only blocks that can
// actually overflow get it, to avoid pointless tab stops on small ones.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.DIST ?? new URL('../dist', import.meta.url).pathname;
// A match is only a hint — the real decision is the width check below on the element's content.
const TABLE = /<div class="table-wrapper"([^>]*)>([\s\S]*?)<\/div>/g;
const CODE = /<div class="expressive-code"([^>]*)>([\s\S]*?)<\/figure>/g;

/** Would this overflow at roughly a laptop pane? A long code line or a table with many/wide columns. */
function canOverflow(inner, kind) {
	if (kind === 'code') {
		return inner.replace(/<[^>]+>/g, ' ').split('\n').some((line) => line.length > 95);
	}
	const cells = (inner.match(/<(td|th)[^>]*>/g) ?? []).length;
	const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
	return cells >= 12 || text.length > 480;
}

function fix(html) {
	let touched = 0;
	const widen = (whole, attrs, inner, kind) => {
		if (attrs.includes('tabindex') || !canOverflow(inner, kind)) return whole;
		touched++;
		const tag = kind === 'code' ? 'div' : 'div';
		return `<${tag} class="${kind === 'code' ? 'expressive-code' : 'table-wrapper'}"${attrs} tabindex="0" role="region" aria-label="${kind === 'code' ? 'Scrollable code' : 'Scrollable table'}">${inner}${kind === 'code' ? '</figure>' : `</${tag}>`}`;
	};
	let out = html.replace(TABLE, (whole, attrs, inner) => widen(whole, attrs, inner, 'table'));
	out = out.replace(CODE, (whole, attrs, inner) => widen(whole, attrs, inner, 'code'));
	return { html: out, touched };
}

let files = 0;
const walk = (dir) => {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path);
		else if (name.endsWith('.html')) {
			const before = readFileSync(path, 'utf8');
			const { html, touched } = fix(before);
			if (html !== before) {
				writeFileSync(path, html);
				files++;
				console.log(`focusable-tables: ${path.split('/dist/')[1]} (${touched})`);
			}
		}
	}
};
walk(DIST);
console.log(`focusable-tables: ${files} page(s) updated`);
