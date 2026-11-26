# Domino El Café

A new, independent Egyptian-style online domino project. This repository is separate from the Naguib Selim employee dashboard.

## First foundation committed
- Arabic RTL responsive lobby and felt-table interface.
- Four selectable table formats: 1v1, 2v2, 3-player individual, and 4-player individual.
- Double-six tile set and pure, testable rules helpers.
- Choose left/right placement; desktop supports dragging a tile onto an end.
- Automatic draw-until-playable helper and local demo flow.
- Blocked-round resolver waits for an empty boneyard and no legal moves.

## Run locally
```bash
npm install
npm run dev
npm run build
```

## Current status
This is an early frontend/rules prototype, **not yet a live multiplayer game**. Room synchronization, server-authoritative turns and timers, chat, animated reactions, WebRTC voice, persistence, and deployment remain to be implemented.

Mobile drag interactions and orientation lock need device testing. Browsers and operating systems may suspend microphone/network activity while an app is backgrounded; the game will mute on visibility changes and recover/reconnect where possible.

## Rules requiring confirmation
Egyptian house rules vary. Deal size, opening-double selection, draw/pass policy, blocked-round scoring and tie handling must be configurable and agreed before competitive play.
