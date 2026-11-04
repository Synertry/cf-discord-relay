/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module test/env
 * Adds the `AUTH_KEY` secret to `Cloudflare.Env`, the type `@cloudflare/vitest-plugin`
 * gives `env` from `cloudflare:test`. `wrangler types` leaves the secret out because it
 * is set in the Cloudflare dashboard, not in `wrangler.jsonc`.
 */
declare namespace Cloudflare {
	interface Env {
		AUTH_KEY: string;
	}
}
