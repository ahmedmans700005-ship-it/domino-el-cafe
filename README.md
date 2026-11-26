# Domino El Café

An original Egyptian-style domino game project, independent from the Naguib Selim employee dashboard.

## Implemented foundation
- Arabic RTL responsive lobby and felt-table interface.
- Four selectable formats: 1v1, 2v2, 3-player individual, and 4-player individual; target score 101 or 151.
- Double-six tile set and tested pure rules helpers: legal ends, orientation, draw-until-playable, blocked-round ranking and points.
- Desktop drag-and-drop plus touch/pointer selection for the tile preview.
- Cloudflare Worker + SQLite-backed Durable Object room service.
- Six-digit room creation, room membership, reconnectable player seats, live roster updates, real-time text chat, and WebRTC signalling relay.
- GitHub Actions CI runs tests and production build.

## Current status — important
The room service and chat backend are implemented in the repository, but **the Worker has not been deployed to Cloudflare yet**. Until deployment, create/join room actions will not work on a hosted site. The visible tile area is still a local preview, not an authoritative multiplayer match.

Still to implement: authoritative dealing and turn validation, the 40-second turn clock and automatic legal move, and full scoring/match completion. A client-side full-duplex WebRTC voice client is now wired to the room signalling relay, including background microphone mute and WebSocket reconnect; it still needs a configured TURN token and real multi-device/network testing before voice reliability can be claimed.

## Run frontend locally
```bash
npm install
npm run dev
npm test
npm run build
```

The local Vite server serves the UI; Cloudflare Durable Objects require the Worker runtime for real room tests.

## Cloudflare deployment
See [README-cloudflare.md](README-cloudflare.md) for GitHub integration, build/deploy commands, endpoints, and current Free-plan quotas. No credentials or payment details are stored in this repository.

## Rules still configurable
Egyptian house rules vary. Deal size, opening-double selection, pass/draw behavior and tie handling should remain configurable until the preferred table rules are confirmed.
