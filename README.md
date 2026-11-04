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



## New BLS session-token handoff (protocol 3)

`POST /v3/create` accepts `{configuration}` from the new BLS Morocco website. Configuration contains `v:1`, the site's fresh `sessionToken` and `transactionId`, the approved `webAdapterUrl`, positive `appointmentId`, `issuedAt`, and a `resultChannel` for this relay's `/v1/liveness-result` endpoint. The server allocates a four-digit code from the existing shared code pool. `POST /pincheck` returns `kind: "oz-session-token"`, `country: "morocco-new"` and the original configuration to the claimed installation.

New codes expire within five minutes, sooner if their SDK JWT expiry or server TTL requires it. SDK tokens are forwarded unchanged; Oz and BLS remain responsible for validating capture and identity. The relay does not mint BLS tokens or mark a booking verified. Native browser access checks must complete normally. No voice AI is involved.

Results continue through `/v1/liveness-result` with the private 64-character return-channel ID. Existing CSV tokens, `/create`, `/update`, `/check`, and `/v2/health` stay compatible. `GET /v3/health` reports `oz-session-code` support. Restarting this in-memory service clears pending codes/results, so generate fresh codes after deployment.

Run `npm test` for the legacy and new-site regression tests. The matching client pair is Tornado Extension 1.1.20.1 and Selfie Pilot APK 1.0.6. Browser fixture tests do not replace a real Android capture and BLS verification test.
