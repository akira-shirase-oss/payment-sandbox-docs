/**
 * The reader's Payment Sandbox URL, for the code examples (components/YourUrl.astro) and the API
 * reference's servers list. Pages are written with EXAMPLE, a domain reserved for examples
 * (RFC 2606), so a command copied with a real key can never reach a stranger's server.
 *
 * Kept in this browser only: localStorage, read and written inside try/catch so a page whose
 * storage is blocked still works with the example. Nothing here sends anything anywhere.
 */
export const EXAMPLE = 'https://sandbox.example.com';
export const STORAGE_KEY = 'payment-sandbox-docs:server';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type Parsed = { url: string; note?: string } | { error: string };

/**
 * An origin the examples may show: https://, or http:// for this machine only (with a note).
 * Any path, query, fragment or credentials are dropped; anything else is refused.
 */
export function parseRunnerUrl(input: string): Parsed {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		return { error: 'That isn’t a URL. Enter your server’s address, such as https://sandbox.yoursite.com.' };
	}
	if (url.protocol === 'https:') return { url: url.origin };
	if (url.protocol === 'http:') {
		if (LOCAL_HOSTS.has(url.hostname)) {
			return { url: url.origin, note: 'Plain http is fine on this machine; anywhere else, use https so keys stay private.' };
		}
		return { error: 'Use https://. Plain http:// is only for a server on this machine (localhost).' };
	}
	return { error: 'Use an https:// address.' };
}

/** The stored URL, re-checked (storage is the reader's to edit), or null. */
export function readStoredUrl(): { url: string; note?: string } | null {
	let value: string | null = null;
	try {
		value = localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
	if (!value) return null;
	const parsed = parseRunnerUrl(value);
	return 'error' in parsed ? null : parsed;
}

/** Stores the URL, or forgets it with null. Failing storage is not an error: the page still works. */
export function writeStoredUrl(url: string | null): void {
	try {
		if (url === null) localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, url);
	} catch {
		// Storage blocked (a private window, a policy): the examples show it for this visit only.
	}
}
