/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module middleware/auth
 * Authentication middleware for the cf-discord-relay.
 *
 * Validates incoming requests against a shared secret (`AUTH_KEY` binding).
 *
 * **Divergence from the parent `discord-api-proxy`:** the relay accepts the
 * shared secret ONLY via the `x-auth-key` request header, never via the
 * standard `Authorization` header. Reason: callers typically send their own
 * Discord `Authorization: Bot xxx` header on the same request (or none, when
 * using webhook URLs whose auth lives in the path). Treating `Authorization`
 * as our auth would collide with the caller's Discord auth.
 */

import { createMiddleware } from 'hono/factory';
import type { Bindings } from '../types';

/**
 * Compares two strings in constant time to prevent timing-based attacks.
 *
 * Uses the Web Crypto API's `timingSafeEqual` (available in Cloudflare Workers)
 * so that an attacker cannot measure response time differences to determine
 * correct key prefix characters byte-by-byte.
 *
 * @param a - First string to compare.
 * @param b - Second string to compare.
 * @returns `true` if the strings are identical, `false` otherwise.
 */
function timingSafeEqual(a: string, b: string): boolean {
	const encoder = new TextEncoder();
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);
	if (aBytes.byteLength !== bBytes.byteLength) {
		// Perform a dummy comparison against itself so that the function's execution
		// time stays roughly constant regardless of whether lengths match. Without
		// this, an attacker could probe key length by measuring the early return.
		crypto.subtle.timingSafeEqual(aBytes, aBytes);
		return false;
	}
	return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

/**
 * Rejects requests that do not provide a valid API key.
 *
 * Reads the relay's shared secret from the `x-auth-key` header only. Returns:
 * - 503 `Service misconfigured` when the `AUTH_KEY` binding is not configured.
 * - 401 `Unauthorized` when the header is missing or does not match.
 */
export const authMiddleware = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
	if (!c.env.AUTH_KEY) {
		console.error('FATAL: AUTH_KEY binding is not configured');
		return c.json({ error: 'Service misconfigured' }, 503);
	}

	const provided = c.req.header('x-auth-key');

	if (!provided) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	if (!timingSafeEqual(provided, c.env.AUTH_KEY)) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	await next();
});
