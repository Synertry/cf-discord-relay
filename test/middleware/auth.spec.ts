/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module test/middleware/auth.spec
 * Tests for the authentication middleware.
 *
 * Verifies rejection of missing/invalid API keys, fail-closed behavior when
 * `AUTH_KEY` is unset, acceptance via `x-auth-key`, and the deliberate
 * divergence from the parent project: `Authorization` is NOT accepted.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../../src/middleware/auth';
import type { Bindings } from '../../src/types';

describe('Auth Middleware', () => {
	/** Minimal Hono app with only the auth middleware and a success handler. */
	const app = new Hono<{ Bindings: Bindings }>();
	app.use('*', authMiddleware);
	app.get('/', (c) => c.text('OK'));

	const MOCK_ENV: Bindings = {
		AUTH_KEY: 'secret-key',
	};

	it('returns 503 if AUTH_KEY binding is missing', async () => {
		const envWithoutAuthKey: Bindings = { AUTH_KEY: '' };
		const res = await app.request('http://localhost/', { headers: { 'x-auth-key': 'secret-key' } }, envWithoutAuthKey);
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body).toEqual({ error: 'Service misconfigured' });
	});

	it('returns 401 when no auth header is sent', async () => {
		const res = await app.request('http://localhost/', {}, MOCK_ENV);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual({ error: 'Unauthorized' });
	});

	it('returns 401 when x-auth-key is wrong', async () => {
		const res = await app.request('http://localhost/', { headers: { 'x-auth-key': 'wrong-key' } }, MOCK_ENV);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual({ error: 'Unauthorized' });
	});

	it('returns 401 when the relay key is supplied via the standard Authorization header (deliberate divergence)', async () => {
		// The relay does NOT accept Authorization as a source for its own key,
		// because that header is reserved for the caller's Discord credentials.
		const res = await app.request(
			'http://localhost/',
			{ headers: { Authorization: 'Bearer secret-key' } },
			MOCK_ENV,
		);
		expect(res.status).toBe(401);
	});

	it('returns 200 when x-auth-key matches', async () => {
		const res = await app.request('http://localhost/', { headers: { 'x-auth-key': 'secret-key' } }, MOCK_ENV);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('OK');
	});
});
