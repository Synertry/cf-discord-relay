# Deploying cf-discord-relay to Your Own Cloudflare Account

End-to-end walkthrough for an operator who is comfortable with Cloudflare but new to Workers. Cloudflare dashboard, GitHub UI, and `git` are enough for everything. Step 3 (label sync) optionally uses a Bun script to provision the full label set in one shot.

## Prerequisites

- Cloudflare account
- A zone already added to Cloudflare DNS (any active site on the dashboard)
- GitHub account
- `git` installed locally
- Optional, only for Step 3 (label sync convenience): Bun and `gh` CLI

## Step 1: Fork and clone

1. Fork `https://github.com/Synertry/cf-discord-relay` on GitHub.
2. Clone your fork:
   ```bash
   git clone https://github.com/<you>/cf-discord-relay.git
   cd cf-discord-relay
   ```

## Step 2: Create the `production` branch

CI promotes `main` to `production` via auto-PR, then `deploy.yaml` fires on push to `production`. The branch must exist before the first run.

```bash
git checkout -b production
git push origin production
git checkout main
```

## Step 3: Sync repository labels

Several workflows (`ci.yaml` auto-PR, `pre-production-review.yaml`, `pr-labeler.yaml`, `stale-triage.yaml`) apply labels via `gh pr create --label` or `gh pr edit --add-label`. If a label does not exist on your fork those calls fail and the workflow errors out, so sync the label set BEFORE the first push to `main`.

The repo ships a script that creates all required labels (area, type, size, status, workflow buckets) in one shot. It needs Bun and an authenticated `gh` CLI. If you have not used `gh` against GitHub before, run `gh auth login` first.

```bash
bun install
bun .github/scripts/sync-labels.ts
```

The script defaults to whatever `gh repo view` returns from the current working directory. Pass `OWNER/REPO` explicitly to target a different fork:

```bash
bun .github/scripts/sync-labels.ts my-org/my-fork-name
```

Alternative without Bun: create each label manually via the GitHub web UI (Issues, Labels, New label) using the names, colors, and descriptions enumerated in `.github/scripts/sync-labels.ts`. About 35 entries. Tedious but works.

## Step 4: Gather Cloudflare values

### 4a. Confirm your zone

Cloudflare dashboard, Websites tab. The zone you want the relay subdomain under (for example `example.com`) must show status `Active`. The Worker route will auto-create the DNS record for the subdomain on first deploy, so you do NOT need to pre-create it.

Decide the relay hostname now (for example `relay.example.com`). You will use it as `CUSTOM_DOMAIN` in step 7.

### 4b. Account ID

Workers and Pages tab (or any zone overview page), right sidebar. Copy `Account ID`.

### 4c. API token

Cloudflare dashboard, My Profile, API Tokens, Create Token.

- Template: `Edit Cloudflare Workers`
- Account resources: include your account
- Zone resources: include the zone you picked in 4a
- Click `Continue to summary`, then `Create Token`
- Copy the token immediately. The dashboard will not show it again.

## Step 5: Create the GitHub PAT

Pushes and merges made with the default `GITHUB_TOKEN` do not retrigger downstream workflows. Several flows need a PAT to bridge that gap:

- `ci.yaml` pushes `main` to `production` (or opens an auto-PR) so `deploy.yaml` fires.
- `review-approval.yaml` fast-forwards `production` on `/approve` comments so `deploy.yaml` fires.
- `pr-test.yaml` runs `gh pr merge --auto --squash` for Dependabot PRs.

GitHub, Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.

- Resource owner: your account
- Repository access: only `cf-discord-relay`
- Repository permissions:
  - Contents: `Read and write`
  - Pull requests: `Read and write`
  - Workflows: `Read and write`
  - Metadata: `Read` (auto-selected)
- Expiration: pick a reasonable date and add a rotation reminder
- Copy the token

## Step 6: Create the Discord notification webhook

In any Discord server you control, channel Settings, Integrations, Webhooks, New Webhook. Name and channel are your call. Copy the webhook URL. Shape: `https://discord.com/api/webhooks/{id}/{token}`.

## Step 7: Add the core GitHub Actions secrets

