// The route-sync check's own tests: the parser must find the server's routes and ignore its test
// module, and the comparison must fail in both directions (a route the spec forgot, and a path the
// spec invented).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverRoutes, specRoutes, productionSource } from './check-openapi.mjs';

const ROUTER = `
fn router(app: App, ui_dir: Option<&Path>) -> Router {
	let router = Router::new()
		.route("/health", get(health))
		.route("/ready", get(ready))
		.route("/jobs", post(submit).get(list))
		.route("/jobs/{id}", get(inspect))
		.route("/jobs/{id}/spec", get(spec))
		.route("/jobs/{id}/cancel", post(cancel))
		.route("/admin/compact", post(compact))
		.route("/admin/backup", post(backup))
		.route("/admin/diagnostics", get(diagnostics));
	router
}

#[cfg(test)]
mod tests {
	fn fake() {
		Router::new().route("/step", axum::routing::post(post).get(probe));
	}
}
`;

test('the production route table parses, and the test module stays out', () => {
	const routes = serverRoutes(ROUTER);
	assert.equal(routes.length, 9);
	assert.deepEqual(
		routes.map(({ path }) => path),
		['/health', '/ready', '/jobs', '/jobs/{id}', '/jobs/{id}/spec', '/jobs/{id}/cancel', '/admin/compact', '/admin/backup', '/admin/diagnostics'],
	);
	assert.deepEqual(routes.find(({ path }) => path === '/jobs').methods, ['GET', 'POST']);
	assert.ok(!routes.some(({ path }) => path === '/step'), 'the test router must not be counted');
});

test('a route table without a test module parses whole', () => {
	const routes = serverRoutes(productionSource('Router::new().route("/health", get(health));'));
	assert.equal(routes.length, 1);
});

test('spec routes parse with their methods', () => {
	const routes = specRoutes({ paths: { '/jobs': { get: {}, post: {}, parameters: {} }, '/health': { get: {} } } });
	assert.deepEqual(
		routes.sort((a, b) => a.path.localeCompare(b.path)),
		[
			{ path: '/health', methods: ['GET'] },
			{ path: '/jobs', methods: ['GET', 'POST'] },
		],
	);
});
