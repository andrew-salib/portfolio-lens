# GitHub Pages and laptop backend

The public front end deploys from `main` through `.github/workflows/pages.yml`.
Its repository variable `API_URL` points to the laptop's HTTPS tunnel.
Without an available backend, GET requests fall back to bundled ETF snapshots;
the app labels this mode and never pretends an offline CSV upload was saved.
The snapshot dates remain visible. They are sample data, not live market data.

## Running the backend

Use Node 22.13 or newer, GitHub CLI authenticated to the repository, and
`cloudflared` on your PATH. Install dependencies with `npm run install:ci`,
then `npm run build` and `npm run backend:host`.

The runner starts the production Worker locally on port 8787, a protected API
gateway on 8788, and an HTTPS Cloudflare Quick Tunnel. Both local listeners bind
only to 127.0.0.1. Expose **8788 only**, never the unprotected worker or Vite.
No router port forwarding is required.

The tunnel address changes after a restart. The runner updates the GitHub
`API_URL` variable and triggers a Pages rebuild automatically. During this
rebuild, the old address may be unavailable and the front end uses samples.
Quick Tunnels are for temporary/testing use, with no uptime guarantee; use a
named tunnel and stable domain if keeping this arrangement longer term.

macOS login service: `~/Library/LaunchAgents/com.andrew.portfolio-lens.plist`.
Logs and the current tunnel address are in ignored `backend-data/`.
The service restarts after a crash and at login. It prevents idle sleep while
running, but closing the lid, logging out, losing internet or shutting down
still takes the backend offline.

After backend code changes, run `npm run build`, then:

```sh
launchctl kickstart -k gui/$(id -u)/com.andrew.portfolio-lens
```

To stop automatic hosting:

```sh
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.andrew.portfolio-lens.plist
```

Back up `.wrangler/state/` (ETF SQLite data) and `backend-data/` (rate counters)
while the backend is stopped. Never commit either directory.

## Abuse limits

- 120 API requests per visitor IP per minute.
- 3 CSV imports or forced ETF refreshes per IP per 15 minutes.
- 20 imports/forced refreshes across all visitors per hour.
- One upload at a time, with a 2 MB JSON body limit and 25-second upstream timeout.
- Only the three portfolio API paths are exposed, with a restricted browser origin.
- Counters persist in SQLite across gateway restarts; rejected attempts count.

Cloudflare supplies `CF-Connecting-IP`. The gateway trusts it because its public
entry point is exclusively the tunnel. Do not expose the gateway directly through
router forwarding without changing this trust model. CORS is not authentication.
Public imports still modify the shared ETF catalogue; rate limits bound abuse but
do not prevent malicious edits. Add owner authentication before broader use.

GitHub pushes redeploy the front end only. Backend updates require rebuilding
and restarting this laptop service.

## Mandatory backend deployment check

Pages checks `/api/deployment` before building and immediately before publishing.
The gateway checks the worker's search endpoint and seeded performance database,
then reports the backend source fingerprint captured at service startup. The
workflow compares it with the backend inputs in its own checkout. There is no
skip input; missing, unhealthy, or outdated backends fail the deployment.

`npm run build` records source and compiled-artifact hashes in the ignored
`backend-data/build-version.json`. The supervisor refuses to start if either has
changed since the build. Backend inputs include `app/api`, `db`, `drizzle`, `lib`,
`scripts`, package manifests/lockfiles, and backend build configuration. Shared
library edits therefore conservatively require a backend deployment too.

After merging backend work, apply any new migrations and required data seeds,
run `npm run build` from the merged code, and restart the service using the command
above. The new tunnel updates `API_URL` and starts another Pages deployment.
The first deployment after introducing this gate will fail until the laptop is
updated. An unavailable laptop also blocks new frontend deployments; already
published pages continue to use bundled fallback data.

This is a deployment-time check, not continuous uptime monitoring. Future API
features needing new database tables should extend the health probes. GitHub
workflow edits by repository administrators can change the gate.