Repo, Settings, Secrets and variables, Actions, `New repository secret`. Add the following five:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | From 4c |
| `CLOUDFLARE_ACCOUNT_ID` | From 4b |
| `CUSTOM_DOMAIN` | The relay hostname you picked in 4a (e.g. `relay.example.com`) |
| `DISCORD_WEBHOOK_URL` | From step 6 |
| `PAT` | From step 5 |

`AUTH_KEY` is set later (step 10 for the Worker itself, step 12 for the optional dogfeed notification path).

## Step 8: Personalize fork-specific references

The upstream files reference Synertry as the maintainer in three places that affect a fork's behavior. Edit all three before pushing.

### 8a. Pre-prod review reviewer

Edit `.github/workflows/pre-production-review.yaml`, line 22:

```yaml
REVIEWER: "<your-github-login>"
```

This is the login GitHub will request review from on every PR opened against `production`. Solo operators set it to their own login. Teams use `org/team-slug`.

### 8b. CODEOWNERS

Edit `.github/CODEOWNERS`:

```
src/*   @<your-github-login>
```

Without this change, any PR touching `src/` requests review from `@Synertry`, who is not a collaborator on your fork. If branch protection requires code owner reviews (a common default), those PRs block indefinitely.

### 8c. Dependabot assignees

Edit `.github/dependabot.yaml`. Both `assignees:` blocks (one per ecosystem) currently read:

```yaml
assignees:
  - Synertry
```

Replace `Synertry` with your GitHub login, or remove the `assignees:` block entirely. Otherwise Dependabot silently no-ops the assignment on every PR.

Optional while you are in this file: adjust `timezone: 'Europe/Berlin'` (appears under both `schedule:` blocks) if you want the daily Dependabot run at a different local time.

### Commit and push

```bash
git add .github/workflows/pre-production-review.yaml .github/CODEOWNERS .github/dependabot.yaml
git commit -m "chore(ci): personalize fork-specific references"
git push origin main
```

## Step 9: First deploy

Push `main` straight to `production` to trigger `deploy.yaml`:

```bash
git push origin main:production
```

Watch the run in GitHub, Actions, Deploy Worker. It will:

1. Substitute `CUSTOM_DOMAIN`, `BUILD_HASH`, `BUILD_TIMESTAMP` into `wrangler.jsonc`
2. Upload the Worker version (`wrangler versions upload`)
3. Promote it live (`wrangler versions deploy`)
4. Auto-create the DNS record for `CUSTOM_DOMAIN` and route requests to the Worker
5. Post a deploy embed to your Discord channel (direct path, since `AUTH_KEY` is not yet in GH secrets)

`/healthcheck` works immediately because it sits ahead of the auth sieve:

```bash
curl https://<your-relay-hostname>/healthcheck
```

Expected: HTTP 200 with `{"status":"ok","service":"cf-discord-relay","build":{...},"time":"..."}`.

Any authenticated path will return `503 Service misconfigured` until step 10.

## Step 10: Set `AUTH_KEY` on the Worker

Generate a long random value. Any method works. PowerShell example:

```powershell
[Convert]::ToBase64String([byte[]](1..48 | % { Get-Random -Max 256 }))
```

Bash example:

```bash
openssl rand -base64 48
```

Save the value. Then in the Cloudflare dashboard:

Workers and Pages, `cf-discord-relay`, Settings, Variables and Secrets, Add variable.

- Type: `Secret`
- Variable name: `AUTH_KEY`
- Value: the random string

Click Deploy. The change is live within seconds.

## Step 11: Smoke-test an authenticated path

Replace `<key>` and `<your-relay-hostname>`:

```bash
curl -H "x-auth-key: <key>" "https://<your-relay-hostname>/users/@me"
```

Expected: HTTP 401 from Discord (because no `Authorization: Bot ...` header was sent), forwarded through the relay. A 401 from Discord proves the relay accepted the auth, validated the path, and reached Discord successfully. Any `503` or `401 Unauthorized` from the relay itself means `AUTH_KEY` is wrong or unset.

## Step 12 (optional): Enable the dogfeed deploy notification

By default, `notify.yaml` posts deploy embeds straight to `DISCORD_WEBHOOK_URL`. To route them through your own relay first (and fall back to direct Discord on failure), add `AUTH_KEY` to GitHub Actions secrets with the same value you used in step 10.

