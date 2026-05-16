/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module index
 * Application entry point and Hono app factory for the cf-discord-relay worker.
 *
 * Assembles the middleware sieve (rate-limit interceptor -> auth -> snowflake
 * validation -> access logger -> proxy forwarder) and mounts the public
 * healthcheck route ahead of the sieve. Sieve layers are numbered to document
 * their evaluation order.
 *
 * Exports both a {@link createApp} factory (for testing with injected fetch)
 * and a default app instance (for Cloudflare Workers runtime).
 */

import { Hono } from 'hono';
import type { Bindings } from './types';

import { authMiddleware } from './middleware/auth';
import { snowflakeValidatorMiddleware } from './middleware/snowflake-validator';
import { accessLoggerMiddleware } from './middleware/access-logger';

import { proxyRoute, type ProxyFetchVariables } from './routes/proxy';
import { buildHealthcheckRoute } from './routes/healthcheck';

/**
 * Creates and configures the Hono application with all middleware and routes.
 *
 * The middleware sieve processes requests in this order:
 * 1. **Rate limit interceptor** - Post-processing: reformats 429 responses, preserves Discord rate-limit headers
 * 2. **Auth validation** - Rejects unauthenticated requests
 * 3. **Snowflake validation** - Validates Discord IDs in URL path segments
 * 4. **Access logger** - One structured log line per request
 * 5. **Proxy forwarder** - Catch-all that forwards to Discord API
 *
 * @param mockFetch - Optional fetch override for integration tests.
 * @returns Configured Hono app instance.
 */
export function createApp(mockFetch?: typeof fetch) {
	const app = new Hono<{
		Bindings: Bindings;
		Variables: ProxyFetchVariables;
	}>();

	// Inject mock fetch for testing.
	if (mockFetch) {
		app.use('*', async (c, next) => {
			c.set('proxyFetch', mockFetch);
			await next();
		});
	}

	// Public healthcheck at /healthcheck (mounted BEFORE the sieve so it is
	// reachable without an auth key - phone browsers, status pages, uptime
	// monitors). Liveness only; does not probe Discord.
	app.route('/healthcheck', buildHealthcheckRoute());

	// Sieve Layer 1: Rate Limit Interceptor (post-processing).
	// Runs AFTER downstream handlers to intercept 429 responses and reformat
	// them into a consistent JSON envelope, preserving the original Retry-After
	// and X-RateLimit-* headers from Discord.
	app.use('*', async (c, next) => {
		await next();

		if (c.res.status === 429) {
			const original = c.res;
			const retryAfter = original.headers.get('Retry-After');

			const preservedHeaders = new Headers();
			original.headers.forEach((v, k) => {
				if (k.toLowerCase() === 'retry-after' || k.toLowerCase().startsWith('x-ratelimit-')) {
					preservedHeaders.set(k, v);
				}
			});
			preservedHeaders.set('Content-Type', 'application/json');

			c.res = new Response(
				JSON.stringify({
					error: 'Too Many Requests',
					retryAfter: retryAfter ? parseFloat(retryAfter) : null,
				}),
				{ status: 429, headers: preservedHeaders },
			);
		}
	});

	// Sieve Layer 2: Auth Validation.
	app.use('*', authMiddleware);

	// Sieve Layer 3: Snowflake Validation (Discord ID format checks).
	app.use('*', snowflakeValidatorMiddleware);

	// Sieve Layer 4: Access Logger (one structured line per request).
	app.use('*', accessLoggerMiddleware);

	// Sieve Layer 5: Catch-All Proxy Forwarder (everything else -> Discord API).
	app.route('/', proxyRoute);

	/** Returns JSON for unmatched paths. The Hono default is text/plain which
	 * breaks Google Apps Script's UrlFetchApp.getContentText() + JSON.parse(). */
	app.notFound((c) => c.json({ error: 'Not Found' }, 404));

	/** Global error handler - logs full error with request context, returns generic message to client. */
	app.onError((err, c) => {
		console.error('HONO ERROR:', {
			method: c.req.method,
			path: c.req.path,
			name: err.name,
			message: err.message,
			stack: err.stack,
		});
		return c.json({ error: 'Internal Server Error' }, 500);
	});

	return app;
}

/** Default app instance exported for Cloudflare Workers runtime. */
export default createApp();
