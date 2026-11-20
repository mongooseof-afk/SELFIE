# Tornado selfie server

Protocol 2 handles four-digit access codes and Liveness ID delivery for Spain and Portugal. It uses no ThunderBolt service. The APK still performs the actual selfie with the existing BLS/Oz flow; this server never declares a selfie valid and the BLS submission remains authoritative.

Sessions contain the BLS user/transaction IDs, IP and country encoded by the extension. They are held in memory for 15 minutes and are never written to logs or disk. Access codes are cryptographically random, unique among active sessions and claimable by one APK installation. Rechecking on the same installation is allowed. Code creation and lookups are rate limited.

API: `POST /create` with `{token}`; `POST /pincheck` with `{pin}` and `x-client-id`; `POST /update` with `{token,livenessValue}`; `POST /check` with `{token}`. Existing `GET/POST /v1/liveness-result` with the SHA-256 token in `x-session-id` remains supported. `GET /v2/health` confirms protocol 2 and its capabilities.

Deploy the server before installing Spain 1.8.32, Portugal 1.8.26, Tornado Selfie APK 1.0.12 and Launcher 1.8.20. The new APK is required for new-server codes; the old APK contacts a different code service. After deploying, generate fresh codes.

Run locally for the test suite with `npm test`. A phone or another PC needs a stable public HTTPS deployment. Set `PORT` and `HOST` when running `node server.js` behind a reverse proxy that provides HTTPS, use the same public origin in the extension helpers and APK configuration.

## Render

This repository is connected to the existing Render service. Deploy the updated main branch using `render.yaml` settings. Render assigns an `https://â€¦onrender.com` URL when the deployment is live. Use `npm test` before pushing. The service has a `/healthz` endpoint for Render's health check and listens on Render's `PORT` at `0.0.0.0`.

The release clients use `https://bls-liveness-relay.onrender.com`. Reload both unpacked extensions after installing the matching release. Use a single Render instance because pending results are held only in memory.

The server memory is intentionally ephemeral. Restarting it clears pending results. For a production deployment, run one process with automatic restart and HTTPS; do not expose it through an unauthenticated temporary tunnel.



## New BLS session-token handoff (protocol 3)

`POST /v3/create` accepts `{configuration}` from the new BLS Morocco website. Configuration contains `v:1`, the site's fresh `sessionToken` and `transactionId`, the approved `webAdapterUrl`, positive `appointmentId`, `issuedAt`, and a `resultChannel` for this relay's `/v1/liveness-result` endpoint. The server allocates a four-digit code from the existing shared code pool. `POST /pincheck` returns `kind: "oz-session-token"`, `country: "morocco-new"` and the original configuration to the claimed installation.

New codes expire within five minutes, sooner if their SDK JWT expiry or server TTL requires it. SDK tokens are forwarded unchanged; Oz and BLS remain responsible for validating capture and identity. The relay does not mint BLS tokens or mark a booking verified. Native browser access checks must complete normally. No voice AI is involved.

Results continue through `/v1/liveness-result` with the private 64-character return-channel ID. Existing CSV tokens, `/create`, `/update`, `/check`, and `/v2/health` stay compatible. `GET /v3/health` reports `oz-session-code` support. Restarting this in-memory service clears pending codes/results, so generate fresh codes after deployment.

Run `npm test` for the legacy and new-site regression tests. The matching client pair is Tornado Extension 1.1.20.1 and Selfie Pilot APK 1.0.6. Browser fixture tests do not replace a real Android capture and BLS verification test.
# Session IP diagnostics (3.1.0)

Legacy `/create` accepts an optional `generatedAt` epoch-millisecond timestamp from
the desktop extension. The IP already present in the legacy token is retained as
`networkContext.recordedIp`. Timestamp format and reasonable clock bounds are
validated. Missing/invalid client times use relay code-creation time and include
an explicit source/status; the session is not rejected for a clock difference.
Repeated `/create` requests preserve the first generation record.

Successful legacy `/pincheck` responses include `networkContext` with generation
metadata, `observedIp`, `observedAt`, `observationSource`, and `diagnosticOnly:true`.
Only the installation that claims the code receives this session response.
On Render (`RENDER=true`) the observation is the first address reported by its
`X-Forwarded-For` chain; elsewhere it is the transport peer address. These are
diagnostic observations, not proof of the SDK connection's address, device
identity, or verification outcome. No client header is added or rewritten.
These values do not influence authorization, result acceptance, or rate limits.

IPv4/IPv6 literals are validated and normalized, including IPv4-mapped IPv6.
Sessions and their diagnostic metadata keep the existing in-memory expiry.
No diagnostic endpoint, public IP log, external IP lookup service, proxy change,
or automatic rejection based on an IP difference is introduced.

References: [Render client IP reporting](https://render.com/articles/how-render-handles-ddos-attacks),
[Render environment variables](https://render.com/docs/environment-variables).



## Session header context (3.2.0)

`POST /create` optionally accepts `{token, headerContext}`. The version-1 context
contains `version:1`, `capturedAt` (epoch milliseconds), `ipAddress`, `UserAgent`,
`userUrl`, and optional `BrowserData`, `Platform`, `isMobile`. The IP must match
the token, the HTTPS source page must match its BLS country, and header values
must be bounded strings without control characters. Mobile is `?0` or `?1`.
The desktop captures these values from the same tab/document/form request.

The first context is immutable for that token. `/create` acknowledges it with
`headerContextVersion:1`; `/pincheck` returns the stored `headerContext` only to
the installation claiming the PIN. Context expires with the existing session.
A conflicting context returns 409; generate a new BLS session instead of changing
an existing one. Unknown fields are discarded. Nothing is written to logs/disk.

`GET /v2/health` includes `session-headers-v1`. Existing clients that omit the
context, protocol 3, result validation, rate limits, and code ownership retain
their previous behavior. Matching releases: desktop Portugal 1.8.46 and APK
1.0.20-session-headers. Deploy relay first, reload the desktop extension, install
the APK, then generate a fresh code. Restarting the in-memory relay clears
existing codes/results, as before. No BLS/Oz verification outcome is changed.
