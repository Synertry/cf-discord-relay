/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module test/middleware/access-logger.spec
 * Tests for the access-logger middleware.
 *
 * Verifies the log line format, webhook-token redaction, IP fallback when
 * CF-Connecting-IP is absent, UA truncation, origin omission, and the
 * critical safety property: `Authorization` header values never appear in logs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { accessLoggerMiddleware } from '../../src/middleware/access-logger';

describe('Access Logger Middleware', () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	const buildApp = () => {
		const app = new Hono();
		app.use('*', accessLoggerMiddleware);
		app.all('*', (c) => c.text('OK'));
		return app;
	};

	it('logs status, ms, method, path, ip, and ua', async () => {
		const app = buildApp();
		await app.request('http://localhost/users/@me', {
			method: 'GET',
			headers: { 'CF-Connecting-IP': '203.0.113.5', 'User-Agent': 'test-agent/1.0' },
		});

		expect(logSpy).toHaveBeenCalledTimes(1);
		const line = logSpy.mock.calls[0][0] as string;
		expect(line).toMatch(/^\[req\] 200 /);
		expect(line).toContain('ms ');
		expect(line).toContain(' GET  ');
		expect(line).toContain(' /users/@me');
		expect(line).toContain('ip=203.0.113.5');
		expect(line).toContain('ua="test-agent/1.0"');
	});

	it('redacts webhook tokens: /webhooks/{id}/{token} -> /webhooks/{id}/***', async () => {
		const app = buildApp();
		await app.request('http://localhost/webhooks/123456789012345678/super-secret-token-value', {
			method: 'POST',
			headers: { 'CF-Connecting-IP': '203.0.113.5' },
		});

		const line = logSpy.mock.calls[0][0] as string;
		expect(line).toContain('/webhooks/123456789012345678/***');
		expect(line).not.toContain('super-secret-token-value');
	});

	it('falls back to "?" when CF-Connecting-IP is absent', async () => {
		const app = buildApp();
		await app.request('http://localhost/users/@me', { method: 'GET' });

		const line = logSpy.mock.calls[0][0] as string;
		expect(line).toContain('ip=?');
	});

	it('truncates user-agent values over 80 characters', async () => {
		const app = buildApp();
		const longUa = 'A'.repeat(200);
		await app.request('http://localhost/users/@me', {
			method: 'GET',
			headers: { 'User-Agent': longUa },
		});

		const line = logSpy.mock.calls[0][0] as string;
		const uaMatch = line.match(/ua="([^"]+)"/);
		expect(uaMatch).not.toBeNull();
		expect(uaMatch![1].length).toBe(80);
		expect(uaMatch![1].endsWith('…')).toBe(true);
	});

	it('omits origin= when no Origin header is present', async () => {
		const app = buildApp();
		await app.request('http://localhost/users/@me', { method: 'GET' });

		const line = logSpy.mock.calls[0][0] as string;
		expect(line).not.toContain('origin=');
	});

	it('includes origin= when Origin header is present', async () => {
		const app = buildApp();
		await app.request('http://localhost/users/@me', {
			method: 'GET',
			headers: { Origin: 'https://script.google.com' },
		});

		const line = logSpy.mock.calls[0][0] as string;
		expect(line).toContain('origin=https://script.google.com');
	});

	it('never leaks the Authorization header value into the log line', async () => {
		const app = buildApp();
		const sensitiveToken = 'Bot ULTRA-SECRET-BOT-TOKEN-DO-NOT-LEAK';
		await app.request('http://localhost/users/@me', {
			method: 'GET',
			headers: { Authorization: sensitiveToken, 'User-Agent': 'normal-ua' },
		});

		expect(logSpy).toHaveBeenCalledTimes(1);
		const line = logSpy.mock.calls[0][0] as string;
		expect(line).not.toContain('ULTRA-SECRET-BOT-TOKEN-DO-NOT-LEAK');
		expect(line).not.toContain('Bot ');
	});
});
