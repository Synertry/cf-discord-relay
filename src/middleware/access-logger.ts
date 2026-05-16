/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module middleware/access-logger
 * One structured log line per inbound request, written to Cloudflare Workers logs.
 *
 * The line includes status, duration, method, redacted path, client IP, truncated
 * user agent, and optional Origin. Webhook tokens in the path are replaced with
 * `***`. The middleware never logs request/response bodies, nor the value of the
 * `Authorization` header, both of which may carry Discord credentials.
 *
 * Format:
 *   `[req] {status} {ms}ms {method} {redacted_path}   ip={ip} ua="{ua}"[ origin={origin}]`
 */

import { createMiddleware } from 'hono/factory';

/** Truncate user-agent values past this length to keep log lines bounded. */
const UA_MAX_LEN = 80;

/** Matches a webhook token segment so it can be redacted in logs. */
const WEBHOOK_TOKEN_PATTERN = /(\/webhooks\/\d+\/)[^/?]+/;

/**
 * Logs one structured line per inbound request after the response is finalized.
 *
 * Place this AFTER auth and snowflake-validator in the sieve so failed requests
 * (401/400) are logged with their actual final status - useful for spotting
 * brute-force attempts and malformed traffic.
 */
export const accessLoggerMiddleware = createMiddleware(async (c, next) => {
	const t0 = Date.now();
	await next();
	const ms = Date.now() - t0;

	const status = c.res.status;
	const method = c.req.method;
	const url = new URL(c.req.url);
	const redactedPath = (url.pathname + url.search).replace(WEBHOOK_TOKEN_PATTERN, '$1***');
	// CF-Connecting-IP is set by Cloudflare's edge and cannot be spoofed by the
	// client. X-Forwarded-For is intentionally not used because it can be.
	const ip = c.req.header('cf-connecting-ip') ?? '?';
	const rawUa = c.req.header('user-agent') ?? '';
	const ua = rawUa.length > UA_MAX_LEN ? rawUa.slice(0, UA_MAX_LEN - 1) + '…' : rawUa;
	const origin = c.req.header('origin');
	const originSuffix = origin ? ` origin=${origin}` : '';

	console.log(
		`[req] ${String(status).padEnd(3)} ${String(ms).padStart(5)}ms ${method.padEnd(6)} ${redactedPath}   ip=${ip} ua="${ua}"${originSuffix}`,
	);
});
