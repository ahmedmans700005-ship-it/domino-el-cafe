export class RoomVoice {
  constructor({ roomCode, getSocket, getPlayerId, onStatus = () => {} }) {
    this.roomCode = roomCode;
    this.getSocket = getSocket;
    this.getPlayerId = getPlayerId;
    this.onStatus = onStatus;
    this.enabled = false;
    this.muted = false;
    this.stream = null;
    this.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    this.hasTurn = false;
    this.peers = new Map();
    this.mutedPeers = new Set();
    this.players = [];
    this.pendingSignals = [];
    this.pendingCandidates = new Map();
    this.wasMutedBeforeHide = false;
    this.onVisibility = () => {
      if (document.hidden) {
        this.wasMutedBeforeHide = this.muted;
        this.setMuted(true, true);
      } else if (this.enabled) {
        this.setMuted(this.wasMutedBeforeHide, true);
      }
    };
  }

  async enable() {
    if (this.enabled) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("المتصفح لا يدعم تشغيل المايك هنا. افتح اللعبة من رابط HTTPS.");
    const response = await fetch(`/api/rooms/${this.roomCode}/ice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: this.getPlayerId() })
    });
    const config = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(config.error || "تعذر تجهيز اتصال الصوت");
    this.iceServers = Array.isArray(config.iceServers) && config.iceServers.length
      ? config.iceServers : this.iceServers;
    this.hasTurn = Boolean(config.turnAvailable);
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    this.enabled = true;
    this.muted = false;
    document.addEventListener("visibilitychange", this.onVisibility);
    await this.syncPeers(this.players);
    const queued = this.pendingSignals.splice(0);
    for (const item of queued) await this.handleSignal(item.from, item.signal);
    this.onStatus(this.hasTurn ? "on" : "direct-only");
  }

  setMuted(value, fromVisibility = false) {
    this.muted = Boolean(value);
    for (const track of this.stream?.getAudioTracks() || []) track.enabled = !this.muted;
    if (this.enabled) this.onStatus(this.muted ? (fromVisibility ? "background-muted" : "muted") : (this.hasTurn ? "on" : "direct-only"));
  }

  toggleMute() {
    if (!this.enabled) return;
    this.setMuted(!this.muted);
  }

  isPeerMuted(id) {
    return this.mutedPeers.has(id);
  }

  togglePeerMute(id) {
    if (this.mutedPeers.has(id)) this.mutedPeers.delete(id);
    else this.mutedPeers.add(id);
    const peer = this.peers.get(id);
    if (peer?.audio) peer.audio.muted = this.mutedPeers.has(id);
  }

  send(to, signal) {
    const socket = this.getSocket();
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "voice-signal", to, signal }));
  }

  async syncPeers(players = []) {
    this.players = players;
    if (!this.enabled) return;
    const myId = this.getPlayerId();
    const active = new Set(players.filter(p => p.connected && p.id !== myId).map(p => p.id));
    for (const [id, peer] of this.peers) {
      if (!active.has(id)) {
        peer.pc.close();
        peer.audio?.remove();
        this.peers.delete(id);
      }
    }
    for (const player of players) {
      if (!player.connected || player.id === myId) continue;
      const peer = this.getPeer(player.id);
      if (myId < player.id && !peer.offerStarted) {
        peer.offerStarted = true;
        try {
          const offer = await peer.pc.createOffer();
          await peer.pc.setLocalDescription(offer);
          this.send(player.id, { description: peer.pc.localDescription });
        } catch {
          peer.offerStarted = false;
        }
      }
    }
  }

  getPeer(id) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer = { pc, audio: null, offerStarted: false };
    this.peers.set(id, peer);
    for (const track of this.stream?.getTracks() || []) pc.addTrack(track, this.stream);
    pc.onicecandidate = event => {
      if (event.candidate) this.send(id, { candidate: event.candidate });
    };
    pc.ontrack = event => {
      if (!peer.audio) {
        peer.audio = document.createElement("audio");
        peer.audio.autoplay = true;
        peer.audio.playsInline = true;
        peer.audio.muted = this.mutedPeers.has(id);
        peer.audio.dataset.voicePeer = id;
        document.body.append(peer.audio);
      }
      if (event.streams?.[0]) {
        peer.audio.srcObject = event.streams[0];
        peer.audio.play().catch(() => {});
      }
    };
    return peer;
  }

  async handleSignal(from, signal) {
    if (!this.enabled) {
      this.pendingSignals.push({ from, signal });
      return;
    }
    const peer = this.getPeer(from);
    const pc = peer.pc;
    if (signal?.description) {
      await pc.setRemoteDescription(signal.description);
      if (signal.description.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send(from, { description: pc.localDescription });
      }
      const candidates = this.pendingCandidates.get(from) || [];
      this.pendingCandidates.delete(from);
      for (const candidate of candidates) await pc.addIceCandidate(candidate).catch(() => {});
      return;
    }
    if (signal?.candidate) {
      if (!pc.remoteDescription) {
        const list = this.pendingCandidates.get(from) || [];
        list.push(signal.candidate);
        this.pendingCandidates.set(from, list);
      } else {
        await pc.addIceCandidate(signal.candidate).catch(() => {});
      }
    }
  }

  close() {
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const peer of this.peers.values()) {
      peer.pc.close();
      peer.audio?.remove();
    }
    this.peers.clear();
    for (const track of this.stream?.getTracks() || []) track.stop();
    this.stream = null;
    this.enabled = false;
  }
}
