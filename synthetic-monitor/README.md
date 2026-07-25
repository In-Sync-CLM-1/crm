# synthetic-monitor

Health Sentinel's **front of house**. Every Sentinel check asserts the backend
heartbeat; this asserts what a real logged-in user actually sees.

It logs in as a dedicated read-only monitor account, discovers each app's routes
from its router definitions in the shipped JS bundle, visits every one, and fails
a route if the page throws, shows an error boundary, or fails to load its code.
That's the only thing that catches the two classes a 200-OK backend check misses:
a blank boot, and a per-route render crash.

## Run it

```sh
npm install                       # playwright
npx playwright install chromium

# 1. Provision / refresh the monitor account across the fleet (idempotent).
MGMT=<supabase management token> \
MON_EMAIL=<monitor email> MON_PASS=<monitor password> \
  node provision.mjs             # writes fleet.json

# 2. Probe the whole fleet, or one app.
SENTINEL_MONITOR_EMAIL=<monitor email> \
SENTINEL_MONITOR_PASSWORD=<monitor password> \
  node probe.mjs [appName]
```

`fleet.json` is generated, not tracked — run `provision.mjs` first on a fresh
clone. It holds each project's publishable key, which is browser-safe (already
baked into the shipped bundle), but there's no reason to keep a stale copy in git.

## Fleet coverage

`APPS` in `provision.mjs` lists only projects whose backend still exists and that
the management token can see: crm, globalcrm, event, ats, rmpl. Deliberately
excluded are work / fieldsync / expense / wa / email / website (backends deleted,
frontends still live) and vendorverification / smb-connect (different Supabase
orgs — they'd need their own management token).
