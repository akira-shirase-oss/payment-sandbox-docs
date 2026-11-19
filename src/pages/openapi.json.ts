import type { APIRoute } from 'astro';
import spec from '../data/openapi.json?raw';

/**
 * Payment Sandbox's OpenAPI document: a draft authored in this repository from the server's real
 * request and response shapes (docs/API.md and crates/sandbox-server/src/routes.rs), kept in sync
 * with the route table by scripts/check-openapi.mjs. It moves into payment-sandbox once reviewed;
 * this endpoint then serves that copy, byte for byte.
 */
export const GET: APIRoute = () =>
	new Response(spec, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
