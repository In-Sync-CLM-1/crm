# crm-cron — scheduled jobs on Cloudflare Workers

This project's timed jobs run as **Cloudflare Workers** (one Worker per job, each
on its own Cron Trigger), not as `pg_cron` + `pg_net`. `pg_net` calls edge
functions over HTTP from inside the database, and that path suffers intermittent
DNS-resolution failures (it silently broke the sibling globalcrm project).
Workers run on Cloudflare's edge where DNS resolves reliably, and isolating one
job per Worker means a slow/failing function can't stall the rest.

## Files

- `src/worker.js` — the shared Worker script. On its cron schedule it POSTs to
  one edge function (`TARGET_FN`) authenticated with the service-role key. The
  key is an **encrypted Worker secret**, never in source or in the cron table.
- `jobs.json` — the manifest: `name | fn | schedule | (optional) body`. One
  entry = one Worker named `crm-cron-<name>`.
- `deploy.mjs` — deploys/updates every Worker + its schedule from the manifest.
  Re-runnable and idempotent.
- `verify.mjs` — lists the Workers, confirms each schedule is attached, and
  proves auth/routing by replicating the Worker's request against a safe
  function.
- `watch-firstrun.mjs` — one-time helper that polls analytics until a Worker
  cron tick is observed.

All scripts read credentials from the project `../.env`
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`). Nothing secret is committed.

## Usage

```bash
node cron-worker/deploy.mjs    # deploy / update all Workers from jobs.json
node cron-worker/verify.mjs    # confirm schedules + auth
```

To add or change a job: edit `jobs.json`, then re-run `deploy.mjs`.
If the service-role key is ever rotated, re-run `deploy.mjs` to refresh the
secret on every Worker.

## What stayed on pg_cron

Five jobs run pure in-database SQL (no HTTP), so the `pg_net` problem never
touched them — they remain on `pg_cron`:
`retry-failed-whatsapp-messages`, `check-inactive-contacts`,
`process-time-based-triggers`, `aggregate-automation-performance`,
`sync-platform-email-list-daily`.

## Requirements / notes

- Cloudflare **Workers Paid** plan (the shared account already has it). The free
  tier caps the account at 5 cron triggers.
- The 35 old `pg_net` cron jobs were **disabled** (`active = false`), not
  deleted, so this is reversible. To roll back: re-enable them
  (`select cron.alter_job(jobid, active := true) ...`) and remove the Worker
  schedules.
- `linkedin-blog-writer` and `mkt-blog-writer` both target `mkt-blog-writer` at
  `0 16 * * *` — a pre-existing duplicate, replicated as-is. Drop one if the
  double-run is unintended.
