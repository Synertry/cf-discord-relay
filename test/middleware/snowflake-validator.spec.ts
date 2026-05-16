/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module test/middleware/snowflake-validator.spec
 * Tests for the snowflake ID validation middleware.
 *
 * Specifically verifies that webhook paths `/webhooks/{id}/{token}` work
 * correctly: the webhook_id segment IS validated as a snowflake, but the
 * opaque token segment that follows it is NOT validated (the validator only
 * checks segments that immediately follow a known Discord resource keyword).
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { snowflakeValidatorMiddleware } from '../../src/middleware/snowflake-validator';

describe('Snowflake Validator Middleware', () => {
	const app = new Hono();
	app.use('*', snowflakeValidatorMiddleware);
	app.all('*', (c) => c.text('OK'));

	it('allows a valid channel snowflake', async () => {
		const res = await app.request('http://localhost/channels/123456789012345678/messages', { method: 'POST' });
		expect(res.status).toBe(200);
	});

	it('rejects an invalid channel snowflake with Discord-shaped error', async () => {
		const res = await app.request('http://localhost/channels/abc/messages', { method: 'POST' });
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body).toEqual({
			message: 'Invalid Form Body',
			code: 50035,
			errors: {
				channel_id: {
					_errors: [{ code: 'NUMBER_TYPE_COERCE', message: 'Value "abc" is not snowflake.' }],
				},
			},
		});
	});

	it('allows a webhook call with a valid webhook_id and an opaque token', async () => {
		// Critical test: the token contains letters, hyphens, and underscores -
		// not a snowflake - but must pass through unmodified.
		const res = await app.request('http://localhost/webhooks/123456789012345678/abcDEF_token-string-here', { method: 'POST' });
		expect(res.status).toBe(200);
	});

	it('rejects a webhook call with an invalid webhook_id', async () => {
		const res = await app.request('http://localhost/webhooks/abc/some-token', { method: 'POST' });
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body).toEqual({
			message: 'Invalid Form Body',
			code: 50035,
			errors: {
				webhook_id: {
					_errors: [{ code: 'NUMBER_TYPE_COERCE', message: 'Value "abc" is not snowflake.' }],
				},
			},
		});
	});

	it('allows webhook + token + valid trailing message_id', async () => {
		const res = await app.request(
			'http://localhost/webhooks/123456789012345678/some-token/messages/987654321098765432',
			{ method: 'PATCH' },
		);
		expect(res.status).toBe(200);
	});

	it('rejects webhook + token + invalid trailing message_id', async () => {
		const res = await app.request('http://localhost/webhooks/123456789012345678/some-token/messages/xyz', {
			method: 'PATCH',
		});
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body).toEqual({
			message: 'Invalid Form Body',
			code: 50035,
			errors: {
				message_id: {
					_errors: [{ code: 'NUMBER_TYPE_COERCE', message: 'Value "xyz" is not snowflake.' }],
				},
			},
		});
	});
});
