# Contributing to cf-discord-relay

Thank you for your interest in contributing!

## Branching Strategy

- **`main`**: This is the default branch for all development. Please target this branch for your Pull Requests.
- **`production`**: This is the protected branch for production releases. Changes from `main` are merged here via automated PRs.

## Workflow

1. Fork the repository.
2. Create a feature branch from `main`: `git checkout -b feat/my-feature main`
3. Make your changes.
4. Run tests locally: `bun run test`
5. If logic changes, regenerating types might be needed: `bun run cf-typegen`
6. Push to your fork and submit a PR to the **`main`** branch.

## Local Development

```bash
bun install                # install dependencies
bun run cf-typegen         # regenerate worker-configuration.d.ts
bun wrangler dev           # local dev server on http://127.0.0.1:8787
```

`wrangler dev` reads runtime secrets from a gitignored `.dev.vars` file at the repo root. Drop an `AUTH_KEY` line in it before starting the server.

```bash
# Bash / Zsh
echo "AUTH_KEY=$(openssl rand -base64 48)" > .dev.vars
```

```powershell
# PowerShell
"AUTH_KEY=$([Convert]::ToBase64String([byte[]](1..48 | % { Get-Random -Max 256 })))" | Set-Content .dev.vars
```

Smoke-test the server:

```bash
curl http://127.0.0.1:8787/healthcheck
```

## Code Style

- We use **Prettier** for formatting.
- Run `bun run lint` to check for type errors.
- Commit messages should follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

## CI/CD

When you open a PR to `main`:

- A lightweight `pr-test` workflow will run linting and tests.
- If strictly documentation is changed, some heavy tests may be skipped.

Once merged to `main`:

- The CI pipeline runs.
- If successful, a PR is automatically created to merge `main` into `production`.
