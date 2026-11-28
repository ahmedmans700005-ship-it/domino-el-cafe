import { drawUntilPlayable, getLegalEnds } from "./game-engine.js";
import { applyRoundResult, beginRound, blockedWinners, chooseAutomaticMove, takeTurnTile } from "./match-engine.js";
import { createRoomState } from "./room-utils.js";

const PLAYER_COUNTS = Object.freeze({ "1v1":2, "2v2":4, "3free":3, "4free":4 });

function seededRandom(seed) {
  let value = (Number(seed) >>> 0) || 1;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkTileIntegrity(room) {
  const all = [
    ...room.match.board,
    ...room.players.flatMap(player => player.hand),
    ...room.match.boneyard
  ];
  const ids = all.map(tile => tile.id);
  if (all.length !== 28 || new Set(ids).size !== 28) {
    throw new Error(`توزيع الأحجار غير سليم: ${all.length}/28 حجر`);
  }
  for (let i = 0; i < room.match.board.length - 1; i++) {
    if (room.match.board[i].b !== room.match.board[i + 1].a) {
      throw new Error("سلسلة الأحجار فيها طرف غير متصل");
    }
  }
}

export function simulateMatch({ mode = "1v1", target = 101, seed = 1, maxRounds = 250 } = {}) {
  const playerCount = PLAYER_COUNTS[mode];
  if (!playerCount) throw new Error("نظام لعب غير معروف");
  const room = createRoomState("SIM000", { mode, target });
  room.players = Array.from({ length: playerCount }, (_, seat) => ({
    id: `sim-${seat}`,
    name: mode === "2v2" ? `لاعب ${seat + 1}` : `لاعب ${seat + 1}`,
    seat,
    hand: [],
    connected: true
  }));

  const random = seededRandom(seed);
  const stats = { rounds: 0, moves: 0, drawn: 0, blockedRounds: 0, integrityChecks: 0 };
  let guard = 0;

  while (stats.rounds < maxRounds && guard < maxRounds * 1200) {
    beginRound(room, random);
    stats.rounds++;
    let roundFinished = false;

    while (room.match.status === "playing" && guard++ < maxRounds * 1200) {
      const player = room.players.find(p => p.id === room.match.currentPlayerId);
      if (!player) throw new Error("الدور الحالي لا يطابق لاعبًا موجودًا");

      const draw = drawUntilPlayable(player.hand, room.match.boneyard, room.match.board, random);
      player.hand = draw.hand;
      room.match.boneyard = draw.boneyard;
      stats.drawn += draw.drawn.length;
      checkTileIntegrity(room);
      stats.integrityChecks++;

      if (!draw.playable.length) {
        room.match.consecutivePasses++;
        if (room.match.consecutivePasses >= room.players.length) {
          const winners = blockedWinners(room);
          if (!winners.length) throw new Error("تم إعلان القفلة دون تحديد الفائز");
          applyRoundResult(room, winners, true);
          stats.blockedRounds++;
          roundFinished = true;
          break;
        }
        room.match.currentPlayerId = room.players[(player.seat + 1) % room.players.length].id;
        continue;
      }

      const move = chooseAutomaticMove(room.match.board, player.hand);
      if (!move) throw new Error("لم يتم اختيار حركة رغم وجود حجر صالح");
      takeTurnTile(room, player.id, move.tile.id, move.end);
      stats.moves++;
      checkTileIntegrity(room);
      stats.integrityChecks++;

      if (player.hand.length === 0) {
        applyRoundResult(room, [player.id], false);
        roundFinished = true;
        break;
      }
      room.match.currentPlayerId = room.players[(player.seat + 1) % room.players.length].id;
    }

    if (!roundFinished && room.match.status === "playing") {
      throw new Error("تجاوزت الجولة الحد الآمن من الحركات");
    }
    if (room.match.status === "match_over") break;
  }

  if (room.match.status !== "match_over") throw new Error("لم تنته المباراة قبل الحد الأقصى للجولات");
  const scores = room.match.scores || {};
  let winner;
  if (mode === "2v2") {
    winner = Number(scores["0"] || 0) >= Number(scores["1"] || 0) ? "فريق أ" : "فريق ب";
  } else {
    winner = room.players.reduce((best, player) =>
      Number(scores[player.id] || 0) > Number(scores[best.id] || 0) ? player : best, room.players[0]).name;
  }
  return {
    mode, target, seed, winner, scores, rounds: stats.rounds,
    moves: stats.moves, drawn: stats.drawn, blockedRounds: stats.blockedRounds,
    integrityChecks: stats.integrityChecks
  };
}

export function runSimulationBatch({ mode = "1v1", target = 101, games = 10, seed = 20261128 } = {}) {
  const count = Math.max(1, Math.min(100, Math.floor(Number(games) || 1)));
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(simulateMatch({ mode, target, seed: (Number(seed) + i * 7919) >>> 0 }));
  }
  return {
    mode, target, games: count, completed: results.length,
    totalRounds: results.reduce((sum, result) => sum + result.rounds, 0),
    totalMoves: results.reduce((sum, result) => sum + result.moves, 0),
    totalDrawn: results.reduce((sum, result) => sum + result.drawn, 0),
    blockedRounds: results.reduce((sum, result) => sum + result.blockedRounds, 0),
    integrityChecks: results.reduce((sum, result) => sum + result.integrityChecks, 0),
    winners: results.reduce((counts, result) => {
      counts[result.winner] = (counts[result.winner] || 0) + 1;
      return counts;
    }, {}),
    samples: results.slice(0, 12)
  };
}
