/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module routes/healthcheck
 * Public, unauthenticated liveness probe.
 *
 * Mounted at `/healthcheck` BEFORE the sieve (auth) so it is reachable from any
 * client, including phone browsers, without a key. Returns a compact JSON body
 * plus build metadata for at-a-glance "which version is running" checks.
 *
 * Liveness only - does not probe Discord or any external service.
 */

import { Hono } from 'hono';
import type { Bindings } from '../types';

/**
 * Build the public healthcheck sub-app. Mounted with `app.route('/healthcheck', buildHealthcheckRoute())`.
 */
export function buildHealthcheckRoute(): Hono<{ Bindings: Bindings }> {
	const health = new Hono<{ Bindings: Bindings }>();

	health.get('/', (c) => {
		return c.json(
			{
				status: 'ok',
				service: 'cf-discord-relay',
				build: {
					hash: BUILD_HASH,
					timestamp: BUILD_TIMESTAMP,
				},
				time: new Date().toISOString(),
			},
			200,
			{
				// Defeat any intermediate CDN caching so mobile browsers see live state.
				'Cache-Control': 'no-store',
			},
		);
	});

	return health;
}
