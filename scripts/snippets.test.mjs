// The snippets engine's own tests — the same cases that guard its promise: ids, secrets, times and
// hashes normalise away, shown addresses map onto the band under test, and a real difference still
// fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise, matches, runnable, display, fences, shownBase, EXAMPLE_BASE } from './snippets.mjs';

// A mapping with the band under test as `real`, as --base … would build it at run time.
const BAND = [
	{ shown: 'https://sandbox.example.com', real: 'http://127.0.0.1:58660' },
	{ shown: 'https://pay.sandbox.example.com', real: 'http://127.0.0.1:58663' },
	{ shown: 'http://127.0.0.1:56081', real: 'http://127.0.0.1:58661' },
	{ shown: 'http://127.0.0.1:56082', real: 'http://127.0.0.1:58662' },
	{ shown: 'http://127.0.0.1:56083', real: 'http://127.0.0.1:58663' },
	{ shown: 'http://127.0.0.1:56084', real: 'http://127.0.0.1:58664' },
	{ shown: 'http://127.0.0.1:56100', real: 'http://127.0.0.1:58680' },
	{ shown: 'http://127.0.0.1:56080', real: 'http://127.0.0.1:58660' },
];

test('the example domain becomes the stack under test', () => {
	const code = runnable(`curl -i -H "Authorization: Bearer $PS_API_KEY" ${EXAMPLE_BASE}/v1/payments`, BAND);
	assert.equal(code, 'curl -i -H "Authorization: Bearer $PS_API_KEY" http://127.0.0.1:58660/v1/payments');
});

test('local shown addresses become the band under test', () => {
	const code = runnable('curl -s http://127.0.0.1:56080/healthz && node receiver.mjs http://127.0.0.1:56100', BAND);
	assert.equal(code, 'curl -s http://127.0.0.1:58660/healthz && node receiver.mjs http://127.0.0.1:58680');
	// The checkout and dashboard origins on their hosted example names.
	const origins = runnable('open https://pay.sandbox.example.com/c/cs_sim_x', BAND);
	assert.equal(origins, 'open http://127.0.0.1:58663/c/cs_sim_x');
});

test('the scheme-less forms a flag or a port variable takes are rewritten too', () => {
	const bare = runnable('PS_LISTEN=127.0.0.1:56080 cargo run -p sandbox-server', BAND);
	assert.equal(bare, 'PS_LISTEN=127.0.0.1:58660 cargo run -p sandbox-server');
	const ports = runnable('PS_WEBHOOK_PORTS=56100 node receiver.mjs', BAND);
	assert.equal(ports, 'PS_WEBHOOK_PORTS=58680 node receiver.mjs');
	// A port-shaped number that isn't a shown port stays literal.
	assert.equal(runnable('pay_id=56090', BAND), 'pay_id=56090');
});

test('a payment id, a secret and a timestamp all normalise', () => {
	const a = normalise('{"id":"019a0000-0000-7000-8000-000000000000","state":"authorized","created_at":"2026-11-18T10:00:00Z"}');
	const b = normalise('{"id":"019a9999-9999-7000-8000-999999999999","state":"authorized","created_at":"2026-11-18T11:00:00Z"}');
	assert.equal(a, b, "the uuid and the timestamp differ run to run, the shape doesn't");
	const c = normalise('{"id":"x","state":"captured","created_at":"2026-11-18T10:00:00Z"}');
	assert.notEqual(a, c, 'a real difference still fails');
});

test('a generated credential normalises to its elision', () => {
	assert.equal(normalise('key: sk_sim_9f2c1a4b7e8d0a3b6c5d4e3f'), 'key: sk_sim_…');
	assert.equal(normalise('secret: whsec_sim_abcdef0123456789'), 'secret: whsec_sim_…');
	assert.notEqual(normalise('{"ok":true}'), normalise('{"ok":false}'));
});

test('JSON bodies compare by value, not by formatting', () => {
	assert.equal(normalise('{"a":{"x":[2,3]},"b":1}'), normalise('{\n  "a": {\n    "x": [2, 3]\n  },\n  "b": 1\n}'));
	assert.notEqual(normalise('{"v":45}'), normalise('{"v":46}'));
});

test('curl -i heads compare with dates and lengths stripped', () => {
	const one = normalise('HTTP/1.1 200 OK\ndate: Mon, 17 Nov 2026 10:00:00 GMT\ncontent-length: 12\n\n{"ok":true}');
	const two = normalise('HTTP/1.1 200 OK\ndate: Tue, 18 Nov 2026 10:00:01 GMT\ncontent-length: 99\n\n{"ok":true}');
	assert.equal(one, two);
});

test('match=lines accepts a stream whose order differs', () => {
	const expect = { code: '{"event":1}\n{"event":2}', info: 'match=lines' };
	assert.ok(matches('{"event":2}\n{"event":1}\n{"event":3}', expect), 'shown lines all arrived, in any order');
	assert.ok(!matches('{"event":1}', expect), 'a shown line that never arrived still fails');
});

test('display maps a real address back to what the page shows', () => {
	const got = display('HTTP/1.1 200 OK\n\n{"webhook_url":"http://127.0.0.1:56100/hook"}', 'src/content/docs/cli.mdx');
	assert.match(got, /127\.0\.0\.1:56100\/hook/);
	const hosted = display('{"url":"http://127.0.0.1:56100"}', 'src/content/docs/concepts.mdx');
	assert.match(hosted, /receiver\.example\.com/);
});

test('a code fence inside indented markdown is still a block, not prose', () => {
	const page = `1. Step\n\n   \`\`\`sh run=cli\n   sandbox-cli status\n   \`\`\``;
	assert.equal(fences(page).length, 1);
});

test('coverage kinds are read from the info string, not inside other keys', () => {
	const page = `\`\`\`sh run=quickstart\ncurl example\n\`\`\`\n\`\`\`json output=quickstart\n{}\n\`\`\`\n\`\`\`text not-run="a systemd unit"\n[Unit]\n\`\`\`\n\`\`\`python\nprint("oops")\n\`\`\``;
	const kinds = fences(page).map((m) => (m[4].includes('not-run') ? 'not-run' : m[4].match(/(?:^|\s)run=/) ? 'run' : m[4].includes('output=') ? 'output' : 'unmarked'));
	assert.deepEqual(kinds, ['run', 'output', 'not-run', 'unmarked']);
});

test('shownBase picks the address a page pretends to use', () => {
	assert.equal(shownBase('src/content/docs/quick-start.mdx'), 'http://127.0.0.1:56080');
	assert.equal(shownBase('src/content/docs/self-hosting/configuration.mdx'), 'http://127.0.0.1:56080');
	assert.equal(shownBase('src/content/docs/concepts.mdx'), EXAMPLE_BASE);
});
