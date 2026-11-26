import { cleanChatMessage, cleanPlayerName, createRoomState, normalizeRoomOptions, roomSnapshot } from "./room-utils.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const roomCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, service: "domino-el-cafe" });

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid room options" }, 400);
      const name = cleanPlayerName(body.name);
      if (!name) return json({ error: "اكتب اسمك الأول" }, 400);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = roomCode();
        const id = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(id);
        const result = await stub.fetch("https://room.internal/create", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, mode: body.mode, target: body.target })
        });
        if (result.status === 201) return json({ code, ...normalizeRoomOptions(body) });
      }
      return json({ error: "تعذر إنشاء الغرفة، جرّب مرة أخرى" }, 503);
    }

    const iceMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})\/ice$/);
    if (iceMatch && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      if (!body || typeof body.playerId !== "string" || body.playerId.length > 80) return json({ error: "Player session required" }, 401);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(iceMatch[1]));
      const access = await stub.fetch(`https://room.internal/ice-access?playerId=${encodeURIComponent(body.playerId)}`);
      if (!access.ok) return json({ error: "لازم تكون داخل الغرفة قبل تشغيل الصوت" }, 403);

      const fallback = [{ urls: "stun:stun.l.google.com:19302" }];
      if (!env.TURNIX_API_TOKEN) return json({ iceServers: fallback, turnAvailable: false });
      try {
        const turnResponse = await fetch("https://turnix.io/api/v1/credentials/ice", {
          method: "POST",
          headers: {
            "authorization": `Bearer ${env.TURNIX_API_TOKEN}`,
            "content-type": "application/json",
            "x-turn-client-ip": request.headers.get("cf-connecting-ip") || ""
          },
          body: JSON.stringify({ room: iceMatch[1], ttl: 3600 })
        });
        if (!turnResponse.ok) return json({ iceServers: fallback, turnAvailable: false });
        const turnData = await turnResponse.json();
        if (!Array.isArray(turnData.iceServers) || !turnData.iceServers.length) return json({ iceServers: fallback, turnAvailable: false });
        return json({ iceServers: turnData.iceServers, turnAvailable: true });
      } catch {
        return json({ iceServers: fallback, turnAvailable: false });
      }
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})$/);
    if (roomMatch && request.method === "GET") {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomMatch[1]));
      return stub.fetch("https://room.internal/snapshot");
    }

    const wsMatch = url.pathname.match(/^\/ws\/(\d{6})$/);
    if (wsMatch && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(wsMatch[1]));
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  }
};

export class DominoRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.room = null;
    this.loading = null;
  }

  async load() {
    if (!this.loading) this.loading = this.ctx.storage.get("room").then(value => { this.room = value ?? null; });
    await this.loading;
  }

  async save() {
    await this.ctx.storage.put("room", this.room);
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);
    if (url.pathname === "/create" && request.method === "POST") {
      if (this.room) return json({ error: "Room exists" }, 409);
      const body = await request.json();
      this.room = createRoomState(body.code, body);
      await this.save();
      return json({ ok: true }, 201);
    }
    if (!this.room) return json({ error: "الغرفة غير موجودة" }, 404);
    if (url.pathname === "/snapshot") return json(roomSnapshot(this.room));
    if (url.pathname === "/ice-access" && request.method === "GET") {
      const player = this.room.players.find(p => p.id === url.searchParams.get("playerId") && p.connected);
      return player ? json({ ok: true }) : json({ error: "Not a connected room player" }, 403);
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "WebSocket required" }, 426);

    const name = cleanPlayerName(url.searchParams.get("name"));
    if (!name) return json({ error: "Name required" }, 400);
    const requestedId = url.searchParams.get("playerId");
    let player = requestedId ? this.room.players.find(p => p.id === requestedId) : null;
    if (!player) {
      if (this.room.players.length >= this.room.maxPlayers) return json({ error: "الغرفة مكتملة" }, 409);
      player = { id: crypto.randomUUID(), name, connected: true, joinedAt: Date.now(), lastChatAt: 0 };
      this.room.players.push(player);
    } else {
      player.name = name;
      player.connected = true;
    }
    this.room.status = this.room.players.length >= this.room.maxPlayers ? "full" : "waiting";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [player.id]);
    server.serializeAttachment({ playerId: player.id });
    await this.save();
    this.broadcast({ type: "room", room: roomSnapshot(this.room) });
    server.send(JSON.stringify({ type: "welcome", playerId: player.id, room: roomSnapshot(this.room) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(payload); } catch {}
    }
  }

  async webSocketMessage(socket, raw) {
    await this.load();
    if (String(raw).length > 65536) return;
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    const attachment = socket.deserializeAttachment();
    const player = this.room?.players.find(p => p.id === attachment?.playerId);
    if (!player || !message || typeof message.type !== "string") return;

    if (message.type === "leave") {
      this.room.players = this.room.players.filter(p => p.id !== player.id);
      this.room.status = this.room.players.length >= this.room.maxPlayers ? "full" : "waiting";
      await this.save();
      this.broadcast({ type: "room", room: roomSnapshot(this.room) });
      try { socket.close(1000, "Player left"); } catch {}
      return;
    }

    if (message.type === "chat") {
      const text = cleanChatMessage(message.text);
      if (!text) return;
      const now = Date.now();
      if (now - (player.lastChatAt || 0) < 700) return;
      player.lastChatAt = now;
      const item = { id: crypto.randomUUID(), playerId: player.id, name: player.name, text, at: now };
      this.room.chat.push(item);
      this.room.chat = this.room.chat.slice(-50);
      await this.save();
      this.broadcast({ type: "chat", message: item });
      return;
    }

    if (message.type === "voice-signal" && typeof message.to === "string") {
      const target = this.room.players.find(p => p.id === message.to);
      if (!target || !message.signal || typeof message.signal !== "object") return;
      const encoded = JSON.stringify({ type: "voice-signal", from: player.id, signal: message.signal });
      for (const peer of this.ctx.getWebSockets(target.id)) {
        try { peer.send(encoded); } catch {}
      }
      return;
    }

    if (message.type === "ping") {
      try { socket.send(JSON.stringify({ type: "pong", at: Date.now() })); } catch {}
    }
  }

  async webSocketClose(socket) {
    await this.markDisconnected(socket);
  }

  async webSocketError(socket) {
    await this.markDisconnected(socket);
  }

  async markDisconnected(socket) {
    await this.load();
    const playerId = socket.deserializeAttachment()?.playerId;
    const player = this.room?.players.find(p => p.id === playerId);
    if (!player) return;
    const stillConnected = this.ctx.getWebSockets(playerId).some(peer => peer !== socket);
    player.connected = stillConnected;
    await this.save();
    this.broadcast({ type: "room", room: roomSnapshot(this.room) });
  }
}
