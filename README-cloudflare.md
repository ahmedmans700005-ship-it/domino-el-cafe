# Cloudflare backend setup

This repository uses a single Durable Object (SQLite-backed) per six-digit room. The Worker owns room creation and routes WebSocket connections to that room. The Durable Object is authoritative for room membership and relays chat and WebRTC signalling; game turns and scoring will be added to the same authoritative room state before public gameplay.

## Deploy

1. Connect this GitHub repository to Cloudflare Workers & Pages.
2. Choose **Workers** / Git integration and select the `main` branch.
3. Build command: `npm install && npm run build`
4. Deploy command: `npx wrangler deploy`
5. The Worker needs the Durable Object SQLite migration in `wrangler.toml`; the first deployment creates the `DominoRoom` class.
6. Keep the account on the Workers Free plan initially. Do not add a payment method or secret for this prototype.

## Endpoints

- `GET /api/health` — service health.
- `POST /api/rooms` JSON `{ "name": "nickname", "mode": "1v1", "target": 101 }` — create a room and receive its six-digit code.
- `GET /api/rooms/:code` — public room snapshot.
- `GET /ws/:code?name=nickname` with a WebSocket upgrade — join the room.
- WebSocket messages: `chat`, `voice-signal`, and `ping`.

A client should save the `playerId` received in the `welcome` message and send it as `playerId` on reconnect. This preserves the seat when a browser reconnects. A full room rejects new seats. Chat and voice signalling are relayed through the room; actual WebRTC media still requires browser permission and a reachable STUN/TURN path.

## Free-tier note

Cloudflare currently lists Durable Objects on Workers Free with SQLite storage, including 100,000 Durable Object requests/day and 13,000 GB-seconds/day. If a free limit is exceeded, that operation type fails until the daily reset. These are quotas, not a guarantee of unlimited concurrent play. Check current limits before inviting a large group.

## Current boundary

This backend foundation is not yet the finished game: authoritative dealing, turn validation, the 40-second clock, scoring, reconnect recovery during an active match, and the browser WebRTC client remain follow-up implementation work. Never treat the current lobby socket as a completed multiplayer match.

## Optional TURN relay for more reliable voice

The browser voice client is connected to the room's WebRTC signalling relay. For NAT/firewall networks that block direct peer-to-peer audio, configure a TURN provider. The code supports Turnix short-lived ICE credentials:
1. Create a Turnix project and an API bearer token from its console.
2. In Cloudflare Worker settings, add a secret named `TURNIX_API_TOKEN`.
3. The Worker requests short-lived ICE credentials when a connected room member enables the microphone; the token itself never reaches the browser.

Turnix lists a Free tier with 10 GB of relay traffic per month; check the provider's current quota and terms before relying on it. Without this secret the game uses public STUN only, so voice may fail on restrictive mobile or Wi-Fi networks. [Turnix pricing](https://turnix.io/) · [ICE credential API](https://turnix.io/docs/api-ice-credentials).
