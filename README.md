# Liveness result relay

This is a small relay for one value only: a UUID result linked to a SHA-256 session hash. It holds each value for 15 minutes in memory, never stores the original liveness link, and only allows browser requests from `https://www.blsspainmorocco.net`.

Run locally for the test suite with `npm test`. A phone or another PC needs a stable public HTTPS deployment. Set `PORT` and `HOST` when running `node server.js` behind a reverse proxy that provides HTTPS, then copy its public origin into both extension `liveness-relay-config.js` files.

## Render

Create a new Git repository containing this folder's files, then create a Render Blueprint from `render.yaml`. Render assigns an `https://…onrender.com` URL when the deployment is live. Use `npm test` before pushing. The service has a `/healthz` endpoint for Render's health check and listens on Render's `PORT` at `0.0.0.0`.

Copy the full Render origin, without a trailing slash, into both extension config files. Reload both unpacked extensions after saving. Use a single Render instance because pending results are held only in memory.

The server memory is intentionally ephemeral. Restarting it clears pending results. For a production deployment, run one process with automatic restart and HTTPS; do not expose it through an unauthenticated temporary tunnel.
