# Tornado selfie server

Protocol 2 handles four-digit access codes and Liveness ID delivery for Spain and Portugal. It uses no ThunderBolt service. The APK still performs the actual selfie with the existing BLS/Oz flow; this server never declares a selfie valid and the BLS submission remains authoritative.

Sessions contain the BLS user/transaction IDs, IP and country encoded by the extension. They are held in memory for 15 minutes and are never written to logs or disk. Access codes are cryptographically random, unique among active sessions and claimable by one APK installation. Rechecking on the same installation is allowed. Code creation and lookups are rate limited.

API: `POST /create` with `{token}`; `POST /pincheck` with `{pin}` and `x-client-id`; `POST /update` with `{token,livenessValue}`; `POST /check` with `{token}`. Existing `GET/POST /v1/liveness-result` with the SHA-256 token in `x-session-id` remains supported. `GET /v2/health` confirms protocol 2 and its capabilities.

Deploy the server before installing Spain 1.8.32, Portugal 1.8.26, Tornado Selfie APK 1.0.12 and Launcher 1.8.20. The new APK is required for new-server codes; the old APK contacts a different code service. After deploying, generate fresh codes.

Run locally for the test suite with `npm test`. A phone or another PC needs a stable public HTTPS deployment. Set `PORT` and `HOST` when running `node server.js` behind a reverse proxy that provides HTTPS, use the same public origin in the extension helpers and APK configuration.

## Render

This repository is connected to the existing Render service. Deploy the updated main branch using `render.yaml` settings. Render assigns an `https://…onrender.com` URL when the deployment is live. Use `npm test` before pushing. The service has a `/healthz` endpoint for Render's health check and listens on Render's `PORT` at `0.0.0.0`.

The release clients use `https://bls-liveness-relay.onrender.com`. Reload both unpacked extensions after installing the matching release. Use a single Render instance because pending results are held only in memory.

The server memory is intentionally ephemeral. Restarting it clears pending results. For a production deployment, run one process with automatic restart and HTTPS; do not expose it through an unauthenticated temporary tunnel.

