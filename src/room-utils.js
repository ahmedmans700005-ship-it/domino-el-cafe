export const MODE_LIMITS = Object.freeze({ "1v1": 2, "2v2": 4, "3free": 3, "4free": 4 });

export function normalizeRoomOptions(input = {}) {
  const mode = Object.hasOwn(MODE_LIMITS, input.mode) ? input.mode : "1v1";
  const target = Number(input.target) === 151 ? 151 : 101;
  return { mode, target, maxPlayers: MODE_LIMITS[mode] };
}

export function createRoomState(code, options = {}) {
  return {
    code,
    ...normalizeRoomOptions(options),
    status: "waiting",
    players: [],
    createdAt: Date.now(),
    chat: []
  };
}

export function cleanPlayerName(value) {
  return String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 18);
}

export function cleanChatMessage(value) {
  return String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 300);
}

export function roomSnapshot(room) {
  return {
    code: room.code,
    mode: room.mode,
    target: room.target,
    maxPlayers: room.maxPlayers,
    status: room.status,
    players: room.players.map(({ id, name, connected, joinedAt, seat, hand }) => ({
      id, name, connected, joinedAt, seat:seat??null, handCount:hand?.length??0,
      team:room.mode==="2v2"&&seat!==undefined?seat%2:null
    })),
    match: room.match ? {
      board:room.match.board, boneyardCount:room.match.boneyard.length,
      currentPlayerId:room.match.currentPlayerId, turnDeadline:room.match.turnDeadline,
      consecutivePasses:room.match.consecutivePasses, roundNumber:room.match.roundNumber,
      scores:room.match.scores, status:room.match.status, lastMove:room.match.lastMove,
      roundResult:room.match.roundResult, target:room.target, mode:room.mode
    } : null,
    chat: room.chat.slice(-30)
  };
}
