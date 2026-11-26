import { makeSet, shuffle, getLegalEnds, drawUntilPlayable, scoreHand, resolveBlockedRound, placeTile } from "./game-engine.js";

export const TURN_MS = 40_000;
export const HAND_SIZE = 7;

export function teamOf(mode, seat) {
  return mode === "2v2" ? seat % 2 : seat;
}

export function dealRound(players, mode, random = Math.random) {
  const deck = shuffle(makeSet(), random);
  const dealt = players.map((p, seat) => ({ ...p, seat, hand: deck.splice(0, HAND_SIZE) }));
  const doubles = dealt.flatMap(p => p.hand.filter(t => t.a === t.b).map(tile => ({ playerId:p.id, seat:p.seat, tile })))
    .sort((x,y) => y.tile.a-x.tile.a || x.seat-y.seat);
  let starter = doubles[0];
  if (!starter) {
    starter = dealt.flatMap(p => p.hand.map(tile => ({playerId:p.id,seat:p.seat,tile})))
      .sort((x,y) => (y.tile.a+y.tile.b)-(x.tile.a+x.tile.b) || x.seat-y.seat)[0];
  }
  return { players:dealt, boneyard:deck, board:[], currentPlayerId:starter.playerId,
    openingTileId:starter.tile.id, consecutivePasses:0, roundWinnerId:null };
}

export function publicMatch(room) {
  const match=room.match;
  if (!match) return null;
  return {
    board:match.board, boneyardCount:match.boneyard.length,
    currentPlayerId:match.currentPlayerId, turnDeadline:match.turnDeadline,
    consecutivePasses:match.consecutivePasses, roundNumber:match.roundNumber,
    scores:match.scores, status:match.status, lastMove:match.lastMove,
    roundResult:match.roundResult, target:room.target, mode:room.mode
  };
}

export function getPlayerHand(room, playerId) {
  return room.players.find(p=>p.id===playerId)?.hand || [];
}

export function chooseAutomaticMove(board, hand) {
  const legal = hand.flatMap(tile=>getLegalEnds(board,tile).map(end=>({tile,end})));
  legal.sort((x,y)=>(x.tile.a+x.tile.b)-(y.tile.a+y.tile.b) || x.tile.id.localeCompare(y.tile.id) || (x.end==="right"?-1:1));
  return legal[0] || null;
}

export function takeTurnTile(room, playerId, tileId, end) {
  const player=room.players.find(p=>p.id===playerId);
  if (!player || room.match.currentPlayerId!==playerId) throw new Error("مش دورك");
  const tile=player.hand.find(t=>t.id===tileId);
  if (!tile) throw new Error("الحجر مش في إيدك");
  const legal=getLegalEnds(room.match.board,tile);
  if (!legal.includes(end)) throw new Error("الحجر مش راكب في الناحية دي");
  room.match.board=placeTile(room.match.board,tile,end);
  player.hand=player.hand.filter(t=>t.id!==tileId);
  room.match.consecutivePasses=0;
  room.match.lastMove={playerId,name:player.name,tile:{...tile},end,at:Date.now()};
  return player;
}

export function calculateRoundAward(room, winnerIds, blocked = false) {
  const winnerSet=new Set(winnerIds);
  const winningTeam=room.mode==="2v2" ? room.players.find(p=>winnerSet.has(p.id))?.seat%2 : null;
  if(room.mode==="2v2"){
    return room.players.filter(p=>p.seat%2!==winningTeam).reduce((s,p)=>s+scoreHand(p.hand),0);
  }
  return room.players.filter(p=>!winnerSet.has(p.id)).reduce((s,p)=>s+scoreHand(p.hand),0);
}

export function blockedWinners(room) {
  const result=resolveBlockedRound(room.players.map(p=>({id:p.id,hand:p.hand})),room.match.board,room.match.boneyard);
  return result?.winnerIds || [];
}

export function applyRoundResult(room, winnerIds, blocked = false) {
  const points=calculateRoundAward(room,winnerIds,blocked);
  const winners=winnerIds.map(id=>room.players.find(p=>p.id===id)?.name||"");
  if(room.mode==="2v2"){
    const winningTeam=room.players.find(p=>winnerIds.includes(p.id))?.seat%2;
    const key=String(winningTeam);
    room.match.scores[key]=(room.match.scores[key]||0)+points;
    if(room.match.scores[key]>=room.target) room.match.status="match_over";
  } else {
    const key=winnerIds[0];
    room.match.scores[key]=(room.match.scores[key]||0)+points;
    if(room.match.scores[key]>=room.target) room.match.status="match_over";
  }
  room.match.roundResult={winnerIds,winners,points,blocked,at:Date.now()};
  room.match.status=room.match.status==="match_over"?"match_over":"round_over";
  return room.match.roundResult;
}

export function beginRound(room, random = Math.random) {
  const dealt=dealRound(room.players,room.mode,random);
  room.players=dealt.players;
  const scores=room.match?.scores||Object.fromEntries(room.players.map(p=>[room.mode==="2v2"?String(p.seat%2):p.id,0]));
  const starter=room.players.find(p=>p.id===dealt.currentPlayerId);
  const opening=starter.hand.find(t=>t.id===dealt.openingTileId);
  starter.hand=starter.hand.filter(t=>t.id!==dealt.openingTileId);
  dealt.board=[{...opening}];
  dealt.currentPlayerId=room.players[(starter.seat+1)%room.players.length].id;
  room.match={
    ...dealt,scores,roundNumber:(room.match?.roundNumber||0)+1,
    status:"playing",turnDeadline:0,
    lastMove:{playerId:starter.id,name:starter.name,tile:{...opening},end:"open",at:Date.now()},
    roundResult:null
  };
  return room.match;
}
