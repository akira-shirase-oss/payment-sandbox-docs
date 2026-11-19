#!/usr/bin/env node
// Copies Scalar's browser build out of the installed @scalar/api-reference package into public/scalar/,
// pinned to the version package.json resolved (so the site serves it first-party: no jsDelivr, no
// third-party requests for the reference itself). Run by astro.config's inline integration at build
// start and on dev start, never by hand.
//
// The package's dist/browser/standalone.js registers window.Scalar.createApiReference, which the
// reference page calls; it carries its own styles. In v1.76+ standalone.js is a thin ES-module wrapper
// around standalone.esm.js, and the wrapper's "use strict" makes an <import> of it throw —
// so this copies standalone.esm.js itself, the real ESM entry.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));
// The package's exports map hides ./package.json and ./dist/*, so resolve its "." entry
// (dist/index.js) and reach the browser build on disk above it.
let pkgDir;
try {
	pkgDir = dirname(dirname(require.resolve('@scalar/api-reference')));
} catch {
	console.error('copy-scalar: @scalar/api-reference is not installed');
	process.exit(1);
}
const source = join(pkgDir, 'dist/browser/standalone.esm.js');
const pkg = join(pkgDir, 'package.json');
const targetDir = join(root, '../public/scalar');
const target = join(targetDir, 'standalone.esm.js');
const stamp = join(targetDir, '.version');
const version = JSON.parse(readFileSync(pkg, 'utf8')).version;

if (!existsSync(source)) {
	console.error(`copy-scalar: ${source} does not exist — @scalar/api-reference ${version} ships no browser build?`);
	process.exit(1);
}

const current = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : '';
if (current !== version || !existsSync(target)) {
	rmSync(targetDir, { recursive: true, force: true });
	mkdirSync(targetDir, { recursive: true });
	copyFileSync(source, target);
	writeFileSync(stamp, `${version}\n`);
	console.log(`scalar: copied browser build ${version} (${(statSync(target).size / 1e6).toFixed(1)} MB) to public/scalar/`);
}
