/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module routes/proxy
 * Pure pass-through forwarder to the Discord API.
 *
 * Strips internal relay headers (`x-auth-key`, `host`, `x-proxy-context`), then
 * forwards method/path/query/body to `https://discord.com/api/v10/{path}` with
 * all remaining caller headers preserved, including the caller's `Authorization`
 * (if any). Webhook calls work without `Authorization` because the webhook token
 * in the URL path serves as authentication. Returns Discord's response unchanged
 * except for 429 reformatting handled by the upstream rate-limit interceptor.
 */

import { Hono } from 'hono';
import type { Bindings } from '../types';

/** Context variables: optional fetch override for tests. */
export type ProxyFetchVariables = {
	proxyFetch?: typeof fetch;
};

/** Catch-all proxy route - forwards any unmatched request to Discord API v10. */
export const proxyRoute = new Hono<{
	Bindings: Bindings;
	Variables: ProxyFetchVariables;
}>();

/**
 * Internal headers that must not be forwarded to the Discord API.
 *
 * `Authorization` is deliberately NOT in this set - it belongs to the caller
 * and Discord needs it for bot-API endpoints.
 */
const STRIPPED_HEADERS = new Set(['host', 'x-auth-key', 'x-proxy-context']);

type SafeInit = RequestInit & { duplex?: 'half' };

proxyRoute.all('/*', async (c) => {
	const url = new URL(c.req.url);
	const method = c.req.method;
	const discordUrl = `https://discord.com/api/v10${url.pathname}${url.search}`;

	try {
		// Clone incoming headers, stripping internal proxy headers and Host.
		const cleanHeaders = new Headers();
		c.req.raw.headers.forEach((v, k) => {
			if (!STRIPPED_HEADERS.has(k.toLowerCase())) cleanHeaders.set(k, v);
		});

		// Build fetch init - include body + duplex for methods that carry a payload.
		const safeInit: SafeInit = { method, headers: cleanHeaders };
		if (method !== 'GET' && method !== 'HEAD') {
			safeInit.body = c.req.raw.body;
			safeInit.duplex = 'half'; // Required for streaming request bodies in Workers.
		}

		const fetcher = c.var.proxyFetch ?? fetch;
		return await fetcher(discordUrl, safeInit as RequestInit);
	} catch (err: unknown) {
		console.error('PROXY ERR:', err);
		return c.json({ error: 'Proxy error' }, 500);
	}
});
