# Cloudflare deployment

The production app is a Cloudflare Worker serving the Vite-built static app and a SQLite-backed Durable Object for each room. The same Worker handles room WebSockets, authoritative game turns, scoring, and the 40-second turn clock.

## One-time GitHub secrets (required to publish)

Cloudflare requires an account ID and a scoped API token for non-interactive deployments. Add these two secrets in the GitHub repository:

1. Open **Settings → Secrets and variables → Actions → New repository secret**.
2. Add `CLOUDFLARE_ACCOUNT_ID` with your Cloudflare account ID.
3. Add `CLOUDFLARE_API_TOKEN` with an API token scoped to the target account and the **Edit Cloudflare Workers** permission.
4. Open the **Actions** tab and run **Deploy to Cloudflare Workers**, or push a commit to `main`.

Create the token in Cloudflare Dashboard → Manage Account → Account API Tokens → Create Token → Custom → Edit Cloudflare Workers. Keep it in GitHub Secrets only; never commit it or paste it into chat. Cloudflare's official deployment guide documents these exact two values and the Wrangler GitHub Action.

After the workflow succeeds, GitHub Actions logs will show the deployed Worker URL. Enable the `workers.dev` subdomain in Cloudflare if the account has not enabled it already.

## Optional TURN for reliable voice

The app uses WebRTC peer-to-peer audio. STUN-only may work on many networks, but some mobile carriers, office Wi-Fi and restrictive NATs require a TURN relay.

Turnix offers a free plan with 10 GB of relay traffic per month and no credit card required. To enable it:
1. Create a free Turnix project and API token.
2. In Cloudflare Dashboard → Workers & Pages → domino-el-cafe → Settings → Variables and Secrets, add a secret named `TURNIX_API_TOKEN`.
3. The Worker requests short-lived ICE credentials server-side. The token is never sent to the browser.

Without the TURN secret, room chat and gameplay still work; voice may fail on restrictive networks. Check the provider's current free quota before sharing the game widely.

## Endpoints

- `GET /api/health` — health check.
- `POST /api/rooms` — create a six-digit room.
- `GET /api/rooms/:code` — public room snapshot.
- `POST /api/rooms/:code/ice` — server-side short-lived TURN credentials.
- `GET /ws/:code` — WebSocket room connection (membership, game, chat, voice signalling).

## Local checks

```bash
npm install
npm test
npm run build
npm run check:worker
```

The app is not considered published until the deployment workflow is green and `/api/health` returns `{ "ok": true }` on the deployed Worker.
