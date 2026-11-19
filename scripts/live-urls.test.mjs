// The URL check's rules, proven: what may appear on a public page, and what is allowed only on the
// pages that run on this machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problems } from './check-urls.mjs';
import { runnable, EXAMPLE_BASE } from './snippets.mjs';

test('the example domain and the docs domain are fine anywhere', () => {
	assert.deepEqual(problems(`curl ${EXAMPLE_BASE}/v1/payments and https://docs.payment-sandbox.404human.dev/cli/`, 'src/content/docs/payments.mdx'), []);
});

test('a this-machine URL is fine on the local pages, forbidden elsewhere', () => {
	const local = 'curl http://127.0.0.1:56080/healthz';
	assert.deepEqual(problems(local, 'src/content/docs/quick-start.mdx'), []);
	assert.deepEqual(problems(local, 'src/content/docs/cli.mdx'), []);
	assert.deepEqual(problems(local, 'src/content/docs/sdk.mdx'), []);
	assert.deepEqual(problems(local, 'src/content/docs/self-hosting/configuration.mdx'), []);
	assert.equal(problems(local, 'src/content/docs/payments.mdx').length, 1);
	assert.deepEqual(problems(local, 'src/pages/api/reference.astro'), [], 'the reference lists the local server');
});

test('the hosted example origins for checkout and dashboard are allowed', () => {
	assert.deepEqual(problems('open https://pay.sandbox.example.com/c/cs_sim_x', 'src/content/docs/checkout.mdx'), []);
	assert.deepEqual(problems('see https://dashboard.sandbox.example.com', 'src/content/docs/dashboard.mdx'), []);
});

test('a private IPv4 address leaks nowhere', () => {
	for (const url of ['http://10.0.0.4:56080/healthz', 'http://192.168.1.20/v1/payments', 'https://172.16.0.9:56080'])
		assert.equal(problems(`see ${url}`, 'src/content/docs/payments.mdx').length, 1, url);
	// Documentation subnets stay allowed.
	assert.deepEqual(problems('the route 203.0.113.10 is an example', 'src/content/docs/payments.mdx'), []);
});

test('a credential in a URL is caught', () => {
	assert.equal(problems(`GET ${EXAMPLE_BASE}/v1/payments?key=abc123`, 'src/content/docs/payments.mdx').length, 1);
	assert.equal(problems(`https://webhook.site/?token=xyz`, 'src/content/docs/webhooks.mdx').length, 1);
});

test('0.0.0.0 is never an address to visit', () => {
	assert.equal(problems('curl http://0.0.0.0:56080/healthz', 'src/content/docs/quick-start.mdx').length, 1);
});

test('plain http off the local pages is flagged', () => {
	assert.equal(problems('see http://internal.example.org/v1/payments', 'src/content/docs/payments.mdx').length, 1);
});

test('runnable() gives the example domain the real stack address', () => {
	assert.match(runnable(`curl ${EXAMPLE_BASE}/v1/payments`), /^curl http:\/\/127\.0\.0\.1:\d+\/v1\/payments$/);
});
