/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module test/routes/healthcheck.spec
 * Tests for the public, unauthenticated healthcheck endpoint.
 */

import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createApp } from '../../src/index';

const ENV_OVERRIDE = {
	...env,
	AUTH_KEY: 'relay-key-for-tests',
};

describe('public /healthcheck', () => {
	it('returns 200 without any auth header', async () => {
		const app = createApp();
		const res = await app.request('http://localhost/healthcheck', {}, ENV_OVERRIDE);
		expect(res.status).toBe(200);
	});

	it('returns the expected JSON shape with service=cf-discord-relay', async () => {
		const app = createApp();
		const res = await app.request('http://localhost/healthcheck', {}, ENV_OVERRIDE);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.status).toBe('ok');
		expect(body.service).toBe('cf-discord-relay');
		expect(body.build).toMatchObject({ hash: expect.any(String), timestamp: expect.any(String) });
		expect(body.time).toEqual(expect.any(String));
		expect(new Date(body.time as string).toString()).not.toBe('Invalid Date');
	});

	it('returns Cache-Control: no-store to defeat CDN caching', async () => {
		const app = createApp();
		const res = await app.request('http://localhost/healthcheck', {}, ENV_OVERRIDE);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
	});

	it('is reachable even when AUTH_KEY is unset (mounted before the sieve)', async () => {
		const app = createApp();
		const envNoAuth = { ...ENV_OVERRIDE, AUTH_KEY: '' };
		const res = await app.request('http://localhost/healthcheck', {}, envNoAuth);
		expect(res.status).toBe(200);
	});
});
