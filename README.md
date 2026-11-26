# Domino El Café

An original Egyptian-style domino game project, independent from the Naguib Selim employee dashboard.

## Implemented
- Arabic RTL responsive lobby and felt-table UI; four game modes and 101/151 targets.
- Double-six rules engine with legal ends, correct left/right orientation, draw-until-playable, blocked-round ranking and points.
- Server-authoritative Cloudflare Durable Object rooms with six-digit codes, player seats, reconnect handling, chat and WebRTC signalling.
- Automatic round start when the selected room fills; seven tiles per player; highest available double opens the round.
- Server-side move validation, 40-second turn deadline, deterministic automatic legal move on timeout, automatic draw until playable, and blocked-round detection.
- Individual scoring and team scoring for 2v2; rounds continue until 101/151 is reached.
- Full-duplex browser WebRTC audio client, background mute, reconnect recovery, optional TURN credentials.
- Installable PWA shell, SVG app icon, landscape/fullscreen control, desktop drag-and-drop and touch selection.
- GitHub Actions tests, Vite production build and Wrangler Worker dry-run.

## Publishing status
**Not deployed yet.** A manual Cloudflare deployment workflow is ready. It requires the two GitHub Actions secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Follow [README-cloudflare.md](README-cloudflare.md); the production URL will appear in the successful deploy log.

Voice works with STUN on compatible networks. For more reliable mobile/NAT connectivity, configure the optional `TURNIX_API_TOKEN` secret in Cloudflare. Multi-device live testing must be performed after deployment.

## Local checks
```bash
npm install
npm test
npm run build
npm run check:worker
```

## Rules assumptions
The first implementation deals seven tiles to each player and opens with the highest double among dealt hands. If no player has a double, the highest pip total opens. Egyptian table variants can differ; these choices can be adjusted later without changing the networking architecture.