Repo, Settings, Secrets and variables, Actions, New repository secret:

| Secret | Value |
|---|---|
| `AUTH_KEY` | Same string set on the Worker in step 10 |

Trigger any new deploy and the notify job log will show `Posted via cf-discord-relay (HTTP 204)` instead of going direct.

## Step 13 (recommended): Repo settings

### 13a. Allow auto-merge

Repo, Settings, General, Pull Requests section. Tick `Allow auto-merge`. Required for `pr-test.yaml`'s Dependabot job (`gh pr merge --auto --squash`). Without this, Dependabot PRs sit open with CI green and never merge themselves.

### 13b. Branch protection

Repo, Settings, Branches, Add branch protection rule (classic).

For `production`:

- Branch name pattern: `production`
- `Require a pull request before merging`: on
- `Require approvals`: 1
- `Allow specified actors to bypass required pull requests`: add `dependabot[bot]` so CI's `main` to `production` Dependabot fast-path keeps working

Do NOT add status checks on `production` itself. Checks live on the auto-PR to `production`, not on the branch.

For `main`:

- `Require a pull request before merging`: on
- `Require status checks to pass`: on, select `CI / Test`

## Step 14 (optional, cosmetic): Renames

These reference the upstream project name and are pure cosmetics. Functional behavior does not depend on them.

- `package.json`: `name`, `description`, `homepage`, `repository`, `bugs`
- `wrangler.jsonc`: `name` field. Changing this renames the Worker in your CF dashboard. The route auto-rebinds on next deploy.
- `.github/workflows/notify.yaml`: hardcoded `cf-discord-relay` strings in embed titles
- `README.md`: badges and acknowledgements

## Day-2 operations

### Trigger a deploy

Three ways:

- Push to `main`. CI runs, opens an auto-PR to `production`. Approve and either merge in the GitHub UI or comment `/approve` on the PR to fast-forward.
- For Dependabot bumps that pass CI, CI pushes directly to `production` (no PR step).
- Push manually: `git push origin main:production`.

### Rotate `AUTH_KEY`

1. Generate a new random value.
2. Cloudflare dashboard, Workers and Pages, `cf-discord-relay`, Settings, Variables and Secrets, edit `AUTH_KEY`. Deploy.
3. Update the `AUTH_KEY` GitHub Actions secret to the same value (otherwise dogfeed notifications break until you do).
4. Update every caller that uses the old key.

### Re-sync labels after schema change

When `.github/scripts/sync-labels.ts` gains a new label (or an existing one changes color or description), re-run the script. `gh label create --force` upserts, so it is safe to run repeatedly.

```bash
bun .github/scripts/sync-labels.ts
```

### View logs

Cloudflare dashboard, Workers and Pages, `cf-discord-relay`, Logs. The `observability.logs` block in `wrangler.jsonc` keeps these persisted. One line per request, with webhook tokens redacted.

### Local development

See [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md). Requires Bun.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/healthcheck` returns 404 from Cloudflare | DNS for `CUSTOM_DOMAIN` not yet propagated, or the Worker route was not created. Wait 60s, then check `Workers and Pages, cf-discord-relay, Settings, Domains and routes`. |
| `503 Service misconfigured` on every authenticated path | `AUTH_KEY` not set on the Worker. Step 10. |
| `401 Unauthorized` on every authenticated path | Wrong `x-auth-key` header. Compare with the value in the Worker dashboard. |
| Workflow run fails with `could not add label: 'xxx' not found` | Labels not synced on the fork. Step 3. |
| PRs to `main` block on "Required review from code owners" | `.github/CODEOWNERS` still lists `@Synertry`. Step 8b. |
| Dependabot PR sits open with CI green but never merges | `Allow auto-merge` not enabled on the repo. Step 13a. |
| Deploy succeeds but notify job posts nothing | `DISCORD_WEBHOOK_URL` secret missing or wrong. |
| `deploy.yaml` does not run after CI pushes to `production` | `PAT` secret missing or expired. Default `GITHUB_TOKEN` pushes do not trigger downstream workflows. |
| Deploy embed shows `Relay returned HTTP 503; falling back to direct Discord webhook` | The Worker is up but `AUTH_KEY` GH secret and Worker secret have drifted. Re-sync them. |
