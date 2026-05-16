/*
 *               cf-discord-relay
 *     Copyright (c) Synertry 2026.
 * Distributed under the Boost Software License, Version 1.0.
 *     (See accompanying file LICENSE or copy at
 *           https://www.boost.org/LICENSE_1_0.txt)
 */

/**
 * @module types
 * Worker binding types.
 *
 * The relay deliberately exposes a single binding (`AUTH_KEY`). It does NOT
 * store Discord bot tokens, webhook secrets, or admin keys. Callers carry
 * their own Discord credentials (in URL path for webhooks, in `Authorization`
 * header for bot API endpoints), and the relay forwards them untouched.
 */

export type Bindings = {
	/** Shared secret callers present via the `x-auth-key` request header. */
	AUTH_KEY: string;
};
