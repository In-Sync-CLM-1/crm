# crm-cron — scheduled jobs on Cloudflare Workers

This project's timed jobs run as **Cloudflare Workers** (one Worker per job, each
on its own Cron Trigger), not as `pg_cron` + `pg_net`. `pg_net` calls edge
functions over HTTP from inside the database, and that path suffers intermittent
DNS-resolution failures (it silently broke the sibling globalcrm project).
Workers run on Cloudflare's edge where DNS resolves reliably, and isolating one
job per Worker means a slow/failing function can't stall the rest.

## Files

- `src/index.js` — the shared Worker script. On its cron schedule it POSTs to
  one edge function (`TARGET_FN`) authenticated with the service-role key. The
  key is an **encrypted Worker secret**, never in source or in the cron table.
  A `TARGET_FN` of `rpc:<name>` calls a Postgres RPC instead of a function.
- `jobs.txt` — the manifest, one job per line, pipe-separated:
  `suffix|target_fn|body|schedule` (leave `body` empty for `{}`). One line =
  one Worker named `crm-cron-<suffix>`.

## Usage

Deployment is **automatic via GitHub Actions**, not a local script: pushing a
change to `cron-worker/**` on `main` triggers `.github/workflows/
cron-worker-deploy.yml`, which walks `jobs.txt`, generates a wrangler config
per line, deploys each Worker and re-puts the `SUPABASE_SERVICE_ROLE_KEY`
secret on it. It is idempotent, so re-running is safe.

To add or change a job: **edit `jobs.txt` and push.** If the service-role key
is rotated, update the `SUPABASE_SERVICE_ROLE_KEY` repo secret and re-run the
workflow (`workflow_dispatch`) to refresh it on every Worker.

Removing a line from `jobs.txt` stops that Worker being *updated*, but does
**not** delete it from Cloudflare — a removed job keeps running its old code
until the Worker is deleted by hand. Check the deployed list against this file
when auditing.

## pg_cron is empty

`cron.job` now returns **zero rows** (verified 2026-08-14) — every scheduled
job, including the pure-SQL ones that were originally kept in-database, runs
as a Worker from `jobs.txt`. Earlier revisions of this file listed five jobs as
"staying on pg_cron"; that is no longer true. Workers are the default for all
new scheduled work — don't add `cron.schedule(...)` to a migration.

## Requirements / notes

- Cloudflare **Workers Paid** plan (the shared account already has it). The free
  tier caps the account at 5 cron triggers.
- **Deployed Workers can outnumber `jobs.txt`.** As of 2026-08-14 there are 32
  `crm-cron-*` Workers for 31 manifest lines: `crm-cron-mkt-blog-writer`
  duplicates `crm-cron-linkedin-blog-writer` (both target `mkt-blog-writer`),
  and `crm-cron-process-operation-queue` is deliberately kept though it is not
  in the manifest. Both are known and intentional — but re-check this list when
  auditing, since a job deleted from `jobs.txt` keeps running until its Worker
  is removed by hand.
